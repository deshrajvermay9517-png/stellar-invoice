import Link from "next/link";
import { signOutOfAccount } from "@/server/auth/actions";
import { AuthSubmitButton } from "./auth-submit-button";

export function MerchantHeader() {
  return (
    <header className="merchant-header shell">
      <Link className="brand" href="/">Stellar<span className="brand-light">Invoice</span></Link>
      <nav aria-label="Merchant navigation">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/invoices">Invoices</Link>
        <Link href="/invoices/new">Create invoice</Link>
        <Link href="/settings">Settings</Link>
      </nav>
      <form action={signOutOfAccount}>
        <AuthSubmitButton pendingLabel="Signing out…">Sign out</AuthSubmitButton>
      </form>
    </header>
  );
}
