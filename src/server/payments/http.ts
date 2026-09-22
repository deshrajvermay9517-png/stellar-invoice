import "server-only";
import { PaymentError } from "./errors.ts";

export async function paymentResponse(work: () => Promise<unknown>) {
  const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" };
  try { return Response.json(await work(), { headers }); }
  catch (error) {
    return Response.json({ error: error instanceof PaymentError ? error.code : "PAYMENT_SERVICE_UNAVAILABLE" },
      { status: error instanceof PaymentError ? error.status : 503, headers });
  }
}

export async function paymentBody(request: Request, keys: string[]): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin && origin !== new URL(process.env.AUTH_URL ?? "http://localhost:3000").origin)) throw new PaymentError("INVALID_ORIGIN", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new PaymentError("JSON_REQUIRED", 415);
  // Bound the actual stream, not only the untrusted Content-Length header.
  const reader = request.body?.getReader();
  if (!reader) throw new PaymentError("INVALID_BODY");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 24000) { await reader.cancel(); throw new PaymentError("BODY_TOO_LARGE", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new PaymentError("INVALID_BODY"); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !keys.includes(key)) ||
      keys.some((key) => typeof body[key] !== "string")) throw new PaymentError("INVALID_BODY");
  return body;
}
