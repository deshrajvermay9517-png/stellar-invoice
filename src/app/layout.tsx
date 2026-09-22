import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StellarInvoice — Invoicing, with a clear path to payment",
  description:
    "Open-source invoicing with Freighter wallet payments and independently verified receipts on Stellar Testnet. Test XLM has no monetary value.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
