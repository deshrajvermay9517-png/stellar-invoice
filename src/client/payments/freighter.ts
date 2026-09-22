import { TESTNET_PASSPHRASE } from "../../lib/stellar-network.ts";
import { validateReceivingAccount } from "../../lib/receiving-account.ts";
import { FlowError } from "./types.ts";

// Unknown return types deliberately force runtime validation of extension messages.
export interface FreighterApi {
  isConnected(): Promise<unknown>;
  requestAccess(): Promise<unknown>;
  getAddress(): Promise<unknown>;
  getNetworkDetails(): Promise<unknown>;
  signTransaction(xdr: string, options: { networkPassphrase: string; address: string }): Promise<unknown>;
}
export interface Wallet {
  available(): Promise<boolean>;
  connect(): Promise<string>;
  inspect(expectedAddress?: string): Promise<string>;
  sign(unsignedXdr: string, sourceAccount: string): Promise<string>;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new FlowError("INVALID_WALLET_RESPONSE");
  return value as Record<string, unknown>;
}
function walletFailure(value: unknown, signing = false): never {
  // Inspect only for classification; never render or log extension error text.
  const error = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  if (/reject|declin|cancel|denied/.test(message) || error.code === -4 || error.code === 4001) throw new FlowError(signing ? "SIGN_CANCELLED" : "ACCESS_REJECTED");
  if (/lock/.test(message)) throw new FlowError("WALLET_LOCKED");
  throw new FlowError("WALLET_UNAVAILABLE");
}
async function response(call: () => Promise<unknown>, signing = false) {
  let value;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    value = await Promise.race([call(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new FlowError("WALLET_UNAVAILABLE")), signing ? 120000 : 15000);
    })]);
  }
  catch (error) { walletFailure(error, signing); }
  finally { clearTimeout(timer); }
  const result = record(value);
  if (result.error) walletFailure(result.error, signing);
  return result;
}
function address(value: unknown) {
  if (value === "") throw new FlowError("WALLET_LOCKED");
  try { return validateReceivingAccount(value); }
  catch { throw new FlowError("INVALID_WALLET_RESPONSE"); }
}
export function createFreighterWallet(api: FreighterApi): Wallet {
  async function available() {
    const result = await response(() => api.isConnected());
    if (typeof result.isConnected !== "boolean") throw new FlowError("INVALID_WALLET_RESPONSE");
    return result.isConnected;
  }
  async function inspect(expectedAddress?: string) {
    const current = address((await response(() => api.getAddress())).address);
    const network = await response(() => api.getNetworkDetails());
    if (typeof network.networkPassphrase !== "string" || !network.networkPassphrase) throw new FlowError("INVALID_WALLET_RESPONSE");
    if (network.networkPassphrase !== TESTNET_PASSPHRASE) throw new FlowError("WRONG_NETWORK");
    if (expectedAddress && current !== expectedAddress) throw new FlowError("ACCOUNT_CHANGED");
    return current;
  }
  return {
    available,
    async connect() {
      if (!await available()) throw new FlowError("WALLET_MISSING");
      // This is the ONLY permission request, called by the Connect button.
      const selected = address((await response(() => api.requestAccess())).address);
      return inspect(selected);
    },
    inspect,
    async sign(unsignedXdr, sourceAccount) {
      await inspect(sourceAccount);
      const signed = await response(() => api.signTransaction(unsignedXdr, { networkPassphrase: TESTNET_PASSPHRASE, address: sourceAccount }), true);
      if (signed.signerAddress !== sourceAccount) throw new FlowError("ACCOUNT_CHANGED");
      if (typeof signed.signedTxXdr !== "string" || signed.signedTxXdr.length < 80 || signed.signedTxXdr.length > 16000 ||
          signed.signedTxXdr.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(signed.signedTxXdr)) throw new FlowError("INVALID_WALLET_RESPONSE");
      // A user can change account/network while the approval popup is open.
      await inspect(sourceAccount);
      return signed.signedTxXdr;
    },
  };
}

export function browserWallet(): Wallet {
  let wallet: Promise<Wallet> | undefined;
  const load = () => wallet ??= import("@stellar/freighter-api").then(createFreighterWallet);
  return {
    available: async () => (await load()).available(), connect: async () => (await load()).connect(),
    inspect: async (address) => (await load()).inspect(address), sign: async (xdr, source) => (await load()).sign(xdr, source),
  };
}
