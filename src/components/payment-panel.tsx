"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPaymentFlow } from "@/client/payments/controller";
import { createPaymentApi } from "@/client/payments/api";
import { browserWallet } from "@/client/payments/freighter";
import type { PaymentReview } from "@/client/payments/types";
import { formatXlm } from "@/lib/amount";

export function PaymentPanel({ token, review }: { token: string; review: PaymentReview }) {
  const router = useRouter();
  const [flow] = useState(() => createPaymentFlow({ api: createPaymentApi(token), wallet: browserWallet(), review,
    onPaid: () => router.replace(`/pay/${token}/receipt`) }));
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getServerSnapshot);
  useEffect(() => {
    void flow.start();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void flow.checkWallet(); }, 4000);
    const focus = () => { void flow.checkWallet(); };
    window.addEventListener("focus", focus);
    return () => { clearInterval(timer); window.removeEventListener("focus", focus); flow.stop(); };
  }, [flow]);
  if (state.phase === "paid") return <section className="auth-notice mt-8" role="status"><h2>Payment verified.</h2><p>Your invoice is PAID.</p><Link className="button-primary mt-4" href={`/pay/${token}/receipt`}>View verified receipt</Link></section>;
  const unresolved = state.attempt && ["SUBMITTED", "UNKNOWN"].includes(state.attempt.status);
  const canPay = state.recovered && state.address && !state.walletIssue && !unresolved && state.phase !== "uncertain";
  return <section className="payment-panel mt-8" aria-labelledby="payment-title">
    <p className="eyebrow">PAY WITH FREIGHTER</p><h2 id="payment-title">Review your payment.</h2>
    <p className="auth-notice mt-4">Stellar Testnet only. Test XLM has no real monetary value.</p>
    <dl className="account-details payment-review">
      <div><dt>Amount / asset</dt><dd>{formatXlm(review.amountStroops)} XLM</dd></div>
      <div><dt>Destination</dt><dd className="mono-address">{review.destinationAccount}</dd></div>
      <div><dt>Network</dt><dd>Stellar Testnet</dd></div>
      <div><dt>Reference / memo</dt><dd className="mono-address">{review.paymentReference}</dd></div>
      <div><dt>Expected fee</dt><dd>{formatXlm(review.feeStroops)} XLM ({review.feeStroops} stroops)</dd></div>
      {state.address && <div><dt>Connected payer</dt><dd className="mono-address">{state.address}</dd></div>}
    </dl>
    <p className="field-hint mt-4">Your wallet signs the transaction. The server confirms payment independently before marking this invoice paid.</p>
    <div className="payment-progress mt-6" role="status" aria-live="polite" aria-atomic="true">
      <span className="status-pill">{state.phase === "confirming" ? "WAITING FOR NETWORK CONFIRMATION" : state.phase === "signing" ? "AWAITING SIGNATURE" : state.phase.toUpperCase()}</span>
      <p className="mt-3">{state.message}</p>
    </div>
    {state.available === false && <p className="field-hint mt-4">Freighter is not installed in this browser. <a href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Get Freighter ↗</a>, unlock it, and choose Testnet.</p>}
    <div className="utility-actions mt-6">
      <button className="button-secondary" disabled={state.busy} onClick={() => { void flow.connect(); }}>{state.address ? "Reconnect wallet" : "Connect Freighter"}</button>
      <button className="button-primary" disabled={state.busy || !canPay} onClick={() => { void flow.pay(); }}>Pay invoice · {formatXlm(review.amountStroops)} XLM</button>
      <button className="button-secondary" disabled={state.busy} onClick={() => { void flow.recheck(); }}>Recheck payment status</button>
    </div>
    {state.attempt && <p className="field-hint mt-4">Saved attempt: {state.attempt.status.toLowerCase()}. You can close this page and return to recover its status. {unresolved ? "A new payment is blocked while this attempt is unresolved." : ""}</p>}
  </section>;
}
