import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { databaseFetch, retryDatabaseRead } from "../src/server/db/resilience.ts";
import { paymentResponse } from "../src/server/payments/http.ts";

const unavailable = () => Object.assign(new Error("Server returned HTTP status 502"), { code: "SERVER_ERROR" });

test("read retry handles a wrapped transient gateway error once with bounded backoff", async () => {
  let calls = 0; const delays = [];
  const result = await retryDatabaseRead(async () => {
    if (++calls === 1) throw new Error("query failed", { cause: unavailable() });
    return { status: "OPEN" };
  }, async (ms) => { delays.push(ms); });
  assert.deepEqual(result, { status: "OPEN" }); assert.equal(calls, 2); assert.deepEqual(delays, [250]);
});

test("persistent read failures surface; auth, SQL and caller cancellation errors are not retried", async () => {
  for (const [error, expected] of [[unavailable(), 2], [Object.assign(new Error("HTTP status 401"), { code: "SERVER_ERROR" }), 1],
    [Object.assign(new Error("constraint"), { code: "SQLITE_CONSTRAINT" }), 1], [new DOMException("cancelled", "AbortError"), 1],
    [new DOMException("deadline", "TimeoutError"), 2]]) {
    let calls = 0;
    await assert.rejects(() => retryDatabaseRead(async () => { calls++; throw error; }, async () => {}), e => e === error);
    assert.equal(calls, expected);
  }
});

test("database transport aborts hung writes without replay and preserves caller cancellation", async () => {
  let calls = 0;
  const fetcher = databaseFetch(async (_input, init) => {
    calls++;
    await delay(1000, undefined, { signal: init.signal });
    return new Response();
  }, 10);
  await assert.rejects(() => fetcher("https://database.invalid", { method: "POST" }), { name: "AbortError" });
  assert.equal(calls, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => fetcher(new Request("https://database.invalid", { signal: controller.signal })), { name: "AbortError" });
  assert.equal(calls, 2);
});

test("database failure at payment HTTP boundary exposes only safe retryable service status", async () => {
  const response = await paymentResponse(async () => { throw new Error("private query details", { cause: unavailable() }); });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "PAYMENT_SERVICE_UNAVAILABLE" });
  assert.match(response.headers.get("Cache-Control"), /no-store/);
});
