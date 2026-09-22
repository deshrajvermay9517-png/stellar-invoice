import "server-only";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function getDatabaseEnvironment() {
  const url = required("TURSO_DATABASE_URL");
  const authToken = required("TURSO_AUTH_TOKEN");
  const parsed = new URL(url);
  if (!["libsql:", "https:"].includes(parsed.protocol)) {
    throw new Error("TURSO_DATABASE_URL must use libsql:// or https://.");
  }
  return { url, authToken };
}

export function getAuthEnvironment() {
  const secret = required("AUTH_SECRET");
  if (secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return {
    secret,
    githubId: required("AUTH_GITHUB_ID"),
    githubSecret: required("AUTH_GITHUB_SECRET"),
    database: getDatabaseEnvironment(),
  };
}

export function isAuthConfigured(): boolean {
  try {
    getAuthEnvironment();
    return true;
  } catch {
    return false;
  }
}
