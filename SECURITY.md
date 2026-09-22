# Security policy

## Supported code

Security fixes target the current main branch (0.1.x Testnet MVP). No older release has a separate maintenance promise. This experimental software is not independently audited. Testnet XLM has no monetary value; Mainnet is unsupported.

## Responsible reporting

Use **Security → Report a vulnerability** on the GitHub repository once its owner enables private reporting. Include affected version/code, impact and a sanitized reproduction. Do not publish exploitation details in issues or PRs before coordinated remediation.

If private reporting is unavailable, ask a maintainer through an existing private GitHub contact channel to establish a secure route. If no such channel exists, request private reporting be enabled without including vulnerability details. No personal email or response-time guarantee is invented here. The owner must enable reporting on publication; see [GitHub instructions](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).

Never share recovery phrases or private keys, even with maintainers. Exclude OAuth/database tokens, session cookies, signed envelopes, database dumps and live bearer links. Redact personal data. Coordinate disclosure after fixes are reviewed and affected operators notified.

## Sensitive boundaries

- Auth/session validation and owner-scoped merchant access.
- Public invoice bearer links and safe field projections.
- Server-authoritative transaction preparation and exact amounts.
- Signed XDR integrity, body/origin limits and persistence before submission.
- Independent RPC verification, replay prevention and unique hashes.
- Atomic settlement and preservation of uncertain state during outages.

## Operating safely

Keep secrets only in ignored local environment files or a deployment secret manager. Restrict database/backup/log access; OAuth/session records and signed envelopes are sensitive. Never use NEXT_PUBLIC variables for secrets or disable TLS validation. Rotate exposed credentials, invalidate affected sessions where appropriate and remove sensitive history before publication.

A timeout may follow a committed write. Recover saved state; never erase attempts, manually mark PAID or assume wallet success. Testnet resets and finite RPC history may require operator reconciliation.

Before broad deployment configure trusted proxies, rate limits, monitoring and restricted logs. Do not log request bodies, auth headers, query parameters or signed XDR. See [release notes](docs/release-readiness.md).
