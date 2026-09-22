import type { Metadata } from "next";
import Link from "next/link";
import { MerchantHeader } from "@/components/merchant-header";
import { invoiceService } from "@/server/invoices/service";
import { formatXlm } from "@/lib/amount";

export const metadata: Metadata = { title: "Invoices — StellarInvoice", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const query = await searchParams;
  const number = Number(query.page ?? 1);
  const page = Number.isSafeInteger(number) && number >= 1 && number <= 10000 ? number : 1;
  const rows = await invoiceService().listInvoices(page);
  return <><MerchantHeader /><main id="main-content" className="shell section-space">
    <div className="section-heading"><div><p className="eyebrow">YOUR INVOICES / STELLAR TESTNET</p><h1 className="dashboard-title">A clear paper trail.</h1></div><Link className="button-primary" href="/invoices/new">Create invoice</Link></div>
    {!rows.length ? <div className="auth-notice"><h2>No invoices here yet.</h2><p className="mt-4">Create an invoice to keep the details of your work in one place.</p></div> : <div className="invoice-table-wrap" role="region" aria-label="Your invoices" tabIndex={0}>
      <table className="invoice-table"><caption className="sr-only">Invoices belonging to your account</caption><thead><tr><th scope="col">Customer</th><th scope="col">Amount</th><th scope="col">Due date</th><th scope="col">Status</th><th scope="col">Created (UTC)</th></tr></thead>
        <tbody>{rows.slice(0, 20).map((invoice) => <tr key={invoice.id}>
          <td><Link href={`/invoices/${invoice.id}`}>{invoice.customerName}</Link></td>
          <td>{formatXlm(invoice.amountStroops)} XLM</td><td><time dateTime={invoice.dueDate}>{invoice.dueDate}</time></td>
          <td><span className="status-pill">{invoice.status}</span></td><td>{invoice.createdAt.toISOString().slice(0, 10)}</td>
        </tr>)}</tbody></table>
    </div>}
    <nav className="utility-actions mt-6" aria-label="Invoice pages">{page > 1 && <Link className="button-secondary" href={`/invoices?page=${page - 1}`}>Previous</Link>}{rows.length > 20 && page < 10000 && <Link className="button-secondary" href={`/invoices?page=${page + 1}`}>Next</Link>}</nav>
  </main></>;
}
