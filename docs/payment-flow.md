# Payment flow

```mermaid
sequenceDiagram
  actor Customer
  participant UI as Public invoice
  participant F as Freighter
  participant API as Next.js server
  participant DB as Turso / Drizzle
  participant RPC as Stellar Testnet
  Customer->>UI: Open bearer link
  UI->>API: Recover persisted status
  API->>DB: Safe read
  Customer->>F: Explicit connection permission
  F-->>UI: Public account and network
  Customer->>UI: Review and pay
  UI->>API: Prepare(token, payer)
  API->>DB: Authoritative invoice terms
  API->>RPC: Testnet identity and source sequence
  API->>DB: Persist unsigned XDR and unique attempt
  API-->>UI: Unsigned XDR and review
  UI->>F: Sign original XDR on Testnet
  F-->>UI: Signed XDR and signer
  UI->>API: Re-read state; submit signature
  API->>DB: Save signed XDR and UNKNOWN
  API->>RPC: Submit validated transaction
  RPC-->>API: Acknowledgement, not settlement
  UI->>API: Bounded verification rechecks
  API->>RPC: Get saved hash transaction
  RPC-->>API: Ledger envelope and result
  API->>DB: Atomic payment, PAID and VERIFIED
  API-->>UI: Verified receipt
```

## Authority and replay protection

Preparation accepts only the token and payer. Amount, destination snapshot, XLM, Testnet and memo come from the invoice. The server constructs one bounded payment with the current source sequence and saves it before returning unsigned XDR. Freighter signs with the prepared source and Testnet passphrase; account/network are checked around signing.

Submission checks the saved hash/signature base and all payment terms. XDR does not encode a network passphrase; hashes/signatures bind it to Testnet. Stellar authorizes signatures. Wallet success and submission acknowledgement cannot settle an invoice.

Verification checks RPC network, saved hash, full envelope, successful transaction/payment operation, ledger and close time. Atomic settlement and unique invoice/attempt/hash constraints prevent duplicate credit. Only one active attempt exists. Concurrent submissions can only send the same transaction body, not credit another payment.

## Recovery and outages

| State | Behavior |
| --- | --- |
| PREPARED | Continue with original payer or verify expiry |
| SUBMITTED / UNKNOWN | Recheck saved hash; no replacement |
| VERIFIED | Receipt only; payment controls disappear |
| FAILED | Ledger-confirmed failure permits explicit retry |
| EXPIRED | Proven unpaid expiry permits explicit retry |

Refresh/restart reloads database state. Cancellation does not submit. A synchronous lock prevents duplicate clicks; late wallet results after unmount are discarded. Signed XDR is not kept in browser storage.

Polling makes at most six requests with delays of 0, 1.5, 2.5, 4, 6 and 8 seconds. Browser HTTP calls have a 20-second limit; database transport requests eight seconds each; RPC ten seconds. Designated read-only lookups retry once after 250 ms. Multi-query operations may exceed one transport deadline; the browser stops waiting and preserves uncertainty. No network-error retry wraps a write or RPC submission.

502/timeouts/NOT_FOUND do not prove failure. Only retained RPC history covering the entire validity interval and a closed ledger beyond its end can prove unpaid expiry. If history aged out or Testnet reset, preserve state for operator reconciliation. Never delete an unresolved attempt or manually mark PAID.

During a database outage, wait, reopen the same link and **Recheck payment status**. A timed-out write may have committed; recover rather than replay it. Persistent failures remain visible instead of being hidden by endless retries.

## Receipt and explorer

`/pay/[token]/receipt` selects safe verified chain fields, excluding customer/internal data. Unpaid requests redirect to the invoice; unknown tokens return not found. Merchant receipt reads require auth and ownership. Explorer URLs use the verified persisted hash, validated as 64 lowercase hexadecimal characters, under `https://stellar.expert/explorer/testnet/tx/`. Client hashes cannot choose a settlement.

See [API/integrity details](payment-backend.md) and [Freighter acceptance](freighter-payments.md).
