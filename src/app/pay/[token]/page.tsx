import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { invoiceService } from "@/server/invoices/service";
import { formatXlm } from "@/lib/amount";
import Link from "next/link";
import { PaymentPanel } from "@/components/payment-panel";
import { FEE_STROOPS } from "@/server/payments/transaction";

export const metadata: Metadata = {
  title: "Invoice — StellarInvoice",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PublicInvoice({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await invoiceService().getPublicInvoice(token);
  if (!invoice) notFound();
  return <main id="main-content" className="shell section-space public-invoice">
    <p className="brand mb-12">Stellar<span className="brand-light">Invoice</span></p>
    <p className="eyebrow"><span className="status-dot" />STELLAR TESTNET / NO REAL FUNDS</p>
    <h1 className="dashboard-title">Your invoice.</h1>
    <p className="invoice-amount">{formatXlm(invoice.amountStroops)} <span>XLM</span></p>
    <section className="account-panel invoice-detail-panel" aria-label="Public invoice details"><dl className="account-details">
      <div><dt>Status</dt><dd><span className="status-pill">{invoice.status}</span></dd></div>
      <div><dt>Description</dt><dd className="preserve-lines">{invoice.description}</dd></div>
      <div><dt>Due date</dt><dd>{invoice.dueDate}</dd></div>
      <div><dt>Destination</dt><dd className="mono-address">{invoice.destinationAccount}</dd></div>
      <div><dt>Network / asset</dt><dd>Stellar Testnet / {invoice.asset}</dd></div>
    </dl></section>
    {invoice.status === "PAID" ? <div className="auth-notice mt-8"><h2>This invoice is paid.</h2><Link className="button-primary mt-4" href={`/pay/${token}/receipt`}>View verified receipt</Link></div>
      : <PaymentPanel key={token} token={token} review={{ amountStroops: invoice.amountStroops, destinationAccount: invoice.destinationAccount,
        paymentReference: invoice.paymentReference, asset: invoice.asset, network: invoice.network, feeStroops: Number(FEE_STROOPS) }} />}
  </main>;
}
