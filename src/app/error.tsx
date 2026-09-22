"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main-content" className="utility-page shell">
      <p className="eyebrow">STELLARINVOICE / SOMETHING WENT WRONG</p>
      <h1>A small interruption.</h1>
      <p>We couldn’t load this page. Try again, or return to the homepage. If you were paying an invoice, reopen that same link and recheck its saved status before sending another payment.</p>
      <div className="utility-actions"><button className="button-primary" onClick={reset}>Try again</button><Link className="button-secondary" href="/">Back to home</Link></div>
    </main>
  );
}
