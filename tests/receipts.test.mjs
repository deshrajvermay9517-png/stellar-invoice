import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { invoices, users, paymentAttempts, payments } from "../src/server/db/schema.ts";
import { createReceiptStore } from "../src/server/payments/receipts.ts";
import { testnetExplorerUrl } from "../src/lib/stellar-network.ts";

const payer = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const destination = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
async function fixture(t) {
  const client = createClient({ url: ":memory:" }); t.after(() => client.close());
  const db = drizzle(client); await migrate(db, { migrationsFolder: "./drizzle" });
  const now = new Date("2026-09-21T12:00:00Z");
  await db.insert(users).values({ id: "merchant", email: "merchant-private@example.test" });
  await db.insert(invoices).values({ id: "invoice-private", ownerId: "merchant", publicToken: "r".repeat(32), paymentReference: "public-reference", customerName: "Private customer",
    customerEmail: "customer-private@example.test", description: "Work", amountStroops: 10000000, dueDate: "2026-10-01", destinationAccount: destination, network: "TESTNET", asset: "XLM", status: "PAID", paidAt: now, createdAt: now });
  await db.insert(paymentAttempts).values({ id: "attempt-private", invoiceId: "invoice-private", sourceAccount: payer, transactionHash: "a".repeat(64),
    unsignedXdr: "opaque-unsigned-fixture", signedXdr: "opaque-signed-fixture", status: "VERIFIED", expiresAt: now, createdAt: now });
  await db.insert(payments).values({ id: "payment-private", invoiceId: "invoice-private", attemptId: "attempt-private", transactionHash: "a".repeat(64), network: "TESTNET", sourceAccount: payer,
    destinationAccount: destination, amountStroops: 10000000, asset: "XLM", paymentReference: "public-reference", ledger: 123, ledgerClosedAt: now, verifiedAt: now });
  return { db, store: (user) => createReceiptStore(db, async () => user ? { id: user } : null) };
}
test("safe receipt projection exposes verified chain fields and no internal/private data", async (t) => {
  const { store } = await fixture(t);
  const result = await store(null).getPublicReceipt("r".repeat(32));
  assert.deepEqual(Object.keys(result).sort(), ["amountStroops", "asset", "destinationAccount", "ledger", "ledgerClosedAt", "network", "paymentReference", "sourceAccount", "status", "transactionHash"].sort());
  assert.equal(result.status, "PAID"); assert.equal(result.sourceAccount, payer);
  for (const privateValue of ["@example.test", "invoice-private", "attempt-private", "payment-private", "opaque-signed", "merchant", "Private customer"]) assert.equal(JSON.stringify(result).includes(privateValue), false);
  assert.deepEqual(await store(null).getPublicReceipt("r".repeat(32)), result);
});
test("merchant receipts verify authentication and ownership on every read", async (t) => {
  const { store } = await fixture(t);
  await assert.rejects(() => store(null).getMerchantReceipt("invoice-private"), /Authentication required/);
  assert.equal(await store("other-user").getMerchantReceipt("invoice-private"), undefined);
  assert.equal((await store("merchant").getMerchantReceipt("invoice-private")).ledger, 123);
});
test("receipt requires a verified attempt, not only a PAID label", async (t) => {
  const { db, store } = await fixture(t);
  await db.update(paymentAttempts).set({ status: "UNKNOWN" });
  assert.equal(await store(null).getPublicReceipt("r".repeat(32)), undefined);
  assert.equal(await store(null).getPublicReceipt("invalid"), undefined);
  assert.equal(await store(null).getPublicReceipt("z".repeat(32)), undefined);
});
test("explorer links are fixed to Stellar Testnet and accept only transaction hashes", () => {
  assert.equal(testnetExplorerUrl("a".repeat(64)), "https://stellar.expert/explorer/testnet/tx/" + "a".repeat(64));
  assert.throws(() => testnetExplorerUrl("javascript:invalid"));
});
