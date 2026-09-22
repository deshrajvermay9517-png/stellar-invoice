import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MerchantHeader } from "@/components/merchant-header";
import { PublicLink } from "@/components/public-link";
import { invoiceService } from "@/server/invoices/service";
import { formatXlm } from "@/lib/amount";
import { receiptService } from "@/server/payments/receipt-service";
import { VerifiedReceipt } from "@/components/verified-receipt";

export const metadata: Metadata = { title: "Invoice details — StellarInvoice", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await invoiceService().getInvoice(id);
  if (!invoice) notFound();
  const receipt = invoice.status === "PAID" ? await receiptService().getMerchantReceipt(id) : undefined;
  // Use the configured canonical origin, never a client-supplied Host header.
  const origin = new URL(process.env.AUTH_URL!);
  if (!["http:", "https:"].includes(origin.protocol)) throw new Error("Invalid application origin.");
  const publicUrl = new URL(`/pay/${invoice.publicToken}`, origin.origin).toString();
  return <><MerchantHeader /><main id="main-content" className="shell section-space">
    <p className="eyebrow">INVOICE / STELLAR TESTNET</p><h1 className="dashboard-title">{invoice.customerName}</h1>
    <p className="invoice-amount">{formatXlm(invoice.amountStroops)} <span>XLM</span></p>
    <section className="account-panel invoice-detail-panel" aria-label="Invoice details"><dl className="account-details">
      <div><dt>Status</dt><dd><span className="status-pill">{invoice.status}</span></dd></div>
      <div><dt>Customer email</dt><dd>{invoice.customerEmail}</dd></div>
      <div><dt>Description</dt><dd className="preserve-lines">{invoice.description}</dd></div>
      <div><dt>Due date</dt><dd>{invoice.dueDate}</dd></div>
      <div><dt>Created (UTC)</dt><dd>{invoice.createdAt.toISOString().replace("T", " ").slice(0, 19)}</dd></div>
      <div><dt>Destination</dt><dd className="mono-address">{invoice.destinationAccount}</dd></div>
      <div><dt>Payment reference</dt><dd className="mono-address">{invoice.paymentReference}</dd></div>
      <div><dt>Network / asset</dt><dd>Stellar Testnet / XLM</dd></div>
    </dl></section>
    <PublicLink url={publicUrl} />
    {receipt && <div className="mt-8"><VerifiedReceipt receipt={receipt} /></div>}
    {invoice.status === "OPEN" && <p className="auth-notice mt-8">Share this link so your customer can pay with Freighter on Stellar Testnet.</p>}
  </main></>;
}
