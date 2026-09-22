import type { AdapterAccount } from "next-auth/adapters";
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// A stable internal ID keeps identity independent of GitHub and future wallet settings.
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  receivingAccount: text("receivingAccount"),
});

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  ownerId: text("ownerId").notNull().references(() => users.id, { onDelete: "restrict" }),
  publicToken: text("publicToken").notNull().unique(),
  paymentReference: text("paymentReference").notNull().unique(),
  customerName: text("customerName").notNull(),
  customerEmail: text("customerEmail").notNull(),
  description: text("description").notNull(),
  amountStroops: integer("amountStroops").notNull(),
  dueDate: text("dueDate").notNull(),
  destinationAccount: text("destinationAccount").notNull(),
  network: text("network", { enum: ["TESTNET"] }).notNull().default("TESTNET"),
  asset: text("asset", { enum: ["XLM"] }).notNull().default("XLM"),
  status: text("status", { enum: ["OPEN", "PAID"] }).notNull().default("OPEN"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  paidAt: integer("paidAt", { mode: "timestamp_ms" }),
}, (invoice) => [
  index("invoices_owner_created_idx").on(invoice.ownerId, invoice.createdAt),
  check("invoices_amount_check", sql`typeof(${invoice.amountStroops}) = 'integer' AND ${invoice.amountStroops} > 0 AND ${invoice.amountStroops} <= 9007199254740991`),
  check("invoices_network_check", sql`${invoice.network} = 'TESTNET'`),
  check("invoices_asset_check", sql`${invoice.asset} = 'XLM'`),
  check("invoices_status_check", sql`${invoice.status} IN ('OPEN', 'PAID')`),
  check("invoices_paid_at_check", sql`(${invoice.status} = 'OPEN' AND ${invoice.paidAt} IS NULL) OR (${invoice.status} = 'PAID' AND ${invoice.paidAt} IS NOT NULL)`),
]);

export const paymentAttempts = sqliteTable("payment_attempts", {
  id: text("id").primaryKey(),
  invoiceId: text("invoiceId").notNull().references(() => invoices.id, { onDelete: "restrict" }),
  sourceAccount: text("sourceAccount").notNull(),
  transactionHash: text("transactionHash").notNull().unique(),
  unsignedXdr: text("unsignedXdr").notNull(),
  signedXdr: text("signedXdr"),
  status: text("status", { enum: ["PREPARED", "SUBMITTED", "UNKNOWN", "FAILED", "EXPIRED", "VERIFIED"] }).notNull().default("PREPARED"),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  submittedAt: integer("submittedAt", { mode: "timestamp_ms" }),
  lastCheckedAt: integer("lastCheckedAt", { mode: "timestamp_ms" }),
  errorCode: text("errorCode"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
}, (attempt) => [
  index("payment_attempts_invoice_idx").on(attempt.invoiceId),
  uniqueIndex("payment_attempts_one_active").on(attempt.invoiceId).where(sql`${attempt.status} IN ('PREPARED', 'SUBMITTED', 'UNKNOWN')`),
  check("payment_attempts_status_check", sql`${attempt.status} IN ('PREPARED', 'SUBMITTED', 'UNKNOWN', 'FAILED', 'EXPIRED', 'VERIFIED')`),
]);

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  invoiceId: text("invoiceId").notNull().unique().references(() => invoices.id, { onDelete: "restrict" }),
  attemptId: text("attemptId").notNull().unique().references(() => paymentAttempts.id, { onDelete: "restrict" }),
  transactionHash: text("transactionHash").notNull().unique(),
  network: text("network", { enum: ["TESTNET"] }).notNull(),
  sourceAccount: text("sourceAccount").notNull(),
  destinationAccount: text("destinationAccount").notNull(),
  amountStroops: integer("amountStroops").notNull(),
  asset: text("asset", { enum: ["XLM"] }).notNull(),
  paymentReference: text("paymentReference").notNull(),
  ledger: integer("ledger").notNull(),
  ledgerClosedAt: integer("ledgerClosedAt", { mode: "timestamp_ms" }).notNull(),
  verifiedAt: integer("verifiedAt", { mode: "timestamp_ms" }).notNull(),
}, (payment) => [
  check("payments_network_asset_check", sql`${payment.network} = 'TESTNET' AND ${payment.asset} = 'XLM'`),
  check("payments_amount_check", sql`typeof(${payment.amountStroops}) = 'integer' AND ${payment.amountStroops} > 0 AND ${payment.amountStroops} <= 9007199254740991`),
  check("payments_ledger_check", sql`${payment.ledger} > 0`),
]);

export const accounts = sqliteTable("accounts", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").$type<AdapterAccount["type"]>().notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("providerAccountId").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (account) => [
  primaryKey({ columns: [account.provider, account.providerAccountId] }),
  index("accounts_user_id_idx").on(account.userId),
]);

export const sessions = sqliteTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
}, (session) => [index("sessions_user_id_idx").on(session.userId)]);

// GitHub OAuth does not use magic-link verification tokens or WebAuthn tables.
export const authTables = {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
};
