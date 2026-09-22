import "server-only";
import { Server } from "@stellar/stellar-sdk/rpc";
import { NETWORK_PASSPHRASE } from "./transaction.ts";
import { PaymentError } from "./errors.ts";

export type PaymentRpc = Pick<Server, "getNetwork" | "getAccount" | "getTransaction" | "sendTransaction">;

export function createPaymentRpc(): PaymentRpc {
  const url = new URL(process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org");
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new PaymentError("INVALID_RPC_CONFIGURATION", 503);
  const server = new Server(url.toString(), { allowHttp: false });
  // SDK 17's RPC constructor does not forward its declared timeout option to
  // the transport. Configure the actual HTTP client so hangs remain recoverable.
  server.httpClient.defaults.timeout = 10000;
  server.httpClient.defaults.maxContentLength = 2 * 1024 * 1024;
  return server;
}

// RPC JSON encodes int64 times as decimal strings, despite SDK 17 declarations
// claiming numbers. Normalize both representations without accepting coercions.
export function rpcTimestamp(value: unknown): number | undefined {
  const seconds = typeof value === "string" && /^[1-9]\d{0,12}$/.test(value) ? Number(value) : value;
  return typeof seconds === "number" && Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 8640000000000 ? seconds : undefined;
}

export async function assertTestnet(rpc: PaymentRpc) {
  let passphrase: string;
  try { ({ passphrase } = await rpc.getNetwork()); }
  catch { throw new PaymentError("RPC_UNAVAILABLE", 503); }
  if (passphrase !== NETWORK_PASSPHRASE) throw new PaymentError("RPC_NETWORK_MISMATCH", 503);
}
