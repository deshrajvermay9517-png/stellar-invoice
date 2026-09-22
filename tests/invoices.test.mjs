import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { users, invoices } from "../src/server/db/schema.ts";
import { createInvoiceStore } from "../src/server/invoices/store.ts";
import { parseXlm, formatXlm } from "../src/lib/amount.ts";
import { validateReceivingAccount } from "../src/lib/receiving-account.ts";
import { validateInvoice } from "../src/lib/invoice-validation.ts";

const address = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const alternate = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const input = { customerName: "Private Customer", customerEmail: "private@example.test", description: "Design services", amount: "12.3456789", dueDate: "2028-02-29" };
async function fixture(t) {
  const client = createClient({ url: ":memory:" });
  t.after(() => client.close());
  await client.execute("PRAGMA foreign_keys = ON");
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(users).values([{ id: "alice", receivingAccount: address }, { id: "bob" }]);
  const store = (id) => createInvoiceStore(db, async () => id ? { id } : null);
  return { client, db, alice: store("alice"), bob: store("bob"), anonymous: store(null) };
}

test("XLM conversion uses exact integer stroops, including the safe upper bound", () => {
  for (const [value, expected] of [["1", 10000000], ["0.0000001", 1], ["12.3456789", 123456789], ["900719925.4740991", Number.MAX_SAFE_INTEGER]]) {
    assert.equal(parseXlm(value), expected);
    assert.equal(parseXlm(formatXlm(expected)), expected);
  }
});
test("invalid, zero, negative, exponent, excess precision and unsafe amounts are rejected", () => {
  for (const value of ["", "0", "0.0000000", "-1", "+1", "1e2", "1E-7", "1.00000000", ".1", "1.", "01", " 1", "1 ", "NaN", "Infinity", "1,000", "900719925.4740992", "999999999999999999999999999999999999", 1, null]) assert.throws(() => parseXlm(value), undefined, String(value));
});
test("receiving accounts validate canonical G-address encoding and checksum", () => {
  assert.equal(validateReceivingAccount(` ${address} `), address);
  assert.equal(validateReceivingAccount(alternate), alternate);
  for (const value of [address.toLowerCase(), address.slice(0, -1) + "A", "S" + address.slice(1), "M" + address.slice(1), address.slice(1), "G".repeat(56), null]) assert.throws(() => validateReceivingAccount(value));
});
test("invoice fields reject invalid calendar dates, missing fields and excessive lengths", () => {
  for (const patch of [{ dueDate: "2027-02-29" }, { dueDate: "2028-04-31" }, { customerName: " " }, { customerEmail: "not-email" }, { description: "x".repeat(2001) }, { amount: "0" }]) assert.throws(() => validateInvoice({ ...input, ...patch }));
});
test("authenticated creation derives owner and destination from the database and snapshots it", async (t) => {
  const { alice } = await fixture(t);
  const id = await alice.createInvoice({ ...input, ownerId: "bob", destinationAccount: alternate, status: "PAID" });
  await alice.saveReceivingAccount(alternate);
  const invoice = await alice.getInvoice(id);
  assert.equal(invoice.ownerId, "alice");
  assert.equal(invoice.destinationAccount, address);
  assert.equal(invoice.amountStroops, 123456789);
  assert.equal(invoice.network, "TESTNET");
  assert.equal(invoice.asset, "XLM");
  assert.equal(invoice.status, "OPEN");
  assert.equal(invoice.paidAt, null);
  assert.equal(await alice.getReceivingAccount(), alternate);
});
test("receiving account is required and ownership isolates reads and settings mutations", async (t) => {
  const { alice, bob } = await fixture(t);
  await assert.rejects(() => bob.createInvoice(input));
  const id = await alice.createInvoice(input);
  assert.equal(await bob.getInvoice(id), undefined);
  assert.deepEqual(await bob.listInvoices(), []);
  assert.equal((await alice.listInvoices()).length, 1);
  await bob.saveReceivingAccount(alternate);
  assert.equal(await alice.getReceivingAccount(), address);
  await assert.rejects(() => bob.saveReceivingAccount("invalid"));
});
test("every private operation rejects unauthenticated access", async (t) => {
  const { anonymous } = await fixture(t);
  for (const operation of [() => anonymous.getReceivingAccount(), () => anonymous.saveReceivingAccount(address), () => anonymous.createInvoice(input), () => anonymous.listInvoices(), () => anonymous.getInvoice("anything")]) await assert.rejects(operation, /Authentication required/);
});
test("public reads use an explicit safe projection without authenticating", async (t) => {
  const { alice, anonymous } = await fixture(t);
  const invoice = await alice.getInvoice(await alice.createInvoice(input));
  const publicInvoice = await anonymous.getPublicInvoice(invoice.publicToken);
  assert.deepEqual(Object.keys(publicInvoice).sort(), ["amountStroops", "asset", "description", "destinationAccount", "dueDate", "network", "status", "paymentReference"].sort());
  assert.equal(JSON.stringify(publicInvoice).includes(input.customerEmail), false);
  assert.equal(JSON.stringify(publicInvoice).includes(input.customerName), false);
  assert.equal(await anonymous.getPublicInvoice("invalid"), undefined);
  assert.equal(await anonymous.getPublicInvoice("x".repeat(32)), undefined);
});
test("tokens and references are independent, random and constrained unique on collisions", async (t) => {
  const { alice, db } = await fixture(t);
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push(await alice.getInvoice(await alice.createInvoice(input)));
  assert.equal(new Set(rows.map((row) => row.publicToken)).size, 12);
  assert.equal(new Set(rows.map((row) => row.paymentReference)).size, 12);
  for (const row of rows) { assert.match(row.publicToken, /^[\w-]{32}$/); assert.match(row.paymentReference, /^[\w-]{22}$/); }
  await assert.rejects(() => db.insert(invoices).values({ ...rows[0], id: "collision-token", paymentReference: "new-reference" }));
  await assert.rejects(() => db.insert(invoices).values({ ...rows[0], id: "collision-reference", publicToken: "y".repeat(32) }));
  assert.equal((await alice.listInvoices()).length, 12);
});
test("additive migration preserves existing user, OAuth and session records", async (t) => {
  const client = createClient({ url: ":memory:" });
  t.after(() => client.close());
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  await client.executeMultiple(await readFile(`drizzle/${journal.entries[0].tag}.sql`, "utf8"));
  await client.executeMultiple("INSERT INTO users (id, name) VALUES ('existing', 'Existing'); INSERT INTO accounts (userId, type, provider, providerAccountId) VALUES ('existing', 'oauth', 'github', 'fixture'); INSERT INTO sessions (sessionToken, userId, expires) VALUES ('fixture', 'existing', 2000000000);");
  const before = await Promise.all(["users", "accounts", "sessions"].map((table) => client.execute(`SELECT * FROM ${table}`)));
  await client.executeMultiple(await readFile("drizzle/0001_invoice_foundation.sql", "utf8"));
  for (const [index, table] of ["users", "accounts", "sessions"].entries()) {
    const after = await client.execute(`SELECT ${before[index].columns.map((column) => `"${column}"`).join(",")} FROM ${table}`);
    assert.deepEqual(after.rows, before[index].rows);
  }
});
