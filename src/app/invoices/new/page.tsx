import type { Metadata } from "next";
import Link from "next/link";
import { MerchantHeader } from "@/components/merchant-header";
import { InvoiceForm } from "@/components/invoice-form";
import { invoiceService } from "@/server/invoices/service";

export const metadata: Metadata = { title: "Create invoice — StellarInvoice", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function NewInvoicePage() {
  const account = await invoiceService().getReceivingAccount();
  return <><MerchantHeader /><main id="main-content" className="shell section-space">
    <p className="eyebrow">NEW INVOICE / STELLAR TESTNET</p>
    <h1 className="dashboard-title">Make your work official.</h1>
    {!account ? <div className="auth-notice mt-8"><p>Save a receiving account before creating your first invoice.</p><Link className="button-primary mt-4" href="/settings">Set up receiving account</Link></div> : <>
      <p className="hero-description">Create an invoice and a shareable link for Freighter payments on Stellar Testnet.</p>
      <p className="destination-preview">Destination for this invoice: <span>{account}</span></p>
      <InvoiceForm />
    </>}
  </main></>;
}
