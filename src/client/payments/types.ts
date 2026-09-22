export type PaymentReview = {
  amountStroops: number;
  feeStroops: number;
  destinationAccount: string;
  paymentReference: string;
  network: "TESTNET";
  asset: "XLM";
};
export type AttemptStatus = "PREPARED" | "SUBMITTED" | "UNKNOWN" | "FAILED" | "EXPIRED" | "VERIFIED";
export type Attempt = {
  attemptId: string;
  status: AttemptStatus;
  invoiceStatus: "OPEN" | "PAID";
  transactionHash: string;
  expiresAt: string;
  errorCode: string | null;
  receipt: { transactionHash: string; ledger: number; ledgerClosedAt: string } | null;
};
export type SavedPayment = { invoiceStatus: "OPEN" | "PAID"; attempt: Attempt | null };
export type PreparedPayment = {
  attemptId: string;
  transactionHash: string;
  unsignedXdr: string;
  expiresAt: string;
  network: "TESTNET";
  status: AttemptStatus;
  requiresRecheck: boolean;
  review: PaymentReview & { sourceAccount: string };
};
export interface PaymentApi {
  load(signal?: AbortSignal): Promise<SavedPayment>;
  prepare(sourceAccount: string, signal?: AbortSignal): Promise<PreparedPayment>;
  submit(attemptId: string, signedXdr: string, signal?: AbortSignal): Promise<Attempt>;
  verify(attemptId: string, signal?: AbortSignal): Promise<Attempt>;
}
export class FlowError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}

const messages: Record<string, string> = {
  WALLET_MISSING: "Freighter was not detected. Install the browser extension, then try connecting again.",
  ACCESS_REJECTED: "Wallet access was declined. Connect again when you are ready.",
  WALLET_LOCKED: "Unlock Freighter, select your Testnet account, then reconnect.",
  WALLET_UNAVAILABLE: "Freighter did not respond. Open or unlock the extension and try again.",
  WRONG_NETWORK: "Switch Freighter to Stellar Testnet, then reconnect. Mainnet payments are disabled.",
  ACCOUNT_CHANGED: "Your wallet account changed. Reconnect and review the payer before signing.",
  SIGN_CANCELLED: "Signing was cancelled. No transaction was submitted by this page. You can try the saved attempt again.",
  INVALID_WALLET_RESPONSE: "Freighter returned an unexpected response. No transaction was submitted. Reconnect and try again.",
  REVIEW_CHANGED: "The prepared payment does not match this review. Reload the invoice before continuing.",
  SOURCE_EQUALS_DESTINATION: "Choose a funded Testnet payer account different from the receiving account.",
  SOURCE_ACCOUNT_UNAVAILABLE: "The payer account could not be loaded on Testnet. Check its funding and try again.",
  ACTIVE_ATTEMPT_EXISTS: "Another payment attempt is active. Recheck it before preparing a new payment.",
  RECHECK_REQUIRED: "This attempt needs verification before you can continue. Do not send another payment yet.",
  TRANSACTION_FAILED: "The network rejected this transaction. Check the payer balance and receiving account before trying again.",
  EXPIRED_UNPAID: "The server confirmed this attempt expired without payment. You may review and try again.",
  SUBMISSION_REJECTED_RECHECK: "Submission was rejected, possibly due to a changed sequence or fee. Recheck the saved attempt; do not create another payment yet.",
  INVOICE_ALREADY_PAID: "This invoice is already paid. Refresh its saved payment status.",
  REQUEST_FAILED: "The server could not be reached. Recheck the saved payment status before trying to pay again.",
  PAYMENT_SERVICE_UNAVAILABLE: "The payment service is temporarily unavailable. Your payment outcome is unresolved. Recheck saved status before paying again.",
  RPC_UNAVAILABLE: "Stellar Testnet could not be reached. Recheck the saved attempt; do not send a replacement payment.",
  INVALID_RESPONSE: "Payment status could not be read safely. Reload or recheck the invoice.",
};
export function flowMessage(error: unknown) {
  return error instanceof FlowError && messages[error.code] ? messages[error.code] : "We could not complete this step. Recheck the saved payment status and try again.";
}
