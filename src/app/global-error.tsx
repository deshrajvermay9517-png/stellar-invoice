"use client";

// This fallback replaces the root layout, so it cannot depend on global styles.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#111923", color: "#f5f3eb", fontFamily: "Arial, sans-serif" }}>
        <main id="main-content" style={{ maxWidth: 600, margin: "auto", padding: "80px 24px", lineHeight: 1.7 }}>
          <p>StellarInvoice</p>
          <h1>Something went wrong.</h1>
          <p>We couldn’t load the application. Please try again.</p>
          <button onClick={reset} style={{ cursor: "pointer", padding: "14px 24px", background: "#d6ef8c", color: "#111923", border: 0, borderRadius: 4, fontSize: 16 }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
