import { formatXlm } from "@/lib/amount";
import { testnetExplorerUrl } from "@/lib/stellar-network";
import type { VerifiedReceipt as Receipt } from "@/server/payments/receipts";

export function VerifiedReceipt({ receipt }: { receipt: Receipt }) {
  return <section className="account-panel receipt-panel" aria-labelledby="receipt-title">
    <p className="eyebrow">VERIFIED ON STELLAR TESTNET</p>
    <h2 id="receipt-title">Payment received.</h2>
    <dl className="account-details">
      <div><dt>Status</dt><dd><span className="status-pill">PAID</span></dd></div>
      <div><dt>Amount</dt><dd>{formatXlm(receipt.amountStroops)} {receipt.asset}</dd></div>
      <div><dt>Network</dt><dd>Stellar Testnet · No real funds</dd></div>
      <div><dt>Payer</dt><dd className="mono-address">{receipt.sourceAccount}</dd></div>
      <div><dt>Destination</dt><dd className="mono-address">{receipt.destinationAccount}</dd></div>
      <div><dt>Transaction</dt><dd className="mono-address">{receipt.transactionHash}</dd></div>
      <div><dt>Ledger</dt><dd>{receipt.ledger}</dd></div>
      <div><dt>Paid at (UTC)</dt><dd><time dateTime={receipt.ledgerClosedAt.toISOString()}>{receipt.ledgerClosedAt.toISOString().replace("T", " ").replace(".000Z", " UTC")}</time></dd></div>
      <div><dt>Reference</dt><dd className="mono-address">{receipt.paymentReference}</dd></div>
    </dl>
    <a className="button-secondary mt-6" href={testnetExplorerUrl(receipt.transactionHash)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">View on StellarExpert ↗</a>
    <p className="field-hint mt-4">Confirmed independently by the server from the Testnet ledger.</p>
  </section>;
}
