import assert from "node:assert/strict";
import { test } from "node:test";
import { createFreighterWallet } from "../src/client/payments/freighter.ts";
import { createPaymentFlow } from "../src/client/payments/controller.ts";
import { createPaymentApi } from "../src/client/payments/api.ts";
import { FlowError } from "../src/client/payments/types.ts";
import { TESTNET_PASSPHRASE } from "../src/lib/stellar-network.ts";

// Public addresses only. Wallet signatures are opaque mocked messages, never keys.
const payer = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const destination = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const signedXdr = "A".repeat(80); // Synthetic transport fixture, not a signed transaction.
const hash = "a".repeat(64);
const review = { amountStroops: 10000000, feeStroops: 100, destinationAccount: destination, paymentReference: "fixture-reference", asset: "XLM", network: "TESTNET" };
const expiresAt = "2099-01-01T00:00:00.000Z";
function freighterFixture() {
  const calls = { access: 0, sign: 0 };
  const api = {
    isConnected: async () => ({ isConnected: true }),
    requestAccess: async () => { calls.access++; return { address: payer }; },
    getAddress: async () => ({ address: payer }),
    getNetworkDetails: async () => ({ network: "TESTNET", networkPassphrase: TESTNET_PASSPHRASE }),
    signTransaction: async (xdr, options) => {
      calls.sign++; assert.equal(xdr, "unsigned-from-server");
      assert.deepEqual(options, { address: payer, networkPassphrase: TESTNET_PASSPHRASE });
      return { signedTxXdr: signedXdr, signerAddress: payer };
    },
  };
  return { api, calls, wallet: createFreighterWallet(api) };
}
function attempt(status = "PREPARED") {
  return { attemptId: "fixture-attempt", status, invoiceStatus: status === "VERIFIED" ? "PAID" : "OPEN", transactionHash: hash, expiresAt, errorCode: null,
    receipt: status === "VERIFIED" ? { transactionHash: hash, ledger: 123, ledgerClosedAt: "2026-09-21T12:00:00.000Z" } : null };
}

