# Milestone 5: Freighter Testnet payments

The public invoice now connects to the Freighter browser extension using `@stellar/freighter-api@6.0.1`. It reuses the Milestone 4 backend for preparation, submission, verification and recovery. No database migration, new credential, wallet provider, or secret-key storage was added.

## Flow and safety

1. Opening `/pay/[token]` reads persisted payment status. It can detect Freighter availability, but never requests wallet access automatically.
2. **Connect Freighter** explicitly calls `requestAccess`, reads the selected public G-address, and checks the network passphrase against fixed Stellar Testnet. Unlock the extension first if necessary. Account/network changes are monitored while connected and rechecked immediately around signing.
3. The review shows amount, XLM, destination, Testnet, memo/reference and the expected 100-stroop fee (0.00001 XLM). Clicking **Pay invoice** sends only the public token and payer address to the preparation API. Returned server review fields must match the displayed review; the browser does not build a transaction.
4. Freighter receives the server's unsigned XDR with explicit `networkPassphrase` and `address` options. Its current `{ signedTxXdr, signerAddress }` response is validated, including signer/account consistency. The backend still performs full XDR integrity validation. Signing stays in the extension.
5. Signed XDR is sent only to the existing submission endpoint. It exists transiently in the browser operation, never in React state, localStorage, sessionStorage, URLs or logs. The backend persists it as the pre-existing recovery architecture requires. No private signing material is ever requested or transmitted.
6. Submission acknowledgement only leads to **Waiting for network confirmation**. Independent verification is required before PAID and navigation to `/pay/[token]/receipt`.

The flow controller uses a synchronous busy lock, so fast duplicate clicks cannot prepare/sign/submit twice. It abandons late wallet results after unmount. Wallet reads time out after 15 seconds; signing can wait up to two minutes. Only fixed, safe error messages are displayed. Wallet account changes require explicit reconnection.

## Recovery

Payment state comes from the database after refresh, browser restart or reopening the link. No browser storage is necessary. A saved PREPARED attempt can be continued with its original payer. SUBMITTED and UNKNOWN attempts trigger bounded independent verification and block replacement payments. A cancelled signature leaves its prepared attempt available; cancellation does not submit anything.

Polling performs at most six rechecks, with waits of 0, 1.5, 2.5, 4, 6 and 8 seconds; each HTTP request has a 20-second bound. If the result stays uncertain or RPC fails, polling stops and the user can explicitly select **Recheck payment status**. No background worker or endless polling loop was added. A wallet/network change does not erase or replace a saved attempt.

Network rejection or a stale sequence remains unresolved until the backend confirms failure or proves expiry without settlement. Only then may the user explicitly prepare another transaction with a fresh source sequence. Expiry alone is not proof of failure. These rules come from the Milestone 4 service; the client cannot override them.

## Receipts and privacy

`/pay/[token]/receipt` is server rendered, uncached, and excluded from indexing. It selects only PAID status, amount, asset, network, public payer/destination accounts, transaction hash, ledger, ledger close time and payment reference. The invoice must have a matching verified payment and VERIFIED attempt. Unpaid receipt URLs redirect to the invoice; unknown tokens are not found.

The same receipt presentation appears on the authenticated merchant detail page after a server-side ownership check. StellarExpert links always point to Testnet and disable referrer sharing. Receipt pages exclude customer email/name, internal record IDs, signed XDR and session/OAuth fields. Public invoice review now includes the payment reference because the payer must review the memo before signing.

## Minimal manual acceptance test

The app must run at the canonical origin in `AUTH_URL` (normally `http://localhost:3000`). If no server is running, from the project root run:

```powershell
$env:NODE_OPTIONS='--use-system-ca'
npm run dev
```

The system-CA option is for the existing Windows environment; do not disable certificate verification.

1. In the desktop browser where Freighter is installed, unlock it and select **Testnet** with your funded payer account. Its address must differ from the invoice destination. The receiving account must also exist on Testnet for a native payment to succeed. No seed phrase or secret key is needed by this app.
2. Open an existing OPEN invoice's public link (or sign in as merchant and create a small Testnet invoice). Click **Connect Freighter** and approve public-address access.
3. Check the displayed payer, amount, destination, Testnet network, reference and fee. Click **Pay invoice**, then approve the matching transaction in Freighter.
4. Wait for independent confirmation. The app should navigate to a **PAID** receipt with the transaction hash, payer, destination and ledger time. Open the StellarExpert link to inspect the Testnet transaction. If confirmation remains uncertain, use **Recheck payment status**, not a second payment.
5. Refresh/reopen the public link: payment controls should be absent and the receipt still available. Refresh the merchant invoice detail: it should show PAID and the same verified transaction/ledger.

Use your normal Freighter-enabled browser, not the Codex preview browser, which does not have the extension. This interactive acceptance test cannot be completed by automated wallet mocks.

## Automated checks

`tests/wallet-payment.test.mjs` mocks Freighter messages without any wallet keys. It tests missing/locked wallets, rejected access, network/account switching, cancellation, current signed-XDR handling, malformed responses, authoritative review comparison, acknowledgement versus verification, bounded polling, timeout recovery, persisted refresh, double clicks and unmount safety. `tests/receipts.test.mjs` tests safe public projection, owner authorization, verified-state requirements and Testnet-only explorer URLs. Existing backend integrity/settlement tests remain in place.

Validation commands: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Live read-only checks may inspect RPC identity, public rendering and server state; they do not replace the manual signed-payment acceptance test.

## Release hardening

Milestone 6 adds bounded database transport and one retry for designated safe reads. Outages remain uncertain without replacement payments. See [release notes](release-readiness.md). The maintainer has accepted the manual Testnet payment flow; another payment is not required for publication preparation.

References: [Freighter connecting](https://docs.freighter.app/extension-freighter-api/connecting.md), [Freighter signing](https://docs.freighter.app/extension-freighter-api/signing.md), [StellarExpert Testnet](https://stellar.expert/explorer/testnet).
