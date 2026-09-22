# Contributing

Start with the [README](README.md), [architecture](docs/architecture.md) and [payment flow](docs/payment-flow.md).

## Setup and workflow

1. Fork the repository, use the Node version in `.nvmrc`, and run `npm ci`.
2. For interactive work, copy `.env.example` locally and follow OAuth/Turso/Testnet setup. Tests/build need no credentials.
3. Check existing issues. Report sanitized reproductions; discuss scope before large changes. Vulnerabilities follow [SECURITY.md](SECURITY.md).
4. Branch from main with a descriptive name such as `fix/payment-recovery`, `docs/setup` or `test/receipt-privacy`.
5. Submit a focused PR explaining the problem, resulting behavior, risks and checks.

## Required checks

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Use strict TypeScript, existing ESLint rules and established styling. Keep database/auth code server-only. Test changed behavior meaningfully with isolated SQLite and mocked RPC/wallet messages; ordinary tests must not call external services. Review migrations for data preservation; never edit applied SQL. Commit generated migration metadata and the lockfile when appropriate.

Payment changes require tests for authority, Testnet binding, verification and uncertainty as applicable. Use Testnet for interactive work and state whether browser acceptance was performed. Never use real signing keys in fixtures. Documentation changes do not require another signed payment.

## PR expectations and scope

Check keyboard focus, labels, mobile wrapping and loading/error states for UI changes. Include sanitized screenshots where useful. Avoid unrelated formatting and unnecessary dependencies. Mainnet, new assets/wallets, smart contracts, AI and major product features need separate agreement.

Never commit environment files, tokens, cookies, customer records, private keys, recovery phrases, signed XDR, database dumps or live bearer links. Inspect staged changes before committing; apply the same care to screenshots, issues and CI logs. Request security review for auth, ownership, public projection, transaction validation, replay or settlement changes. Do not weaken invariants to pass CI.

Contributions are under the [MIT License](LICENSE).
