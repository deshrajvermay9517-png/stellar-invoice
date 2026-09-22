import type { Metadata } from "next";
import Link from "next/link";
import { MerchantHeader } from "@/components/merchant-header";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Dashboard — StellarInvoice", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function DashboardPage() {
  // Auth.js resolves the session against the database before rendering private data.
  const user = await requireUser();

  return (
    <>
      <MerchantHeader />
      <main id="main-content" className="shell section-space">
        <p className="eyebrow"><span className="status-dot" />YOUR WORKSPACE / STELLAR TESTNET</p>
        <h1 className="dashboard-title">Welcome, {user.name || "creator"}.</h1>
        <p className="hero-description">Set up your receiving account, create an invoice, and share a clear record of your work.</p>
        <div className="utility-actions mb-8"><Link className="button-primary" href="/invoices/new">Create invoice</Link><Link className="button-secondary" href="/invoices">View invoices</Link><Link className="button-secondary" href="/settings">Receiving account</Link></div>
        <section className="account-panel" aria-labelledby="account-title">
          <h2 id="account-title">Your account</h2>
          <dl className="account-details">
            <div><dt>Name</dt><dd>{user.name || "Not provided"}</dd></div>
            <div><dt>Email</dt><dd>{user.email || "Not provided by GitHub"}</dd></div>
            <div><dt>Account ID</dt><dd>{user.id}</dd></div>
            <div><dt>Sign-in method</dt><dd>GitHub</dd></div>
          </dl>
        </section>
        <section className="auth-notice mt-8" aria-labelledby="coming-next-title">
          <h3 id="coming-next-title">Ready for a Testnet payment.</h3>
          <p className="mt-3">Share an invoice so your customer can pay with Freighter. Verified Testnet payments produce a receipt with transaction and ledger details. No real funds are used.</p>
        </section>
      </main>
    </>
  );
}
