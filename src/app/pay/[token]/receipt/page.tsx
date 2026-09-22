import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { VerifiedReceipt } from "@/components/verified-receipt";
import { receiptService } from "@/server/payments/receipt-service";
import { invoiceService } from "@/server/invoices/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Verified receipt — StellarInvoice", robots: { index: false, follow: false, noarchive: true }, referrer: "no-referrer" };

export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const receipt = await receiptService().getPublicReceipt(token);
  if (!receipt) {
    if (!await invoiceService().getPublicInvoice(token)) notFound();
    redirect(`/pay/${token}`);
  }
  return <main id="main-content" className="shell section-space public-invoice">
    <p className="brand mb-12">Stellar<span className="brand-light">Invoice</span></p>
    <h1 className="dashboard-title mb-8">Your payment receipt.</h1>
    <VerifiedReceipt receipt={receipt} />
    <Link className="button-secondary mt-8" href={`/pay/${token}`}>Back to invoice</Link>
  </main>;
}
