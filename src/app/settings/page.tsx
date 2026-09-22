import type { Metadata } from "next";
import { MerchantHeader } from "@/components/merchant-header";
import { ReceivingAccountForm } from "@/components/receiving-account-form";
import { invoiceService } from "@/server/invoices/service";

export const metadata: Metadata = { title: "Settings — StellarInvoice", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SettingsPage() {
  const account = await invoiceService().getReceivingAccount();
  return <><MerchantHeader /><main id="main-content" className="shell section-space">
    <p className="eyebrow">SETTINGS / STELLAR TESTNET</p>
    <h1 className="dashboard-title">Where your work leads.</h1>
    <p className="hero-description">Set the receiving account for your invoices. Customers pay this address with Freighter on Stellar Testnet.</p>
    <ReceivingAccountForm initialAccount={account} />
  </main></>;
}