test("database outage after wallet signing keeps the saved attempt uncertain without submission or replacement", async () => {
  const f = flowFixture();
  await f.flow.start(); await f.flow.connect();
  const originalSign = f.wallet.sign;
  f.wallet.sign = async (...args) => {
    const signed = await originalSign(...args);
    f.api.load = async () => { throw new FlowError("PAYMENT_SERVICE_UNAVAILABLE"); };
    return signed;
  };
  await f.flow.pay();
  assert.equal(f.flow.getSnapshot().phase, "uncertain");
  assert.equal(f.flow.getSnapshot().attempt.status, "PREPARED");
  assert.equal(f.flow.getSnapshot().recovered, false);
  await f.flow.pay();
  assert.equal(f.calls.prepare, 1); assert.equal(f.calls.submit, 0); assert.equal(f.calls.paid, 0);
});
function flowFixture() {
  const f = freighterFixture();
  const calls = { ...f.calls, prepare: 0, submit: 0, verify: 0, paid: 0, loads: 0 };
  let persisted = { invoiceStatus: "OPEN", attempt: null };
  const prepared = { attemptId: "fixture-attempt", transactionHash: hash, unsignedXdr: "unsigned-from-server", expiresAt, status: "PREPARED", requiresRecheck: false, network: "TESTNET", review: { ...review, sourceAccount: payer } };
  const api = {
    load: async () => { calls.loads++; return structuredClone(persisted); },
    prepare: async (address) => { assert.equal(address, payer); calls.prepare++; persisted.attempt = attempt(); return structuredClone(prepared); },
    submit: async (id, value) => { calls.submit++; assert.equal(id, prepared.attemptId); assert.equal(value, signedXdr); persisted.attempt = attempt("SUBMITTED"); return structuredClone(persisted.attempt); },
    verify: async () => { calls.verify++; persisted = { invoiceStatus: "PAID", attempt: attempt("VERIFIED") }; return structuredClone(persisted.attempt); },
  };
  const makeFlow = () => createPaymentFlow({ api, wallet: f.wallet, review, onPaid: () => { calls.paid++; }, sleep: async () => {} });
  return { ...f, api, walletApi: f.api, calls, walletCalls: f.calls, prepared, flow: makeFlow(), makeFlow,
    persist: (value) => { persisted = value; } };
}
test("Freighter unavailable never requests access", async () => {
  const { api, wallet, calls } = freighterFixture(); api.isConnected = async () => ({ isConnected: false });
  await assert.rejects(() => wallet.connect(), /WALLET_MISSING/); assert.equal(calls.access, 0);
});
test("access rejection is handled without exposing extension error details", async () => {
  const { api, wallet } = freighterFixture(); api.requestAccess = async () => ({ error: { code: 4001, message: "User rejected: private extension detail" } });
  await assert.rejects(() => wallet.connect(), (error) => error.code === "ACCESS_REJECTED" && !error.message.includes("private"));
});
test("locked wallet and malformed address are rejected", async () => {
  const { api, wallet } = freighterFixture(); api.getAddress = async () => ({ address: "" });
  await assert.rejects(() => wallet.connect(), /WALLET_LOCKED/);
  api.getAddress = async () => ({ address: "not-a-public-address" });
  await assert.rejects(() => wallet.connect(), /INVALID_WALLET_RESPONSE/);
});
test("network passphrase is checked even when wallet labels the network TESTNET", async () => {
  const { api, wallet, calls } = freighterFixture(); api.getNetworkDetails = async () => ({ network: "TESTNET", networkPassphrase: "Public Global Stellar Network ; September 2015" });
  await assert.rejects(() => wallet.connect(), /WRONG_NETWORK/);
  await assert.rejects(() => wallet.sign("unsigned-from-server", payer), /WRONG_NETWORK/);
  assert.equal(calls.sign, 0);
});
test("account switch before signing prevents the popup", async () => {
  const { api, wallet, calls } = freighterFixture(); api.getAddress = async () => ({ address: destination });
  await assert.rejects(() => wallet.sign("unsigned-from-server", payer), /ACCOUNT_CHANGED/); assert.equal(calls.sign, 0);
});
test("user cancellation is distinct from a successful signature", async () => {
  const { api, wallet } = freighterFixture(); api.signTransaction = async () => ({ error: { message: "The user rejected this request." } });
  await assert.rejects(() => wallet.sign("unsigned-from-server", payer), /SIGN_CANCELLED/);
});
test("current Freighter signedTxXdr format is passed through with explicit account and Testnet", async () => {
  const { wallet } = freighterFixture(); assert.equal(await wallet.sign("unsigned-from-server", payer), signedXdr);
});
test("malformed signing response or unexpected signer cannot be submitted", async () => {
  const { api, wallet } = freighterFixture();
  for (const value of [null, { signedXdr, signerAddress: payer }, { signedTxXdr: "not XDR", signerAddress: payer }, { signedTxXdr: signedXdr, signerAddress: destination }]) {
    api.signTransaction = async () => value; await assert.rejects(() => wallet.sign("unsigned-from-server", payer));
  }
});
test("network/account changes while approval is open invalidate the signature response", async () => {
  for (const change of ["network", "account"]) {
    const { api, wallet } = freighterFixture();
    api.signTransaction = async () => {
      if (change === "network") api.getNetworkDetails = async () => ({ networkPassphrase: "wrong" });
      else api.getAddress = async () => ({ address: destination });
      return { signedTxXdr: signedXdr, signerAddress: payer };
    };
    await assert.rejects(() => wallet.sign("unsigned-from-server", payer), change === "network" ? /WRONG_NETWORK/ : /ACCOUNT_CHANGED/);
  }
});
test("mount and refresh recover server state without requesting wallet permissions", async () => {
  const f = flowFixture(); await f.flow.start(); assert.equal(f.walletCalls.access, 0); assert.equal(f.calls.prepare, 0); assert.equal(f.flow.getSnapshot().recovered, true);
});
test("successful payment signs server XDR, submits once and pays only after verification", async () => {
  const f = flowFixture(); const phases = []; f.flow.subscribe(() => phases.push(f.flow.getSnapshot().phase));
  await f.flow.start(); await f.flow.connect(); await f.flow.pay();
  assert.equal(f.calls.prepare, 1); assert.equal(f.calls.submit, 1); assert.equal(f.calls.verify, 1); assert.equal(f.calls.paid, 1);
  assert.equal(f.flow.getSnapshot().phase, "paid");
  for (const phase of ["preparing", "signing", "submitting", "confirming", "paid"]) assert.ok(phases.includes(phase), phase);
});
test("submission acknowledgement never marks PAID; polling is bounded", async () => {
  const f = flowFixture(); f.api.verify = async () => { f.calls.verify++; return attempt("UNKNOWN"); };
  await f.flow.start(); await f.flow.connect(); await f.flow.pay();
  assert.equal(f.calls.submit, 1); assert.equal(f.calls.verify, 6); assert.equal(f.calls.paid, 0);
  assert.equal(f.flow.getSnapshot().phase, "uncertain");
});
test("even a paid submission response must be independently reverified", async () => {
  const f = flowFixture(); f.api.submit = async () => attempt("VERIFIED"); f.api.verify = async () => attempt("UNKNOWN");
  await f.flow.start(); await f.flow.connect(); await f.flow.pay();
  assert.equal(f.calls.paid, 0); assert.equal(f.flow.getSnapshot().phase, "uncertain");
});
test("verification recheck resumes pending state and transitions to paid", async () => {
  const f = flowFixture(); f.persist({ invoiceStatus: "OPEN", attempt: attempt("SUBMITTED") });
  await f.flow.start(); assert.equal(f.flow.getSnapshot().phase, "paid"); assert.equal(f.calls.prepare, 0); assert.equal(f.walletCalls.access, 0);
});
test("uncertain submission recovers the same attempt without preparing another", async () => {
  const f = flowFixture(); f.api.submit = async () => { throw new FlowError("REQUEST_FAILED"); };
  await f.flow.start(); await f.flow.connect(); await f.flow.pay();
  assert.equal(f.flow.getSnapshot().phase, "paid"); assert.equal(f.calls.prepare, 1); assert.equal(f.calls.verify, 1);
});
test("browser restart and repeated refresh after payment stay idempotent", async () => {
  const f = flowFixture(); f.persist({ invoiceStatus: "PAID", attempt: attempt("VERIFIED") });
  await f.flow.start(); const refreshed = f.makeFlow(); await refreshed.start(); await refreshed.pay();
  assert.equal(refreshed.getSnapshot().phase, "paid"); assert.equal(f.calls.prepare, 0); assert.equal(f.calls.submit, 0); assert.equal(f.walletCalls.access, 0);
});
test("double click protection covers connection, signing and submission", async () => {
  const f = flowFixture(); await f.flow.start();
  await Promise.all([f.flow.connect(), f.flow.connect()]); assert.equal(f.walletCalls.access, 1);
  await Promise.all([f.flow.pay(), f.flow.pay()]);
  assert.equal(f.walletCalls.sign, 1); assert.equal(f.calls.prepare, 1); assert.equal(f.calls.submit, 1);
});
test("signature cancellation preserves the attempt and never submits", async () => {
  const f = flowFixture(); f.walletApi.signTransaction = async () => ({ error: { message: "User cancelled" } });
  await f.flow.start(); await f.flow.connect(); await f.flow.pay();
  assert.equal(f.flow.getSnapshot().phase, "cancelled"); assert.equal(f.calls.submit, 0); assert.equal(f.flow.getSnapshot().attempt.status, "PREPARED");
});
test("authoritative review mismatch blocks signing", async () => {
  const f = flowFixture(); f.prepared.review.amountStroops++;
  await f.flow.start(); await f.flow.connect(); await f.flow.pay(); assert.equal(f.calls.submit, 0); assert.equal(f.walletCalls.sign, 0);
  assert.match(f.flow.getSnapshot().message, /does not match/);
});
test("wallet monitoring detects account/network changes without requesting access", async () => {
  const f = flowFixture(); await f.flow.start(); await f.flow.connect();
  f.walletApi.getAddress = async () => ({ address: destination }); await f.flow.checkWallet();
  assert.equal(f.flow.getSnapshot().phase, "failed"); assert.equal(f.flow.getSnapshot().address, null); assert.equal(f.flow.getSnapshot().walletIssue, "ACCOUNT_CHANGED"); assert.equal(f.walletCalls.access, 1);
});
test("confirmed expiry/failure allows an explicit retry, never an automatic replacement", async () => {
  for (const terminal of ["EXPIRED", "FAILED"]) {
    const f = flowFixture(); f.persist({ invoiceStatus: "OPEN", attempt: attempt("UNKNOWN") });
    f.api.verify = async () => { const result = attempt(terminal); f.persist({ invoiceStatus: "OPEN", attempt: result }); return result; };
    await f.flow.start(); assert.equal(f.flow.getSnapshot().phase, "failed"); assert.equal(f.calls.prepare, 0);
  }
});
test("unmount while signing prevents any later submission", async () => {
  const f = flowFixture(); let finish;
  f.walletApi.signTransaction = () => new Promise((resolve) => { finish = resolve; });
  await f.flow.start(); await f.flow.connect(); const paying = f.flow.pay();
  while (!finish) await new Promise((resolve) => setTimeout(resolve, 0));
  f.flow.stop(); finish({ signedTxXdr: signedXdr, signerAddress: payer }); await paying;
  assert.equal(f.calls.submit, 0);
});
test("HTTP client sends only payer for preparation and signed XDR for submission", async () => {
  const calls = [];
  const api = createPaymentApi("t".repeat(32), async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/prepare")) return Response.json({ ...attempt(), unsignedXdr: "server-xdr", network: "TESTNET", requiresRecheck: false, review: { ...review, sourceAccount: payer } });
    return Response.json(attempt("SUBMITTED"));
  });
  await api.prepare(payer); await api.submit("fixture-attempt", signedXdr);
  assert.deepEqual(JSON.parse(calls[0].options.body), { sourceAccount: payer });
  assert.deepEqual(JSON.parse(calls[1].options.body), { signedXdr });
  assert.equal(calls[1].options.credentials, "omit");
});
test("malformed backend responses never produce paid state", async () => {
  for (const value of [null, { invoiceStatus: "SUCCESS" }, { invoiceStatus: "OPEN", attempt: { status: "VERIFIED" } }]) {
    const api = createPaymentApi("t".repeat(32), async () => Response.json(value)); await assert.rejects(() => api.load(), /INVALID_RESPONSE/);
  }
});
