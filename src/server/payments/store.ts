import "server-only";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { invoices, paymentAttempts, payments } from "../db/schema.ts";
import { retryDatabaseRead } from "../db/resilience.ts";
import { assertTestnet, rpcTimestamp, type PaymentRpc } from "./rpc.ts";
import { buildPayment, FEE_STROOPS, publicAccount, validatePayment } from "./transaction.ts";
import { PaymentError } from "./errors.ts";

const active = ["PREPARED", "SUBMITTED", "UNKNOWN"] as const;
type Attempt = typeof paymentAttempts.$inferSelect;
type Invoice = typeof invoices.$inferSelect;

function expected(invoice: Invoice, attempt: Attempt) {
  return { ...invoice, sourceAccount: attempt.sourceAccount, transactionHash: attempt.transactionHash, unsignedXdr: attempt.unsignedXdr };
}
function checkToken(token: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new PaymentError("NOT_FOUND", 404);
}

async function retryLocked<T>(work: () => Promise<T>): Promise<T> {
  for (let retry = 0; ; retry++) {
    try { return await work(); }
    catch (error) {
      let cause: unknown = error;
      let locked = false;
      for (let depth = 0; depth < 4 && cause && typeof cause === "object"; depth++) {
        if ("code" in cause && ["SQLITE_BUSY", "SQLITE_LOCKED", "TRANSACTION_ACTIVE"].includes(String(cause.code))) locked = true;
        cause = "cause" in cause ? cause.cause : undefined;
      }
      if (!locked || retry >= 3) throw error;
      // Retry only database lock contention, never network submission. Each
      // transaction re-reads state and recognizes a competing verified payment.
      await delay(25 * (retry + 1));
    }
  }
}

