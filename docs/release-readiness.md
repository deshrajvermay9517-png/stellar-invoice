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

## Dependabot investigation — 2026-09-22

No safe compatible dependency fix was found. Package manifests and the lockfile remain unchanged; no forced audit fix, override, downgrade or prerelease upgrade was applied.

| Locked path from the direct devDependency | esbuild | Scope |
| --- | --- | --- |
| drizzle-kit@0.31.10 → @esbuild-kit/esm-loader@2.6.5 → @esbuild-kit/core-utils@3.3.2 | 0.18.20 | Transitive, development only |
| drizzle-kit@0.31.10 → esbuild | 0.25.12 | Transitive, development only |
| drizzle-kit@0.31.10 → tsx@4.23.15 → esbuild | 0.28.2 | Transitive, development only; already above 0.28.1 |

The loader requires `~0.18.20` (below 0.19.0); Kit requires `^0.25.4` (below 0.26.0). Neither range admits 0.28.1, explaining `security_update_not_possible` for that target. Adding a top-level esbuild dependency would not replace the incompatible nested instances.

The npm registry's latest stable Kit is **0.31.11**. Its published manifest retains `@esbuild-kit/esm-loader: ^2.5.5` and `esbuild: ^0.25.4`, so the patch does not resolve either constraint. The published **1.0.0-rc.4** removes the legacy loader but still requires `esbuild: ^0.25.10`; it does not solve a 0.28.1 target either and is not a low-risk maintenance upgrade. Reassess when a stable Kit release changes these dependency ranges. Do not force esbuild across its declared pre-1.0 minor compatibility ranges.

### Advisory distinction

The supplied Dependabot update failure named 0.28.1 as the earliest fixed version. At investigation time, the repository's current alert API returned only open alert #1 for [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), fixed in 0.25.0. npm audit likewise reports that advisory for 0.18.20, not 0.25.12. Its four moderate package findings are propagated through the loader chain, not four independent vulnerabilities.

Two published advisories use 0.28.1: the [Windows development-server advisory](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) currently lists >=0.27.3 and <0.28.1 (none of the locked instances); the [Deno integrity advisory](https://github.com/advisories/GHSA-gv7w-rqvm-qjhr) lists >=0.17.0 and <0.28.1 but is currently marked withdrawn by GitHub. The exact advisory behind the earlier update-job failure was not supplied, so it should not be inferred solely from its target version. The legacy 0.18.20 alert remains unresolved regardless.

### Impact and validation

All three lockfile entries have `dev: true`; `npm ls esbuild --omit=dev --all` is empty. Application source does not import esbuild or drizzle-kit. The direct dependency is used for migration generation/application, while production persistence uses drizzle-orm and libSQL. The app's Next.js dev server is not esbuild's serve API, and this project does not use the Deno wrapper. No affected runtime code path was identified. Development/CI environments still install this tooling: avoid exposing an esbuild development server and retain the alert until an upstream fix is available.

Audit result: four moderate development findings; production-only audit: zero. The audit now suggests drizzle-kit@0.18.1, an incompatible downgrade, which was rejected. No application/dependency change was made, so install, lint, typecheck, tests and build were not rerun for this documentation-only investigation. The last validated application suite remains 77 passing tests; that is not a new test run.

Evidence: local package.json/lockfile and npm tree, current npm registry manifests, repository Dependabot API, and the linked upstream advisories. Commit this documentation as a maintenance note; do not represent it as remediation or dismiss the remaining alert.

## Publication checklist

- Run clean install, lint, typecheck, tests and build without production credentials.
- Inspect tracked/staged files for secrets and sensitive artifacts, including screenshots/logs.
- Create the GitHub repository and enable private vulnerability reporting. Require the CI `checks` job after its first successful run and protect main as appropriate.
- Review MIT attribution; add sanitized screenshots and repository description/topics. No personal owner identity, repository URL or security email was invented.
- Commit reviewed files and configure the intended remote. Push only with explicit owner authorization.

GitHub CI cannot run until publication. Repository readiness is distinct from broad deployment readiness. Configure HTTPS/OAuth origin, managed secrets, backups, monitoring and hosting-level request limits before deployment. Remaining limitations include bearer-link attempt initiation, fixed fees, Testnet resets, finite RPC history and external-service outages. Never resolve uncertainty by deleting an attempt.
