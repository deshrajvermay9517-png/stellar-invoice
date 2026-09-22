import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { Account, Asset, Keypair, Memo, Networks, Operation, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { users, invoices, paymentAttempts, payments } from "../src/server/db/schema.ts";
import { createPaymentStore } from "../src/server/payments/store.ts";
import { buildPayment, validatePayment, parsePayment } from "../src/server/payments/transaction.ts";
import { paymentBody, paymentResponse } from "../src/server/payments/http.ts";
import { rpcTimestamp } from "../src/server/payments/rpc.ts";

// Deterministic, unfunded test-only keys. Never use these fixtures on a real account.
const payer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1));
const destination = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
const other = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey();
const now = new Date("2026-09-21T00:00:00Z");
const seconds = now.getTime() / 1000;
const token = "a".repeat(32);
const terms = { destinationAccount: destination, amountStroops: 123456789, paymentReference: "fixture-payment-ref", network: "TESTNET", asset: "XLM" };
const hash = (transaction) => Buffer.from(transaction.hash()).toString("hex");
function expected(transaction, override = {}) {
  return { ...terms, sourceAccount: payer.publicKey(), transactionHash: hash(transaction), unsignedXdr: transaction.toXDR(), ...override };
}
function transaction(overrides = {}) {
  const options = { source: payer.publicKey(), destination, amount: "12.3456789", memo: Memo.text(terms.paymentReference), asset: Asset.native(), network: Networks.TESTNET, fee: "100", count: 1, ...overrides };
  const builder = new TransactionBuilder(new Account(options.source, "100"), {
    fee: options.fee, networkPassphrase: options.network, memo: options.memo,
    timebounds: { minTime: seconds - 30, maxTime: seconds + 300 },
  });
  for (let i = 0; i < options.count; i++) builder.addOperation(Operation.payment({ destination: options.destination, amount: options.amount, asset: options.asset, source: options.operationSource }));
  return builder.build();
}
function resultXdr(success = true) {
  return new xdr.TransactionResult({ feeCharged: 100n,
    result: success ? new xdr.TransactionResultResultTxSuccess([new xdr.OperationResultOpInner(new xdr.OperationResultTrPayment(xdr.PaymentResult.paymentSuccess()))])
      : new xdr.TransactionResultResultTxFailed([new xdr.OperationResultOpInner(new xdr.OperationResultTrPayment(xdr.PaymentResult.paymentUnderfunded()))]),
    ext: new xdr.TransactionResultExtV0() });
}
function rpcResult(tx, status = "SUCCESS", patch = {}) {
  return { status, txHash: hash(tx), latestLedger: 100, latestLedgerCloseTime: seconds + 10, oldestLedger: 1, oldestLedgerCloseTime: seconds - 1000,
    ledger: 99, createdAt: seconds + 5, feeBump: false, envelopeXdr: tx.toEnvelope(), resultXdr: resultXdr(status === "SUCCESS"), ...patch };
}
async function fixture(t, concurrent = false) {
  // A file database permits independent transaction connections; :memory: has
  // only one connection and cannot model concurrent remote Turso transactions.
  const directory = concurrent ? await mkdtemp(join(tmpdir(), "stellarinvoice-payments-")) : null;
  const client = createClient({ url: directory ? pathToFileURL(join(directory, "test.db")).href : ":memory:" });
  t.after(async () => {
    client.close();
    if (directory && dirname(resolve(directory)) === resolve(tmpdir()) && basename(directory).startsWith("stellarinvoice-payments-")) await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  await client.execute("PRAGMA foreign_keys = ON");
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(users).values({ id: "merchant", receivingAccount: destination });
  await db.insert(invoices).values({ ...terms, id: "invoice", ownerId: "merchant", publicToken: token,
    customerName: "Private customer", customerEmail: "private@example.test", description: "Test work", dueDate: "2026-10-01", status: "OPEN", createdAt: now });
  let time = now;
  const rpc = {
    getNetwork: async () => ({ passphrase: Networks.TESTNET }),
    getAccount: async (source) => new Account(source, "100"),
    getTransaction: async (txHash) => ({ status: "NOT_FOUND", txHash, oldestLedgerCloseTime: seconds - 1000, latestLedgerCloseTime: seconds + 10 }),
    sendTransaction: async (tx) => ({ status: "PENDING", hash: hash(tx) }),
  };
  const store = createPaymentStore(db, rpc, () => time);
  async function prepared() {
    const attempt = await store.prepare(token, payer.publicKey());
    const signed = parsePayment(attempt.unsignedXdr);
    signed.sign(payer);
    return { ...attempt, signed };
  }
  return { db, client, rpc, store, prepared, setTime: (date) => { time = date; } };
}

test("constructs exactly one bounded Testnet native XLM payment with exact memo and stroops", () => {
  const tx = buildPayment(new Account(payer.publicKey(), "100"), terms, now);
  assert.equal(tx.networkPassphrase, Networks.TESTNET);
  assert.equal(tx.sequence, "101");
  assert.equal(tx.fee, "100");
  assert.equal(tx.timeBounds.maxTime, String(seconds + 300));
  assert.equal(tx.operations.length, 1);
  assert.equal(tx.operations[0].amount, "12.3456789");
  assert.equal(tx.operations[0].destination, destination);
  assert.equal(tx.operations[0].asset.isNative(), true);
  assert.equal(Buffer.from(tx.memo.value).toString(), terms.paymentReference);
  assert.equal(validatePayment(tx.toXDR(), expected(tx)).source, payer.publicKey());
});
for (const [name, mutation] of Object.entries({
  destination: { destination: other }, amount: { amount: "12.3456788" }, memo: { memo: Memo.text("wrong") },
  asset: { asset: new Asset("FAKE", other) }, "extra operation": { count: 2 }, source: { source: other },
  "operation source": { operationSource: payer.publicKey() }, "wrong memo type": { memo: Memo.id("123") }, fee: { fee: "100000" },
})) {
  test(`integrity rejects wrong ${name}, even with a matching hash for the malformed body`, () => {
    const tx = transaction(mutation);
    assert.throws(() => validatePayment(tx.toXDR(), expected(tx)));
  });
}
test("rejects Mainnet hash, wrong expected network, altered sequence and missing signatures", () => {
  const tx = transaction();
  assert.throws(() => validatePayment(tx.toXDR(), expected(transaction({ network: Networks.PUBLIC }))));
  assert.throws(() => validatePayment(tx.toXDR(), expected(tx, { network: "MAINNET" })));
  const changed = buildPayment(new Account(payer.publicKey(), "101"), terms, now);
  assert.throws(() => validatePayment(changed.toXDR(), expected(tx)));
  assert.throws(() => validatePayment(tx.toXDR(), expected(tx), true));
});
test("rejects invalid XDR and unsupported fee-bump envelopes", () => {
  for (const value of ["", "garbage", "AAAA", "A".repeat(16001), null]) assert.throws(() => parsePayment(value));
  const tx = transaction(); tx.sign(payer);
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(payer, "100", tx, Networks.TESTNET);
  assert.throws(() => parsePayment(feeBump.toXDR()));
});
test("prepare persists before returning and reuses one active attempt", async (t) => {
  const { store, db, prepared } = await fixture(t);
  const attempt = await prepared();
  assert.equal((await db.select().from(paymentAttempts)).length, 1);
  assert.equal((await store.prepare(token, payer.publicKey())).attemptId, attempt.attemptId);
  await assert.rejects(() => store.prepare(token, other), /ACTIVE_ATTEMPT_EXISTS/);
  assert.equal((await db.select().from(paymentAttempts))[0].transactionHash, hash(attempt.signed));
});
test("prepare rejects invalid/same source, missing source account and paid invoice", async (t) => {
  const { store, rpc, db } = await fixture(t);
  await assert.rejects(() => store.prepare(token, destination), /SOURCE_EQUALS_DESTINATION/);
  await assert.rejects(() => store.prepare(token, "invalid"), /INVALID_ACCOUNT/);
  rpc.getAccount = async () => { throw new Error("missing"); };
  await assert.rejects(() => store.prepare(token, payer.publicKey()), /SOURCE_ACCOUNT_UNAVAILABLE/);
  assert.equal((await db.select().from(paymentAttempts)).length, 0);
  await db.update(invoices).set({ status: "PAID", paidAt: now });
  await assert.rejects(() => store.prepare(token, payer.publicKey()), /INVOICE_ALREADY_PAID/);
});
test("all trusted network operations fail closed on wrong RPC network", async (t) => {
  const { prepared, rpc, store } = await fixture(t);
  const attempt = await prepared();
  rpc.getNetwork = async () => ({ passphrase: Networks.PUBLIC });
  await assert.rejects(() => store.prepare(token, payer.publicKey()), /RPC_NETWORK_MISMATCH/);
  await assert.rejects(() => store.submit(token, attempt.attemptId, attempt.signed.toXDR()), /RPC_NETWORK_MISMATCH/);
  await assert.rejects(() => store.verify(token, attempt.attemptId), /RPC_NETWORK_MISMATCH/);
});
test("submit saves signed envelope before network side effect; acknowledgement never pays", async (t) => {
  const { prepared, rpc, store, db } = await fixture(t);
  const attempt = await prepared();
  rpc.sendTransaction = async (tx) => {
    const saved = (await db.select().from(paymentAttempts))[0];
    assert.equal(saved.signedXdr, attempt.signed.toXDR());
    assert.equal(saved.status, "UNKNOWN");
    assert.ok(saved.submittedAt);
    return { status: "PENDING", hash: hash(tx) };
  };
  const result = await store.submit(token, attempt.attemptId, attempt.signed.toXDR());
  assert.equal(result.status, "SUBMITTED");
  assert.equal(result.invoiceStatus, "OPEN");
  assert.equal((await db.select().from(payments)).length, 0);
});
test("atomic settlement, repeat verification and repeated submit are idempotent", async (t) => {
  const { prepared, rpc, store, db } = await fixture(t);
  const attempt = await prepared();
  rpc.getTransaction = async () => rpcResult(attempt.signed);
  const first = await store.verify(token, attempt.attemptId);
  assert.equal(first.status, "VERIFIED"); assert.equal(first.invoiceStatus, "PAID");
  assert.equal(first.receipt.ledger, 99);
  assert.deepEqual(await store.verify(token, attempt.attemptId), first);
  assert.deepEqual(await store.submit(token, attempt.attemptId, attempt.signed.toXDR()), first);
  assert.equal((await db.select().from(payments)).length, 1);
  assert.equal((await db.select().from(invoices))[0].paidAt.getTime(), (seconds + 5) * 1000);
});
test("settlement rollback leaves no payment or PAID invoice when final attempt update fails", async (t) => {
  const { prepared, rpc, store, db, client } = await fixture(t);
  const attempt = await prepared(); rpc.getTransaction = async () => rpcResult(attempt.signed);
  await client.execute("CREATE TRIGGER fail_settlement BEFORE UPDATE ON payment_attempts WHEN NEW.status = 'VERIFIED' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
  await assert.rejects(() => store.verify(token, attempt.attemptId));
  assert.equal((await db.select().from(payments)).length, 0);
  assert.equal((await db.select().from(invoices))[0].status, "OPEN");
  assert.equal((await db.select().from(paymentAttempts))[0].status, "PREPARED");
});
test("database rejects duplicate hashes, multiple active attempts, and duplicate settlements", async (t) => {
  const { prepared, rpc, store, db } = await fixture(t);
  const attempt = await prepared();
  const saved = (await db.select().from(paymentAttempts))[0];
  await assert.rejects(() => db.insert(paymentAttempts).values({ ...saved, id: "duplicate", status: "FAILED" }));
  await assert.rejects(() => db.insert(paymentAttempts).values({ ...saved, id: "second-active", transactionHash: "b".repeat(64) }));
  rpc.getTransaction = async () => rpcResult(attempt.signed);
  await store.verify(token, attempt.attemptId);
  const receipt = (await db.select().from(payments))[0];
  await assert.rejects(() => db.insert(payments).values({ ...receipt, id: "duplicate-receipt" }));
});
test("attempt IDs cannot be reused through another invoice public token", async (t) => {
  const { prepared, rpc, store, db } = await fixture(t);
  const attempt = await prepared();
  const original = (await db.select().from(invoices))[0];
  await db.insert(invoices).values({ ...original, id: "other", publicToken: "b".repeat(32), paymentReference: "other-reference" });
  for (const call of [() => store.status("b".repeat(32), attempt.attemptId), () => store.verify("b".repeat(32), attempt.attemptId), () => store.submit("b".repeat(32), attempt.attemptId, attempt.signed.toXDR())]) await assert.rejects(call, /NOT_FOUND/);
  const second = await store.prepare("b".repeat(32), payer.publicKey());
  rpc.getTransaction = async () => rpcResult(attempt.signed);
  await assert.rejects(() => store.verify("b".repeat(32), second.attemptId), /RPC_TRANSACTION_MISMATCH/);
  assert.equal((await db.select().from(payments)).length, 0);
});
test("RPC failures and unknown transactions stay unresolved without replacement attempts", async (t) => {
  const { prepared, rpc, store, db } = await fixture(t);
  const attempt = await prepared();
  rpc.sendTransaction = async () => { throw new Error("timeout"); };
  assert.equal((await store.submit(token, attempt.attemptId, attempt.signed.toXDR())).status, "UNKNOWN");
  assert.equal((await store.verify(token, attempt.attemptId)).status, "UNKNOWN");
  rpc.getTransaction = async () => { throw new Error("RPC down"); };
  assert.equal((await store.verify(token, attempt.attemptId)).errorCode, "RPC_UNAVAILABLE");
  assert.equal((await store.prepare(token, payer.publicKey())).attemptId, attempt.attemptId);
  assert.equal((await db.select().from(paymentAttempts)).length, 1);
  assert.equal((await db.select().from(invoices))[0].status, "OPEN");
});
test("expiry requires RPC history coverage; wall clock and truncated history cannot release an attempt", async (t) => {
  const { prepared, rpc, store, setTime } = await fixture(t);
  const attempt = await prepared(); setTime(new Date((seconds + 400) * 1000));
  assert.equal((await store.prepare(token, payer.publicKey())).requiresRecheck, true);
  rpc.getTransaction = async () => ({ status: "NOT_FOUND", txHash: attempt.transactionHash, oldestLedgerCloseTime: seconds + 1, latestLedgerCloseTime: seconds + 400 });
  assert.equal((await store.verify(token, attempt.attemptId)).status, "UNKNOWN");
  rpc.getTransaction = async () => ({ status: "NOT_FOUND", txHash: attempt.transactionHash, oldestLedgerCloseTime: seconds - 1000, latestLedgerCloseTime: seconds + 400 });
  assert.equal((await store.verify(token, attempt.attemptId)).status, "EXPIRED");
  assert.notEqual((await store.prepare(token, payer.publicKey())).attemptId, attempt.attemptId);
});
test("definitive ledger failure does not pay and allows a fresh prepared attempt", async (t) => {
  const { prepared, rpc, store, db } = await fixture(t);
  const attempt = await prepared();
  rpc.getTransaction = async () => rpcResult(attempt.signed, "FAILED");
  assert.equal((await store.verify(token, attempt.attemptId)).status, "FAILED");
  rpc.getAccount = async (source) => new Account(source, "101");
  assert.notEqual((await store.prepare(token, payer.publicKey())).attemptId, attempt.attemptId);
  assert.equal((await db.select().from(payments)).length, 0);
});
test("forged RPC success with mismatching body/result or invalid ledger cannot settle", async (t) => {
  const { prepared, rpc, store, db } = await fixture(t);
  const attempt = await prepared();
  const wrong = transaction({ destination: other }); wrong.sign(payer);
  for (const patch of [{ envelopeXdr: wrong.toEnvelope() }, { resultXdr: resultXdr(false) }, { ledger: 0 }, { createdAt: seconds + 500 }, { feeBump: true }]) {
    rpc.getTransaction = async () => rpcResult(attempt.signed, "SUCCESS", patch);
    await assert.rejects(() => store.verify(token, attempt.attemptId));
  }
  assert.equal((await db.select().from(payments)).length, 0);
});
test("already-paid invoices reject a different unsettled attempt", async (t) => {
  const { prepared, rpc, store, db } = await fixture(t);
  const attempt = await prepared();
  await db.update(invoices).set({ status: "PAID", paidAt: now }).where(eq(invoices.id, "invoice"));
  rpc.getTransaction = async () => rpcResult(attempt.signed);
  await assert.rejects(() => store.verify(token, attempt.attemptId), /INVOICE_ALREADY_PAID/);
  assert.equal((await db.select().from(payments)).length, 0);
});
test("safe status projection never includes customer, owner, source or signed envelopes", async (t) => {
  const { store, prepared } = await fixture(t);
  const attempt = await prepared();
  const status = await store.status(token, attempt.attemptId);
  assert.deepEqual(Object.keys(status).sort(), ["attemptId", "errorCode", "expiresAt", "invoiceStatus", "receipt", "status", "transactionHash"].sort());
  assert.equal(JSON.stringify(status).includes("private@example.test"), false);
});
test("HTTP boundary rejects authoritative client terms, oversized bodies, and cross-site writes", async () => {
  const request = (body, headers = {}) => new Request("http://localhost:3000/api/pay/test", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  assert.deepEqual(await paymentBody(request({ sourceAccount: payer.publicKey() }), ["sourceAccount"]), { sourceAccount: payer.publicKey() });
  for (const body of [{ sourceAccount: payer.publicKey(), amount: "1" }, { sourceAccount: payer.publicKey(), destinationAccount: other }, { success: true }, null]) await assert.rejects(() => paymentBody(request(body), ["sourceAccount"]));
  await assert.rejects(() => paymentBody(request({ signedXdr: "x".repeat(25000) }), ["signedXdr"]), /BODY_TOO_LARGE/);
  await assert.rejects(() => paymentBody(request({}, { origin: "https://attacker.example" }), []), /INVALID_ORIGIN/);
  const response = await paymentResponse(async () => { throw new Error("secret database details"); });
  assert.deepEqual(await response.json(), { error: "PAYMENT_SERVICE_UNAVAILABLE" });
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("real RPC decimal-string timestamps support settlement and safe expiry", async (t) => {
  const { store, prepared, rpc } = await fixture(t);
  const attempt = await prepared();
  rpc.getTransaction = async () => rpcResult(attempt.signed, "SUCCESS", { createdAt: String(seconds + 5) });
  assert.equal((await store.verify(token, attempt.attemptId)).invoiceStatus, "PAID");
  assert.equal(rpcTimestamp(String(seconds)), seconds);
  for (const value of [null, undefined, "", "0", 0, -1, "1e9", " 123", "NaN", "99999999999999999999", 1.5]) assert.equal(rpcTimestamp(value), undefined);
});

test("simultaneous verification credits only once", async (t) => {
  const { store, prepared, rpc, db } = await fixture(t, true);
  const attempt = await prepared();
  rpc.getTransaction = async () => rpcResult(attempt.signed);
  const results = await Promise.allSettled([store.verify(token, attempt.attemptId), store.verify(token, attempt.attemptId)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2, results.filter((r) => r.status === "rejected").map((r) => String(r.reason)).join("; "));
  assert.equal((await db.select().from(payments)).length, 1);
  assert.equal((await store.verify(token, attempt.attemptId)).status, "VERIFIED");
});

test("a late submit acknowledgement cannot downgrade VERIFIED", async (t) => {
  const { store, prepared, rpc } = await fixture(t);
  const attempt = await prepared();
  rpc.getTransaction = async () => rpcResult(attempt.signed);
  rpc.sendTransaction = async (tx) => {
    await store.verify(token, attempt.attemptId);
    return { hash: hash(tx), status: "PENDING" };
  };
  assert.equal((await store.submit(token, attempt.attemptId, attempt.signed.toXDR())).status, "VERIFIED");
});

test("public invoice status recovers attempt identity without revealing payer or XDR", async (t) => {
  const { store, prepared } = await fixture(t);
  assert.deepEqual(await store.invoiceStatus(token), { invoiceStatus: "OPEN", attempt: null });
  const attempt = await prepared();
  const status = await store.invoiceStatus(token);
  assert.equal(status.attempt.attemptId, attempt.attemptId);
  assert.equal(JSON.stringify(status).includes(payer.publicKey()), false);
  assert.equal(JSON.stringify(status).includes(attempt.unsignedXdr), false);
  await assert.rejects(() => store.invoiceStatus("z".repeat(32)), /NOT_FOUND/);
});