export function createPaymentStore<TSchema extends Record<string, unknown>>(
  db: LibSQLDatabase<TSchema>, rpc: PaymentRpc, clock: () => Date = () => new Date(),
) {
  async function load(token: string, attemptId: string) {
    checkToken(token);
    const row = await db.select({ invoice: invoices, attempt: paymentAttempts }).from(paymentAttempts)
      .innerJoin(invoices, eq(paymentAttempts.invoiceId, invoices.id))
      .where(and(eq(invoices.publicToken, token), eq(paymentAttempts.id, attemptId))).get();
    if (!row) throw new PaymentError("NOT_FOUND", 404);
    return row;
  }
  async function status(token: string, attemptId: string) {
    const { invoice, attempt } = await load(token, attemptId);
    const receipt = await db.select({ transactionHash: payments.transactionHash, ledger: payments.ledger, ledgerClosedAt: payments.ledgerClosedAt })
      .from(payments).where(and(eq(payments.invoiceId, invoice.id), eq(payments.attemptId, attempt.id))).get();
    return { attemptId: attempt.id, status: attempt.status, invoiceStatus: invoice.status, transactionHash: attempt.transactionHash,
      expiresAt: attempt.expiresAt.toISOString(), errorCode: attempt.errorCode, receipt: receipt ?? null };
  }
  async function state(id: string, next: Attempt["status"], errorCode: string | null) {
    // Late RPC responses may never downgrade a terminal attempt or verified payment.
    await db.update(paymentAttempts).set({ status: next, errorCode, lastCheckedAt: clock() })
      .where(and(eq(paymentAttempts.id, id), inArray(paymentAttempts.status, [...active])));
  }
  async function invoiceStatus(token: string) {
    checkToken(token);
    const invoice = await db.select({ id: invoices.id, status: invoices.status }).from(invoices).where(eq(invoices.publicToken, token)).get();
    if (!invoice) throw new PaymentError("NOT_FOUND", 404);
    const latest = await db.select({ id: paymentAttempts.id }).from(paymentAttempts).where(eq(paymentAttempts.invoiceId, invoice.id))
      .orderBy(sql`CASE WHEN ${paymentAttempts.status} = 'VERIFIED' THEN 0 WHEN ${paymentAttempts.status} IN ('PREPARED', 'SUBMITTED', 'UNKNOWN') THEN 1 ELSE 2 END`, desc(paymentAttempts.createdAt), desc(paymentAttempts.id)).limit(1).get();
    return { invoiceStatus: invoice.status, attempt: latest ? await status(token, latest.id) : null };
  }
  async function prepare(token: string, value: unknown) {
    checkToken(token);
    const source = publicAccount(value);
    const invoice = await db.select().from(invoices).where(eq(invoices.publicToken, token)).get();
    if (!invoice) throw new PaymentError("NOT_FOUND", 404);
    if (invoice.status !== "OPEN") throw new PaymentError("INVOICE_ALREADY_PAID", 409);
    publicAccount(invoice.destinationAccount);
    if (source === invoice.destinationAccount) throw new PaymentError("SOURCE_EQUALS_DESTINATION");
    await assertTestnet(rpc);
    const existing = await db.select().from(paymentAttempts).where(and(eq(paymentAttempts.invoiceId, invoice.id), inArray(paymentAttempts.status, [...active]))).get();
    const prepared = (attempt: Attempt) => {
      if (attempt.sourceAccount !== source) throw new PaymentError("ACTIVE_ATTEMPT_EXISTS", 409);
      validatePayment(attempt.unsignedXdr, expected(invoice, attempt));
      // Recover the persisted ID even after reload/expiry. This never replaces it;
      // the client must recheck before signing or requesting a fresh attempt.
      return { attemptId: attempt.id, transactionHash: attempt.transactionHash, unsignedXdr: attempt.unsignedXdr,
        network: "TESTNET", status: attempt.status, requiresRecheck: attempt.status !== "PREPARED" || attempt.expiresAt <= clock(), expiresAt: attempt.expiresAt.toISOString(),
        review: { sourceAccount: attempt.sourceAccount, destinationAccount: invoice.destinationAccount, amountStroops: invoice.amountStroops,
          asset: invoice.asset, network: invoice.network, paymentReference: invoice.paymentReference, feeStroops: Number(FEE_STROOPS) } };
    };
    if (existing) return prepared(existing);
    let account;
    try { account = await rpc.getAccount(source); }
    catch { throw new PaymentError("SOURCE_ACCOUNT_UNAVAILABLE", 503); }
    if (account.accountId() !== source) throw new PaymentError("RPC_ACCOUNT_MISMATCH", 503);
    const now = clock();
    const transaction = buildPayment(account, invoice, now);
    const attempt: Attempt = { id: randomUUID(), invoiceId: invoice.id, sourceAccount: source,
      transactionHash: Buffer.from(transaction.hash()).toString("hex"), unsignedXdr: transaction.toXDR(), signedXdr: null,
      status: "PREPARED", expiresAt: new Date(Number(transaction.timeBounds!.maxTime) * 1000),
      submittedAt: null, lastCheckedAt: null, errorCode: null, createdAt: now };
    return retryLocked(() => db.transaction(async (tx) => {
      const current = await tx.select().from(invoices).where(eq(invoices.id, invoice.id)).get();
      if (!current || current.status !== "OPEN") throw new PaymentError("INVOICE_ALREADY_PAID", 409);
      validatePayment(attempt.unsignedXdr, expected(current, attempt));
      const racing = await tx.select().from(paymentAttempts).where(and(eq(paymentAttempts.invoiceId, invoice.id), inArray(paymentAttempts.status, [...active]))).get();
      if (racing) return prepared(racing);
      await tx.insert(paymentAttempts).values(attempt);
      return prepared(attempt);
    }, { behavior: "immediate" }));
  }

  async function verify(token: string, attemptId: string) {
    const { invoice, attempt } = await load(token, attemptId);
    if (attempt.status === "VERIFIED") return status(token, attemptId);
    await assertTestnet(rpc);
    let result;
    try { result = await rpc.getTransaction(attempt.transactionHash); }
    catch { await state(attempt.id, "UNKNOWN", "RPC_UNAVAILABLE"); return status(token, attemptId); }
    if (result.txHash !== attempt.transactionHash) throw new PaymentError("RPC_TRANSACTION_MISMATCH", 503);
    if (result.status === "NOT_FOUND") {
      const original = validatePayment(attempt.unsignedXdr, expected(invoice, attempt));
      // Only a retained history covering the ENTIRE validity interval, with a
      // closed ledger beyond maxTime, can prove this hash can no longer settle.
      const min = Number(original.timeBounds!.minTime);
      const max = Number(original.timeBounds!.maxTime);
      const oldest = rpcTimestamp(result.oldestLedgerCloseTime);
      const latest = rpcTimestamp(result.latestLedgerCloseTime);
      const provenExpired = oldest !== undefined && latest !== undefined && oldest <= min && latest > max;
      await state(attempt.id, provenExpired ? "EXPIRED" : "UNKNOWN", provenExpired ? "EXPIRED_UNPAID" : "TRANSACTION_NOT_FOUND");
      return status(token, attemptId);
    }
    if (result.status !== "SUCCESS" && result.status !== "FAILED") throw new PaymentError("RPC_INVALID_RESPONSE", 503);
    const transaction = validatePayment(result.envelopeXdr.toXDR("base64"), expected(invoice, attempt), true);
    if (result.feeBump) throw new PaymentError("UNSUPPORTED_ENVELOPE");
    if (result.status === "FAILED") {
      if (result.resultXdr.result.type !== "txFailed") throw new PaymentError("RPC_INVALID_RESPONSE", 503);
      await state(attempt.id, "FAILED", "TRANSACTION_FAILED");
      return status(token, attemptId);
    }
    const txResult = result.resultXdr.result;
    const closedAt = rpcTimestamp(result.createdAt);
    if (txResult.type !== "txSuccess" || txResult.results.length !== 1 ||
        txResult.results[0].type !== "opInner" || txResult.results[0].tr.type !== "payment" ||
        txResult.results[0].tr.paymentResult.type !== "paymentSuccess" ||
        !Number.isSafeInteger(result.ledger) || result.ledger <= 0 || closedAt === undefined ||
        closedAt < Number(transaction.timeBounds!.minTime) || closedAt > Number(transaction.timeBounds!.maxTime)) {
      throw new PaymentError("RPC_INVALID_RESPONSE", 503);
    }
    await retryLocked(() => db.transaction(async (tx) => {
      const previous = await tx.select().from(payments).where(eq(payments.transactionHash, attempt.transactionHash)).get();
      if (previous) {
        if (previous.invoiceId !== invoice.id || previous.attemptId !== attempt.id) throw new PaymentError("TRANSACTION_ALREADY_CREDITED", 409);
        return;
      }
      const current = await tx.select().from(invoices).where(eq(invoices.id, invoice.id)).get();
      if (!current || current.status !== "OPEN") throw new PaymentError("INVOICE_ALREADY_PAID", 409);
      validatePayment(result.envelopeXdr.toXDR("base64"), expected(current, attempt), true);
      const verifiedAt = clock();
      await tx.insert(payments).values({ id: randomUUID(), invoiceId: current.id, attemptId: attempt.id,
        transactionHash: attempt.transactionHash, network: "TESTNET", sourceAccount: attempt.sourceAccount,
        destinationAccount: current.destinationAccount, amountStroops: current.amountStroops, asset: "XLM",
        paymentReference: current.paymentReference, ledger: result.ledger,
        ledgerClosedAt: new Date(closedAt * 1000), verifiedAt });
      const changed = await tx.update(invoices).set({ status: "PAID", paidAt: new Date(closedAt * 1000) })
        .where(and(eq(invoices.id, current.id), eq(invoices.status, "OPEN"))).returning({ id: invoices.id });
      if (changed.length !== 1) throw new PaymentError("SETTLEMENT_CONFLICT", 409);
      await tx.update(paymentAttempts).set({ status: "VERIFIED", lastCheckedAt: verifiedAt, errorCode: null }).where(eq(paymentAttempts.id, attempt.id));
    }, { behavior: "immediate" }));
    return status(token, attemptId);
  }

  async function submit(token: string, attemptId: string, signedXdr: unknown) {
    const { invoice, attempt } = await load(token, attemptId);
    const transaction = validatePayment(signedXdr, expected(invoice, attempt), true);
    if (attempt.status === "VERIFIED") return status(token, attemptId);
    if (invoice.status !== "OPEN") throw new PaymentError("INVOICE_ALREADY_PAID", 409);
    if (!active.some((value) => value === attempt.status) || attempt.expiresAt <= clock()) throw new PaymentError("RECHECK_REQUIRED", 409);
    await assertTestnet(rpc);
    // Persist before any network side effect, so process crashes/timeouts recover
    // by the same hash. Retrying can only submit this exact transaction body.
    await retryLocked(() => db.transaction(async (tx) => {
      const current = await tx.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, invoice.id)).get();
      if (current?.status !== "OPEN") throw new PaymentError("INVOICE_ALREADY_PAID", 409);
      const saved = await tx.update(paymentAttempts).set({ signedXdr: transaction.toXDR(), status: "UNKNOWN", submittedAt: attempt.submittedAt ?? clock(), errorCode: null })
        .where(and(eq(paymentAttempts.id, attempt.id), inArray(paymentAttempts.status, [...active]))).returning({ id: paymentAttempts.id });
      if (saved.length !== 1) throw new PaymentError("RECHECK_REQUIRED", 409);
    }, { behavior: "immediate" }));
    try {
      const response = await rpc.sendTransaction(transaction);
      if (response.hash !== attempt.transactionHash) { await state(attempt.id, "UNKNOWN", "RPC_TRANSACTION_MISMATCH"); }
      else if (response.status === "PENDING" || response.status === "DUPLICATE") { await state(attempt.id, "SUBMITTED", null); }
      else { await state(attempt.id, "UNKNOWN", response.status === "ERROR" ? "SUBMISSION_REJECTED_RECHECK" : "SUBMISSION_UNCERTAIN"); }
    } catch { await state(attempt.id, "UNKNOWN", "SUBMISSION_UNCERTAIN"); }
    return status(token, attemptId);
  }
  return { prepare, submit, verify, status, invoiceStatus: (token: string) => retryDatabaseRead(() => invoiceStatus(token)) };
}
