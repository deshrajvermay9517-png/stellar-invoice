import { FlowError, type Attempt, type PaymentApi, type PreparedPayment, type SavedPayment } from "./types.ts";

const statuses = ["PREPARED", "SUBMITTED", "UNKNOWN", "FAILED", "EXPIRED", "VERIFIED"];
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FlowError("INVALID_RESPONSE");
  return value as Record<string, unknown>;
}
function string(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function invoiceStatus(value: unknown) { return value === "OPEN" || value === "PAID"; }
function baseAttempt(value: unknown) {
  const row = object(value);
  if (!string(row.attemptId) || row.attemptId.length > 100 || !string(row.transactionHash) || !/^[a-f0-9]{64}$/.test(row.transactionHash) ||
      !string(row.status) || !statuses.includes(row.status) || !string(row.expiresAt) || !Number.isFinite(Date.parse(row.expiresAt))) throw new FlowError("INVALID_RESPONSE");
  return row;
}
function parseAttempt(value: unknown): Attempt {
  const row = baseAttempt(value);
  if (!invoiceStatus(row.invoiceStatus) || !(row.errorCode === null || string(row.errorCode))) throw new FlowError("INVALID_RESPONSE");
  if (row.receipt !== null) {
    const receipt = object(row.receipt);
    if (receipt.transactionHash !== row.transactionHash || !Number.isSafeInteger(receipt.ledger) || Number(receipt.ledger) <= 0 ||
        !string(receipt.ledgerClosedAt) || !Number.isFinite(Date.parse(receipt.ledgerClosedAt))) throw new FlowError("INVALID_RESPONSE");
  }
  return row as unknown as Attempt;
}
export function createPaymentApi(token: string, fetcher: typeof fetch = fetch): PaymentApi {
  const base = `/api/pay/${encodeURIComponent(token)}`;
  async function request(path: string, body?: object, signal?: AbortSignal) {
    try {
      const response = await fetcher(base + path, {
        method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
      });
      const value: unknown = await response.json();
      if (!response.ok) throw new FlowError(typeof object(value).error === "string" ? String(object(value).error) : "REQUEST_FAILED");
      return value;
    } catch (error) {
      if (error instanceof FlowError) throw error;
      throw new FlowError("REQUEST_FAILED");
    }
  }
  return {
    async load(signal) {
      const row = object(await request("", undefined, signal));
      if (!invoiceStatus(row.invoiceStatus)) throw new FlowError("INVALID_RESPONSE");
      return { invoiceStatus: row.invoiceStatus, attempt: row.attempt === null ? null : parseAttempt(row.attempt) } as SavedPayment;
    },
    async prepare(sourceAccount, signal) {
      const row = baseAttempt(await request("/prepare", { sourceAccount }, signal));
      const review = object(row.review);
      if (!string(row.unsignedXdr) || row.unsignedXdr.length > 16000 || row.network !== "TESTNET" || typeof row.requiresRecheck !== "boolean" ||
          !Number.isSafeInteger(review.amountStroops) || Number(review.amountStroops) <= 0 || !Number.isSafeInteger(review.feeStroops) || Number(review.feeStroops) <= 0 ||
          review.network !== "TESTNET" || review.asset !== "XLM" || !string(review.sourceAccount) || !string(review.destinationAccount) || !string(review.paymentReference)) throw new FlowError("INVALID_RESPONSE");
      return row as unknown as PreparedPayment;
    },
    async submit(id, signedXdr, signal) { return parseAttempt(await request(`/attempts/${encodeURIComponent(id)}/submit`, { signedXdr }, signal)); },
    async verify(id, signal) { return parseAttempt(await request(`/attempts/${encodeURIComponent(id)}/verify`, {}, signal)); },
  };
}
