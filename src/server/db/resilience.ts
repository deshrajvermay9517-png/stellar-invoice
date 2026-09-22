import "server-only";
import { setTimeout as delay } from "node:timers/promises";

// Abort the actual transport, including response-body consumption. A timed-out
// write may still have committed remotely; never replay it at this layer.
export function databaseFetch(fetcher: typeof fetch = fetch, timeoutMs = 8000): typeof fetch {
  return (input, init) => {
    const original = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = original ? AbortSignal.any([original, deadline]) : deadline;
    return fetcher(input, { ...init, signal });
  };
}

function transient(error: unknown): boolean {
  let cause = error;
  for (let depth = 0; depth < 5 && cause && typeof cause === "object"; depth++) {
    const value = cause as { name?: string; code?: string; message?: string; cause?: unknown };
    if (value.name === "TimeoutError" || ["ECONNRESET", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"].includes(value.code ?? "")) return true;
    if (value.code === "SERVER_ERROR" && /HTTP status (502|503|504)\b/.test(value.message ?? "")) return true;
    cause = value.cause;
  }
  return false;
}

// Explicit opt-in for read-only queries, never transactions/auth writes or RPC.
// One retry absorbs a brief upstream interruption without concealing an outage.
export async function retryDatabaseRead<T>(read: () => Promise<T>, sleep = delay): Promise<T> {
  try { return await read(); }
  catch (error) {
    if (!transient(error)) throw error;
    await sleep(250);
    return read();
  }
}
