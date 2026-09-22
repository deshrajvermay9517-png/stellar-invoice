# Milestone 4: Testnet payment backend

This milestone adds backend preparation, signed-envelope submission, independent verification and atomic settlement. Milestone 5 now supplies the Freighter client and receipt UI; see [the wallet guide](freighter-payments.md). No private keys are requested or stored. All amounts remain exact integer stroops. The only new direct dependency is `@stellar/stellar-sdk@17.1.0`.

## Configuration

`STELLAR_RPC_URL=https://soroban-testnet.stellar.org` is documented in `.env.example` and is also the server default, so existing local credentials need no modification. Custom trusted RPC endpoints must use HTTPS. Every preparation, submission and RPC verification calls `getNetwork` and requires the exact `Networks.TESTNET` passphrase. Mainnet is rejected. No network setting comes from the client.

The SDK's HTTP transport has a 10-second timeout and a 2 MiB response limit. RPC timestamp strings are validated and converted to safe integer seconds. Keep TLS verification enabled. On Windows environments needing the system trust store, start Node with `NODE_OPTIONS=--use-system-ca` (PowerShell: `$env:NODE_OPTIONS='--use-system-ca'`).

## API contract

These public endpoints require possession of the invoice's cryptographically random bearer token. Attempt IDs are always looked up together with that token. They never authorize against a client owner ID. Responses are uncached, suppress indexing/referrers and omit customer email/name, owner data, payer addresses and signed XDR. Preparation returns unsigned XDR for the payer address that the caller supplied.

| Method | Route | JSON body / purpose |
| --- | --- | --- |
| GET | `/api/pay/[token]` | Safe invoice status and recoverable latest/active attempt identity |
| POST | `/api/pay/[token]/prepare` | `{ "sourceAccount": "G…" }` |
| GET | `/api/pay/[token]/attempts/[attemptId]` | Safe persisted status and verified receipt, if any |
| POST | `/api/pay/[token]/attempts/[attemptId]/submit` | `{ "signedXdr": "…" }` |
| POST | `/api/pay/[token]/attempts/[attemptId]/verify` | `{}`; independently recheck RPC |

POST requests require JSON and are capped at 24,000 actual streamed bytes. Unexpected fields, including amount, destination, network, owner and success flags, are rejected. Browser cross-site writes are rejected against the configured `AUTH_URL` origin. API clients without an Origin header may use the bearer link. Status reads do not call RPC or mutate settlement.

Preparation returns `attemptId`, `transactionHash`, `unsignedXdr`, `network`, `status`, `requiresRecheck`, `expiresAt` and an explicit server-generated `review` of payment terms, source and fee. A repeated preparation for the same source returns the existing active attempt, including after expiry. When `requiresRecheck` is true, recheck that attempt before requesting a new one. A different source gets `ACTIVE_ATTEMPT_EXISTS`; recover the active attempt ID from GET invoice status and recheck it. No endpoint accepts an arbitrary hash to credit.

## Preparation and integrity

The server loads the authoritative OPEN invoice, validates both G-addresses, rejects self-payment, and gets the source's current Testnet sequence through RPC `getAccount`. It builds one native XLM payment to the destination snapshot with the exact decimal amount and a text memo containing the invoice payment reference. The source sequence is incremented once. The fee is fixed at 100 stroops for one operation; surge pricing can cause rejection and is not silently escalated. Time bounds run from server time minus 30 seconds to server time plus five minutes.

Before returning, a database transaction rechecks the invoice and saves the unsigned envelope, Testnet transaction hash and attempt. A partial unique index allows at most one PREPARED, SUBMITTED or UNKNOWN attempt per invoice. Hashes are globally unique. Failed or conclusively expired attempts remain as history.

Parsing accepts only the standard v1 transaction envelope with time preconditions and no transaction extension. It rejects fee bumps, v0, muxed sources, nonpayment operations, operation-level sources, multiple operations, issued assets, different terms, fee changes and changed transaction bodies. Signed submission must contain signatures, but signature authorization is independently enforced by the Stellar network. Multisig authorization is not guessed locally.

An XDR envelope does **not** encode a network passphrase. Network binding comes from computing its hash/signature base under the fixed Testnet passphrase and matching the persisted expected hash, together with checking the trusted RPC's reported network. An envelope signed for another network cannot succeed on Testnet. Never describe an arbitrary XDR as proving its own network.

## Submission, verification and recovery

Before calling `sendTransaction`, the server persists the validated signed envelope, submission time and UNKNOWN state. A PENDING or DUPLICATE acknowledgement becomes SUBMITTED, never PAID. Rejection acknowledgements and transport timeouts remain UNKNOWN because the same transaction may already have reached the network. Resubmitting only the identical transaction body is safe; there is no automatic replacement or fee bump.

Verification queries `getTransaction` by the saved hash and validates the returned hash, envelope, source, operation, destination, amount, asset, memo, successful transaction result and successful payment operation result. Ledger number and close time must be valid and within the saved transaction's time bounds. No client assertion can settle an invoice.

After these checks, one immediate database transaction re-reads the authoritative invoice, inserts the unique verified payment, conditionally changes OPEN to PAID with the ledger close time, and marks the attempt VERIFIED. Any failure rolls back all three changes. Competing writes have a bounded retry only for SQLite lock contention. Repeated verification returns the existing receipt; late submission responses cannot downgrade terminal states.

NOT_FOUND is normally UNKNOWN. It becomes EXPIRED only when the trusted RPC's retained history covers the **entire** transaction validity interval and its latest closed ledger is beyond maxTime. A gap/truncated history or wall-clock expiry alone never releases the active attempt. A confirmed included `txFailed` result becomes FAILED and may be replaced. Rechecking is always explicit; no background poller was added. If history has already aged out, keep the attempt unresolved for operator reconciliation with trusted archival evidence—do not manually mark it paid or assume it failed. Never delete unresolved attempts to issue replacement payments.

`payment_attempts` stores expected/signed envelopes, hashes, source, state and recovery timestamps. `payments` contains only independently verified settlements and enforces unique invoice, attempt and transaction hash, with Testnet/XLM and amount checks. Migration `0002_payment_foundation.sql` only creates these tables/indexes; it does not rewrite users, accounts, sessions or invoices.

## Validation and limits

`npm test` runs the prior auth/invoice tests plus deterministic SDK transaction and payment-store tests. Test keys are deterministic unfunded fixtures, not user secrets. Most tests use in-memory SQLite; the simultaneous-settlement test uses a temporary file database for independent connections and removes it afterward. Coverage includes tampered terms, network mismatch, invalid envelopes, duplicate/replay constraints, safe projection, atomic rollback, idempotency, concurrent settlement, delayed acknowledgements and RPC uncertainty/expiry.

Live read-only RPC checks verify Testnet identity and unknown-transaction responses. Local mocks prove backend behavior but do not constitute a real signed Testnet payment. The maintainer has completed the funded-account end-to-end Milestone 5 acceptance flow. Before broad public deployment, add shared request-rate controls at the hosting/API boundary: bearer links necessarily allow holders to initiate an active attempt, and this milestone does not include distributed anti-abuse infrastructure.

## Milestone 5 integration

Freighter connection, Testnet checks, payment review/signing, submission, persisted recovery, bounded polling and verified receipts are implemented. The maintainer has accepted the real interactive Testnet flow. No private key should ever reach the application server.

References: [Stellar RPC getTransaction](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransaction), [getNetwork](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getNetwork), [sendTransaction](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/sendTransaction), [SDK migration guide](https://stellar.github.io/js-stellar-sdk/guides/00-migration/).
