import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthSubmitButton } from "@/components/auth-submit-button";
import { signInWithGitHub } from "@/server/auth/actions";
import { getSession } from "@/server/auth/session";
import { isAuthConfigured } from "@/server/env";

export const metadata: Metadata = { title: "Sign in — StellarInvoice", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const configured = isAuthConfigured();
  const session = await getSession();
  if (session?.user?.id) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    <main id="main-content" className="utility-page shell">
      <Link className="brand mb-12" href="/">Stellar<span className="brand-light">Invoice</span></Link>
      <p className="eyebrow"><span className="status-dot" />STELLAR TESTNET</p>
      <h1>A home for<br />your next chapter.</h1>
      <p>Sign in with GitHub to manage your invoices and receiving account. Customers can pay public invoices with Freighter on Stellar Testnet.</p>
      {!configured ? (
        <div className="auth-notice" role="status">
          Sign-in is not available yet. The site operator needs to finish authentication and database setup.
        </div>
      ) : (
        <>
          {error && (
            <div className="auth-notice" role="alert">
              We couldn’t complete sign-in. Please try again. If the problem continues, contact the site operator.
            </div>
          )}
          <form action={signInWithGitHub}>
            <AuthSubmitButton pendingLabel="Connecting to GitHub…">Continue with GitHub</AuthSubmitButton>
          </form>
        </>
      )}
      <Link className="nav-link inline-flex mt-6" href="/">Back to home</Link>
    </main>
  );
}
