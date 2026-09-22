import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { invoices, users } from "../db/schema.ts";
import { retryDatabaseRead } from "../db/resilience.ts";
import { validateInvoice, ValidationError, type InvoiceInput } from "../../lib/invoice-validation.ts";
import { validateReceivingAccount } from "../../lib/receiving-account.ts";

// Only these columns may leave the server through the public invoice page.
const publicFields = {
  amountStroops: invoices.amountStroops,
  description: invoices.description,
  dueDate: invoices.dueDate,
  status: invoices.status,
  destinationAccount: invoices.destinationAccount,
  network: invoices.network,
  asset: invoices.asset,
  paymentReference: invoices.paymentReference,
};

// Injecting authentication/database dependencies allows isolated tests of the same
// authorization paths used by the application. Production binds this to requireUser().
export function createInvoiceStore<TSchema extends Record<string, unknown>>(database: LibSQLDatabase<TSchema>, authenticate: () => Promise<{ id: string } | null>) {
  async function ownerId() {
    const user = await authenticate();
    if (!user?.id) throw new Error("Authentication required.");
    return user.id;
  }

  return {
    async getReceivingAccount() {
      const id = await ownerId();
      const user = await database.select({ receivingAccount: users.receivingAccount }).from(users).where(eq(users.id, id)).get();
      if (!user) throw new Error("User no longer exists.");
      return user.receivingAccount;
    },
    async saveReceivingAccount(value: unknown) {
      const id = await ownerId();
      let account: string;
      try { account = validateReceivingAccount(value); }
      catch (error) { throw new ValidationError({ receivingAccount: (error as Error).message }); }
      const updated = await database.update(users).set({ receivingAccount: account }).where(eq(users.id, id)).returning({ id: users.id });
      if (!updated.length) throw new Error("User no longer exists.");
    },
    async createInvoice(input: InvoiceInput) {
      const id = await ownerId();
      const values = validateInvoice(input);
      return database.transaction(async (transaction) => {
        const merchant = await transaction.select({ account: users.receivingAccount }).from(users).where(eq(users.id, id)).get();
        if (!merchant?.account) throw new ValidationError({ receivingAccount: "Save a receiving account in Settings before creating an invoice." });
        const destinationAccount = validateReceivingAccount(merchant.account);
        const invoiceId = randomUUID();
        await transaction.insert(invoices).values({
          ...values,
          id: invoiceId,
          ownerId: id,
          publicToken: randomBytes(24).toString("base64url"),
          // Independent of the public bearer link; 22 ASCII bytes fits a future memo.
          paymentReference: randomBytes(16).toString("base64url"),
          destinationAccount,
          network: "TESTNET",
          asset: "XLM",
          status: "OPEN",
          createdAt: new Date(),
          paidAt: null,
        });
        // Unique constraints fail closed on a random collision; never reuse a token.
        return invoiceId;
      }, { behavior: "immediate" });
    },
    async listInvoices(page = 1) {
      const id = await ownerId();
      const safePage = Number.isSafeInteger(page) && page >= 1 && page <= 10000 ? page : 1;
      return database.select({
        id: invoices.id, customerName: invoices.customerName, amountStroops: invoices.amountStroops,
        dueDate: invoices.dueDate, status: invoices.status, createdAt: invoices.createdAt,
      }).from(invoices).where(eq(invoices.ownerId, id)).orderBy(desc(invoices.createdAt), desc(invoices.id)).limit(21).offset((safePage - 1) * 20);
    },
    async getInvoice(id: string) {
      const owner = await ownerId();
      return database.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.ownerId, owner))).get();
    },
    async getPublicInvoice(token: string) {
      if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return undefined;
      return retryDatabaseRead(() => database.select(publicFields).from(invoices).where(eq(invoices.publicToken, token)).get());
    },
  };
}
