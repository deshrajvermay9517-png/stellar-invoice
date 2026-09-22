# Release readiness and maintenance

## Milestone 6

This release prepares the working Testnet MVP for GitHub: bounded database transport, one retry for designated idempotent reads, safe outage/recovery states, focused regressions, CI, documentation, MIT licensing and contributor templates. No new product feature, migration or real payment was required.

The maintainer accepted the Milestone 5 flow: a 5 XLM Testnet Freighter payment, independent backend verification, PAID state and receipt. This is a reported acceptance result, not an independent audit.

## Security review

Private stores authenticate and scope invoice/receipt reads to the owner. Public views use explicit projections. Preparation rejects client terms; validation binds the complete transaction to Testnet. Submission persists recovery state before sending; RPC evidence controls settlement. Atomic updates and uniqueness constraints prevent duplicate credit. Explorer links use the verified saved hash and a fixed Testnet origin.

Transport deadlines do not prove a write failed. Outages remain uncertain in the controller; page/receipt failures reach safe error boundaries. One retry after 250 ms applies only to designated read operations for recognized 502/503/504 and transport/timeout failures. No network retry wraps writes, submission or settlement. Persistent failure stays visible; this cannot guarantee Turso availability.

## Configuration and dependencies

Direct packages serve existing app/auth/database/wallet or development needs. No package was added for hardening. Node 24.15.0, exact dependency versions and lockfile remain. TypeScript is strict. Next.js suppresses its powered-by header and restricts public-page indexing/referrers/caching. Environment files, builds, local databases, signing files and logs are ignored by Git.

On 2026-09-21 npm audit reported four **moderate development-only** findings in `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild`. These propagate [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), concerning cross-origin access to the esbuild development server. This project does not run that server. Audit reports no available fix for this installed chain. Do not force incompatible upgrades/downgrades or transitive overrides without validating migration tooling.

No production dependency advisory was reported in this audit. Recheck `npm audit` and `npm audit --omit=dev` before release: results change. Auth.js remains explicitly pinned to its v5 beta integration. ESLint 9/tooling deprecation notices remain; upgrade as a reviewed compatibility change, not with forced peer overrides.

## Publication checklist

- Run clean install, lint, typecheck, tests and build without production credentials.
- Inspect tracked/staged files for secrets and sensitive artifacts, including screenshots/logs.
- Create the GitHub repository and enable private vulnerability reporting. Require the CI `checks` job after its first successful run and protect main as appropriate.
- Review MIT attribution; add sanitized screenshots and repository description/topics. No personal owner identity, repository URL or security email was invented.
- Commit reviewed files and configure the intended remote. Push only with explicit owner authorization.

GitHub CI cannot run until publication. Repository readiness is distinct from broad deployment readiness. Configure HTTPS/OAuth origin, managed secrets, backups, monitoring and hosting-level request limits before deployment. Remaining limitations include bearer-link attempt initiation, fixed fees, Testnet resets, finite RPC history and external-service outages. Never resolve uncertainty by deleting an attempt.
