import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Match Next.js development precedence; shell variables always take priority.
config({ path: [".env.local", ".env"], quiet: true });

if (process.argv.includes("migrate") &&
    (!process.env.TURSO_DATABASE_URL?.trim() || !process.env.TURSO_AUTH_TOKEN?.trim())) {
  throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before running db:migrate.");
}

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? "",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
