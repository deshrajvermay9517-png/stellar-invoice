import type { Wallet } from "./freighter.ts";
import { FlowError, flowMessage, type Attempt, type PaymentApi, type PaymentReview, type SavedPayment } from "./types.ts";

export type Phase = "loading" | "idle" | "connecting" | "ready" | "preparing" | "signing" | "submitting" | "confirming" | "cancelled" | "failed" | "uncertain" | "paid";
export type PaymentState = {
  phase: Phase; busy: boolean; recovered: boolean; address: string | null;
  available: boolean | null; walletIssue: string | null; message: string; attempt: Attempt | null;
};
const pollDelays = [0, 1500, 2500, 4000, 6000, 8000];
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    if (signal.aborted) done();
  });
}
export function createPaymentFlow(deps: {
  api: PaymentApi; wallet: Wallet; review: PaymentReview; onPaid: () => void;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}) {
  const initial: PaymentState = { phase: "loading", busy: false, recovered: false, address: null, available: null, walletIssue: null, message: "Checking saved payment status…", attempt: null };
  let snapshot = initial;
  let operation = 0;
  let stopped = false;
  let abort = new AbortController();
  let watching = false;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<PaymentState>) => { if (stopped) return; snapshot = { ...snapshot, ...patch }; listeners.forEach((listener) => listener()); };
  const alive = (id: number) => !stopped && operation === id;
  function paid() { update({ phase: "paid", message: "Payment verified on Stellar Testnet.", recovered: true }); deps.onPaid(); }
  function saved(value: SavedPayment) {
    update({ attempt: value.attempt, recovered: true });
    if (value.invoiceStatus === "PAID") { paid(); return true; }
    if (value.attempt?.status === "VERIFIED") throw new FlowError("INVALID_RESPONSE");
    return false;
  }
  function resting() {
    const attempt = snapshot.attempt;
    if (attempt?.status === "FAILED" || attempt?.status === "EXPIRED") {
      update({ phase: "failed", message: flowMessage(new FlowError(attempt.status === "FAILED" ? "TRANSACTION_FAILED" : "EXPIRED_UNPAID")) });
    } else if (attempt?.status === "UNKNOWN" || attempt?.status === "SUBMITTED") {
      update({ phase: "uncertain", message: "A saved payment is unresolved. Recheck it before making another payment." });
    } else update({ phase: snapshot.address ? "ready" : "idle", message: attempt ? "A prepared attempt was recovered. Connect the same payer to continue, or recheck its expiry." : "Connect Freighter to review and pay this Testnet invoice." });
  }
  async function poll(id: number, attemptId: string) {
    update({ phase: "confirming", message: "Waiting for network confirmation. The server is independently checking Testnet." });
    for (const delay of pollDelays) {
      await (deps.sleep ?? wait)(delay, abort.signal);
      if (!alive(id)) return;
      try {
        const result = await deps.api.verify(attemptId, abort.signal);
        if (!alive(id)) return;
        if (result.attemptId !== attemptId) throw new FlowError("INVALID_RESPONSE");
        update({ attempt: result });
        if (result.invoiceStatus === "PAID" && result.status === "VERIFIED" && result.receipt) { paid(); return; }
        if (result.status === "FAILED" || result.status === "EXPIRED") { resting(); return; }
      } catch { if (!alive(id)) return; }
    }
    update({ phase: "uncertain", message: "Confirmation is still unresolved. You can safely recheck this saved attempt. Do not send a replacement payment." });
  }
  async function run(work: (id: number) => Promise<void>) {
    if (snapshot.busy || stopped || snapshot.phase === "paid") return;
    const id = ++operation;
    update({ busy: true }); // Synchronous lock also prevents double clicks before React renders.
    try { await work(id); }
    catch (error) {
      if (!alive(id)) return;
      const code = error instanceof FlowError ? error.code : "REQUEST_FAILED";
      const walletIssue = ["WALLET_MISSING", "WALLET_LOCKED", "WALLET_UNAVAILABLE", "WRONG_NETWORK", "ACCOUNT_CHANGED", "ACCESS_REJECTED", "INVALID_WALLET_RESPONSE"].includes(code);
      const uncertain = ["REQUEST_FAILED", "PAYMENT_SERVICE_UNAVAILABLE", "RPC_UNAVAILABLE", "INVALID_RESPONSE", "RECHECK_REQUIRED", "ACTIVE_ATTEMPT_EXISTS", "INVOICE_ALREADY_PAID"].includes(code);
      update({ phase: code === "SIGN_CANCELLED" ? "cancelled" : uncertain ? "uncertain" : "failed", message: flowMessage(error),
        ...(uncertain ? { recovered: false } : {}), ...(walletIssue ? { walletIssue: code, address: null } : {}),
        ...(code === "WALLET_MISSING" ? { available: false } : {}) });
    } finally { if (alive(id)) update({ busy: false }); }
  }
  async function recover(id: number, explicit: boolean) {
    update({ phase: "loading", message: "Checking saved payment status…" });
    const value = await deps.api.load(abort.signal);
    if (!alive(id) || saved(value)) return;
    if (value.attempt && (explicit || ["UNKNOWN", "SUBMITTED"].includes(value.attempt.status))) await poll(id, value.attempt.attemptId);
    else resting();
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    async start() {
      stopped = false; abort = new AbortController();
      await run(async (id) => {
        await recover(id, false);
        if (!alive(id) || snapshot.phase === "paid") return;
        try { const available = await deps.wallet.available(); if (alive(id)) update({ available }); }
        catch { if (alive(id)) update({ available: null }); }
      });
    },
    stop() { stopped = true; operation++; abort.abort(); snapshot = { ...snapshot, busy: false }; },
    connect() {
      return run(async (id) => {
        update({ phase: "connecting", message: "Open Freighter and approve access to your public address." });
        const address = await deps.wallet.connect();
        if (!alive(id)) return;
        update({ address, walletIssue: null, available: true });
        await recover(id, false);
      });
    },
    recheck() { return run((id) => recover(id, true)); },
    async checkWallet() {
      if (stopped || watching || snapshot.busy || !snapshot.address || snapshot.phase === "paid") return;
      const id = operation;
      const expected = snapshot.address;
      watching = true;
      try { await deps.wallet.inspect(expected); }
      catch (error) {
        if (alive(id) && !snapshot.busy) update({ phase: "failed", address: null, walletIssue: error instanceof FlowError ? error.code : "WALLET_UNAVAILABLE", message: flowMessage(error) });
      } finally { watching = false; }
    },
    pay() {
      return run(async (id) => {
        if (!snapshot.address || snapshot.walletIssue) throw new FlowError("WALLET_LOCKED");
        const payer = snapshot.address;
        const current = await deps.api.load(abort.signal);
        if (!alive(id) || saved(current)) return;
        if (current.attempt && ["UNKNOWN", "SUBMITTED"].includes(current.attempt.status)) { await poll(id, current.attempt.attemptId); return; }
        await deps.wallet.inspect(payer);
        if (!alive(id)) return;
        update({ phase: "preparing", message: "Preparing the payment from the saved invoice details…" });
        const prepared = await deps.api.prepare(payer, abort.signal);
        if (!alive(id)) return;
        update({ attempt: { attemptId: prepared.attemptId, transactionHash: prepared.transactionHash, status: prepared.status, expiresAt: prepared.expiresAt,
          invoiceStatus: "OPEN", errorCode: null, receipt: null } });
        if (prepared.requiresRecheck || Date.parse(prepared.expiresAt) <= Date.now()) { await poll(id, prepared.attemptId); return; }
        for (const key of Object.keys(deps.review) as (keyof PaymentReview)[]) {
          if (prepared.review[key] !== deps.review[key]) throw new FlowError("REVIEW_CHANGED");
        }
        if (prepared.review.sourceAccount !== payer) throw new FlowError("ACCOUNT_CHANGED");
        update({ phase: "signing", message: "Awaiting your signature in Freighter. Review the amount, destination, memo and fee." });
        const signedXdr = await deps.wallet.sign(prepared.unsignedXdr, payer);
        if (!alive(id)) return;
        // Recheck saved state in case another tab submitted while Freighter was open.
        const latest = await deps.api.load(abort.signal);
        if (!alive(id) || saved(latest)) return;
        if (latest.attempt?.attemptId !== prepared.attemptId) throw new FlowError("RECHECK_REQUIRED");
        if (latest.attempt.status !== "PREPARED") { await poll(id, prepared.attemptId); return; }
        update({ phase: "submitting", message: "Submitting the signed Testnet transaction…" });
        try { await deps.api.submit(prepared.attemptId, signedXdr, abort.signal); }
        catch { /* The request may have reached the server. Recover the saved hash. */ }
        // Ignore acknowledgement for settlement. Only independent verify may pay.
        if (alive(id)) await poll(id, prepared.attemptId);
      });
    },
  };
}
