import Link from "next/link";

const steps = [
  { number: "01", title: "Make it an invoice.", description: "Bring your customer, project, amount, and due date together in one straightforward invoice.", detail: "A little less admin." },
  { number: "02", title: "Send one simple link.", description: "Give your customer a dedicated payment page, with the details they need to pay in XLM.", detail: "A clearer next step." },
  { number: "03", title: "Know when it’s paid.", description: "Get a receipt after the transaction has been independently verified on the Stellar network.", detail: "A record you can follow." },
];

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h16m-6-6 6 6-6 6"} />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <header className="site-header shell">
        <Link className="brand" href="/" aria-label="StellarInvoice home">
          <span className="brand-mark" aria-hidden="true">s<span>i</span></span>
          Stellar<span className="brand-light">Invoice</span>
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-7">
          <a className="nav-link hidden sm:inline-flex" href="#how-it-works">The idea</a>
          <a className="nav-link hidden sm:inline-flex" href="#principles">Our approach</a>
          <Link className="nav-link inline-flex" href="/sign-in">Sign in</Link>
          <a className="network-badge" href="#testnet"><span className="status-dot" />Stellar Testnet<Arrow diagonal /></a>
        </nav>
      </header>

      <main id="main-content">
        <section className="hero shell" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="small-line" />FOR THE WORK YOU DO</p>
            <h1 id="hero-title">Great work.<br />Clear invoices.<br /><span>A stellar finish.</span></h1>
            <p className="hero-description">A simpler way from your last deliverable to your next payment. Open-source invoicing for freelancers and small businesses, built around Stellar.</p>
            <a className="button-primary" href="#how-it-works">Explore the idea <Arrow /></a>
            <p className="availability"><span className="status-dot" />In development · Testnet only</p>
          </div>

          <figure className="invoice-scene" aria-labelledby="preview-caption">
            <div className="orbit orbit-one" aria-hidden="true" />
            <div className="orbit orbit-two" aria-hidden="true" />
            <div className="scene-star" aria-hidden="true">✳</div>
            <div className="invoice-card">
              <div className="invoice-top"><span className="invoice-wordmark">INVOICE</span><span className="sample-badge">SAMPLE</span></div>
              <div className="invoice-heading"><div><p className="invoice-label">From independent work</p><p className="invoice-name">To your next chapter.</p></div><span className="paper-symbol" aria-hidden="true">↗</span></div>
              <div className="invoice-parties"><div><p className="invoice-label">ISSUED BY</p><p>Alex Morgan</p><span>Independent designer</span></div><div><p className="invoice-label">BILLED TO</p><p>Orbit Studio</p><span>Creative partners</span></div></div>
              <div className="invoice-item"><span>Brand identity & design</span><span>250.00 XLM</span></div>
              <div className="invoice-total"><span>Total due</span><strong>250.00 <small>XLM</small></strong></div>
              <div className="invoice-note"><span className="outline-dot" />Designed for direct wallet payments</div>
              <div className="paper-footer"><span>YOUR WORK. YOUR WALLET.</span><span>001</span></div>
            </div>
            <figcaption id="preview-caption"><span className="caption-line" />An early look. Illustrative invoice, not a payment request.</figcaption>
          </figure>
        </section>

        <div className="principle-strip shell" aria-label="Product focus"><span>MADE FOR INDEPENDENCE</span><p>Simple invoices</p><span className="strip-cross" aria-hidden="true">+</span><p>Stellar-native payments</p><span className="strip-cross" aria-hidden="true">+</span><p>Open-source foundations</p></div>

        <section className="workflow shell section-space" id="how-it-works" aria-labelledby="workflow-title">
          <div className="section-heading"><div><p className="eyebrow">THE PATH TO PAID</p><h2 id="workflow-title">Less chasing.<br />More creating.</h2></div><p>One focused flow, from invoice to receipt.<br />Here’s what we’re building.</p></div>
          <div className="steps-grid">{steps.map((step) => <article className="step" key={step.number}><span className="step-number">{step.number}<Arrow diagonal /></span><h3>{step.title}</h3><p>{step.description}</p><span className="step-detail">{step.detail}</span></article>)}</div>
        </section>

        <section className="approach shell" id="principles" aria-labelledby="approach-title">
          <div><p className="eyebrow">BUILT WITH INTENTION</p><h2 id="approach-title">Your work deserves<br />a clear paper trail.</h2></div>
          <div className="approach-details"><article><h3>Direct by design <span aria-hidden="true">↗</span></h3><p>Testnet payments go from your customer’s wallet to your receiving account. Your private keys stay with you.</p></article><article><h3>Verified before it’s paid <span aria-hidden="true">↗</span></h3><p>Every payment receipt follows independent verification of the Testnet transaction.</p></article><article><h3>Open from the start <span aria-hidden="true">↗</span></h3><p>A focused, open-source project built to be understandable, maintainable, and useful.</p></article></div>
        </section>

        <section className="testnet-panel shell" id="testnet" aria-labelledby="testnet-title"><div><p className="eyebrow"><span className="status-dot" />THE FIRST CHAPTER</p><h2 id="testnet-title">A testing ground.<br />A thoughtful beginning.</h2><p>StellarInvoice currently targets <strong>Stellar Testnet</strong>. Create invoices and pay with Freighter on Testnet. Payments are independently verified before invoices are marked paid. No real funds are used.</p></div><a className="button-secondary" href="https://developers.stellar.org/docs/networks">Learn about Testnet <Arrow diagonal /></a></section>
      </main>

      <footer className="site-footer shell"><Link className="brand footer-brand" href="/">Stellar<span className="brand-light">Invoice</span></Link><p>For independent work. Built on open possibilities.</p><a href="#main-content">Back to top <span aria-hidden="true">↑</span></a></footer>
    </>
  );
}
