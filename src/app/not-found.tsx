import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="utility-page shell">
      <p className="eyebrow">STELLARINVOICE / 404</p>
      <h1>This page is<br />off the map.</h1>
      <p>The page you’re looking for doesn’t exist. Head back to explore StellarInvoice.</p>
      <Link className="button-primary" href="/">Back to home <span aria-hidden="true">↗</span></Link>
    </main>
  );
}
