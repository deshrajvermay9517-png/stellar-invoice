import "server-only";
import { and, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { invoices, paymentAttempts, payments } from "../db/schema.ts";
import { retryDatabaseRead } from "../db/resilience.ts";

// Deliberate allowlist shared by public and merchant receipt reads. Never select *.
const receiptFields = {
  status: invoices.status,
  amountStroops: payments.amountStroops,
  asset: payments.asset,
  network: payments.network,
  sourceAccount: payments.sourceAccount,
  destinationAccount: payments.destinationAccount,
  transactionHash: payments.transactionHash,
  ledger: payments.ledger,
  ledgerClosedAt: payments.ledgerClosedAt,
  paymentReference: payments.paymentReference,
};

export function createReceiptStore<T extends Record<string, unknown>>(db: LibSQLDatabase<T>, authenticate: () => Promise<{ id: string } | null>) {
  function query() {
    return db.select(receiptFields).from(payments)
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .innerJoin(paymentAttempts, and(eq(payments.attemptId, paymentAttempts.id), eq(paymentAttempts.invoiceId, invoices.id), eq(payments.transactionHash, paymentAttempts.transactionHash)));
  }
  const verified = and(eq(invoices.status, "PAID"), eq(paymentAttempts.status, "VERIFIED"), eq(payments.network, "TESTNET"));
  return {
    async getPublicReceipt(token: string) {
      if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return undefined;
      return retryDatabaseRead(() => query().where(and(verified, eq(invoices.publicToken, token))).get());
    },
    async getMerchantReceipt(invoiceId: string) {
      const user = await authenticate();
      if (!user?.id) throw new Error("Authentication required.");
      return retryDatabaseRead(() => query().where(and(verified, eq(invoices.id, invoiceId), eq(invoices.ownerId, user.id))).get());
    },
  };
}

export type VerifiedReceipt = NonNullable<Awaited<ReturnType<ReturnType<typeof createReceiptStore>["getPublicReceipt"]>>>;
