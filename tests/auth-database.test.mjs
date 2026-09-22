import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { authTables } from "../src/server/db/schema.ts";

// These are isolated database fixtures, not OAuth credentials or production sessions.
async function fixture(t) {
  const client = createClient({ url: ":memory:" });
  t.after(() => client.close());
  await client.execute("PRAGMA foreign_keys = ON");
  const database = drizzle(client);
  await migrate(database, { migrationsFolder: "./drizzle" });
  return { client, database, adapter: DrizzleAdapter(database, authTables) };
}

test("migrations are repeatable and create authentication and invoice tables", async (t) => {
  const { client, database } = await fixture(t);
  await migrate(database, { migrationsFolder: "./drizzle" });
  const result = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name");
  assert.deepEqual(result.rows.map((row) => row.name), ["accounts", "invoices", "payment_attempts", "payments", "sessions", "users"]);
});

test("adapter supports GitHub identity, persisted sessions, renewal, and sign-out deletion", async (t) => {
  const { adapter } = await fixture(t);
  const user = await adapter.createUser({ name: "Test user", email: "user@example.test", emailVerified: null, image: null });
  assert.ok(user.id);
  await adapter.linkAccount({ userId: user.id, type: "oauth", provider: "github", providerAccountId: "fixture-user" });
  assert.equal((await adapter.getUserByAccount({ provider: "github", providerAccountId: "fixture-user" })).id, user.id);
  assert.equal((await adapter.getUserByEmail("user@example.test")).id, user.id);
  const expires = new Date(Date.now() + 3600000);
  await adapter.createSession({ sessionToken: "fixture-session", userId: user.id, expires });
  const saved = await adapter.getSessionAndUser("fixture-session");
  assert.equal(saved.user.id, user.id);
  assert.equal(saved.session.expires.getTime(), expires.getTime());
  const renewed = new Date(expires.getTime() + 3600000);
  await adapter.updateSession({ sessionToken: "fixture-session", expires: renewed });
  assert.equal((await adapter.getSessionAndUser("fixture-session")).session.expires.getTime(), renewed.getTime());
  await adapter.deleteSession("fixture-session");
  assert.equal(await adapter.getSessionAndUser("fixture-session"), null);
  assert.equal(await adapter.getSessionAndUser("unknown-session"), null);
});

test("schema rejects duplicate identities and orphan sessions; user deletion cascades", async (t) => {
  const { adapter, client } = await fixture(t);
  const user = await adapter.createUser({ name: null, email: "unique@example.test", emailVerified: null, image: null });
  await assert.rejects(() => adapter.createUser({ name: null, email: "unique@example.test", emailVerified: null, image: null }));
  const account = { userId: user.id, type: "oauth", provider: "github", providerAccountId: "fixture-unique" };
  await adapter.linkAccount(account);
  await assert.rejects(() => adapter.linkAccount(account));
  const session = { sessionToken: "fixture-unique-session", userId: user.id, expires: new Date(Date.now() + 3600000) };
  await adapter.createSession(session);
  await assert.rejects(() => adapter.createSession(session));
  await assert.rejects(() => adapter.createSession({ ...session, sessionToken: "orphan", userId: "missing-user" }));
  await adapter.deleteUser(user.id);
  assert.equal(await adapter.getSessionAndUser(session.sessionToken), null);
  assert.equal((await client.execute("SELECT COUNT(*) AS count FROM accounts")).rows[0].count, 0);
  assert.equal((await client.execute("SELECT COUNT(*) AS count FROM sessions")).rows[0].count, 0);
});
