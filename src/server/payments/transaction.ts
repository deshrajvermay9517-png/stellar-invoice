import "server-only";
import { Account, Asset, Memo, Operation, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { TESTNET_PASSPHRASE } from "../../lib/stellar-network.ts";
import { formatXlm, parseXlm } from "../../lib/amount.ts";
import { validateReceivingAccount } from "../../lib/receiving-account.ts";
import { PaymentError } from "./errors.ts";

export const NETWORK = "TESTNET" as const;
export const NETWORK_PASSPHRASE = TESTNET_PASSPHRASE;
export const TIMEOUT_SECONDS = 300;
// Fixed fee ceiling: 0.00001 XLM for one classic operation. No automatic fee bidding.
export const FEE_STROOPS = "100";
export type Terms = { destinationAccount: string; amountStroops: number; paymentReference: string; network: string; asset: string };
export type Expected = Terms & { sourceAccount: string; transactionHash: string; unsignedXdr: string };

export function publicAccount(value: unknown): string {
  try { return validateReceivingAccount(value); }
  catch { throw new PaymentError("INVALID_ACCOUNT"); }
}

export function buildPayment(account: Account, terms: Terms, now: Date): Transaction {
  publicAccount(account.accountId());
  publicAccount(terms.destinationAccount);
  if (terms.network !== NETWORK || terms.asset !== "XLM") throw new PaymentError("UNSUPPORTED_NETWORK_OR_ASSET");
  if (account.accountId() === terms.destinationAccount) throw new PaymentError("SOURCE_EQUALS_DESTINATION");
  const seconds = Math.floor(now.getTime() / 1000);
  return new TransactionBuilder(account, {
    fee: FEE_STROOPS, networkPassphrase: NETWORK_PASSPHRASE,
    timebounds: { minTime: seconds - 30, maxTime: seconds + TIMEOUT_SECONDS },
    memo: Memo.text(terms.paymentReference),
  }).addOperation(Operation.payment({ destination: terms.destinationAccount, asset: Asset.native(), amount: formatXlm(terms.amountStroops) })).build();
}

export function parsePayment(value: unknown): Transaction {
  try {
    if (typeof value !== "string" || value.length > 16000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error();
    const transaction = TransactionBuilder.fromXDR(value, NETWORK_PASSPHRASE);
    // Reject fee bumps, legacy v0, muxed sources, Soroban and extended preconditions.
    const envelope = transaction.toEnvelope();
    if (!(transaction instanceof Transaction) || envelope.type !== "envelopeTypeTx" ||
        envelope.v1.tx.ext.type !== "v0" || envelope.v1.tx.cond.type !== "precondTime") throw new Error();
    publicAccount(transaction.source);
    return transaction;
  } catch { throw new PaymentError("INVALID_TRANSACTION"); }
}

export function validatePayment(value: unknown, expected: Expected, requireSignatures = false): Transaction {
  const transaction = parsePayment(value);
  const operation = transaction.operations[0];
  if (expected.network !== NETWORK || expected.asset !== "XLM" ||
      transaction.networkPassphrase !== NETWORK_PASSPHRASE ||
      Buffer.from(transaction.hash()).toString("hex") !== expected.transactionHash ||
      transaction.source !== expected.sourceAccount || transaction.source === expected.destinationAccount ||
      transaction.operations.length !== 1 || operation.type !== "payment" || operation.source !== undefined ||
      !operation.asset.isNative() || operation.destination !== expected.destinationAccount ||
      parseXlm(operation.amount) !== expected.amountStroops ||
      transaction.memo.type !== "text" || !Buffer.from(transaction.memo.value ?? "").equals(Buffer.from(expected.paymentReference)) ||
      transaction.fee !== FEE_STROOPS || !transaction.timeBounds || transaction.timeBounds.maxTime === "0" ||
      (requireSignatures && transaction.signatures.length === 0)) throw new PaymentError("TRANSACTION_MISMATCH");
  // Hash binding covers sequence, fee, time bounds and the complete body. Compare
  // signature bases as well so only signatures may change from the saved envelope.
  const original = parsePayment(expected.unsignedXdr);
  if (!Buffer.from(transaction.signatureBase()).equals(Buffer.from(original.signatureBase()))) throw new PaymentError("TRANSACTION_MISMATCH");
  return transaction;
}
