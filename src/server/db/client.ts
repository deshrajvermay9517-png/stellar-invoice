import "server-only";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { getDatabaseEnvironment } from "../env";
import { databaseFetch } from "./resilience";
import { accounts, invoices, paymentAttempts, payments, sessions, users } from "./schema";

function createDatabase() {
  const client = createClient({ ...getDatabaseEnvironment(), fetch: databaseFetch() });
  return drizzle(client, { schema: { users, accounts, sessions, invoices, paymentAttempts, payments } });
}

let database: ReturnType<typeof createDatabase> | undefined;

// Lazy initialization lets the public site and production build work without secrets.
// There is deliberately no mock, local-file, or in-memory fallback in the application.
export function getDatabase() {
  return database ??= createDatabase();
}
