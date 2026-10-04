# Release decisions and follow-up evidence — 2026-10-04

## Existing test configuration, inspected without values

`node scripts/inspect-test-config.mjs D:/missedlead-os` reads only the specified checkout's local configuration and prints existence flags and endpoint categories. It does not load these values into the environment, copy them, issue tokens, or contact a service. The sanitized result is `../test-config-inventory.json`.

The original `.env.local` contains non-empty test URL, anon key, service-role key and API URL settings. Its Supabase/server/web URLs are loopback and server/web project URLs match. Their correctness, key validity and disposable-project ownership are not yet verified. The three actor JWTs and two Stripe fixture settings are absent. The mobile local file exists with non-HTTPS device/host development origins; this is not a configured production endpoint. No required test variable is inherited by the current process. Tests read `process.env` and do not automatically load that original file.

### Minimum seven variables for the payment-disabled local pilot

| Variable | Purpose | Existing original setting |
| --- | --- | --- |
| `SUPABASE_TEST_URL` | Approved disposable local Auth/Postgres/Storage endpoint | Present; loopback, service unreachable |
| `SUPABASE_TEST_ANON_KEY` | Public project key for user-scoped/RLS calls | Present; validity unverified |
| `SUPABASE_TEST_SERVICE_ROLE_KEY` | Server-only fixture setup/inspection; bypasses RLS | Present; never expose to clients |
| `SUPABASE_TEST_CUSTOMER_TOKEN` | Existing synthetic customer session; actor ownership | Missing |
| `SUPABASE_TEST_PROVIDER_TOKEN` | Existing synthetic provider session; assignment/private media | Missing |
| `SUPABASE_TEST_OPERATOR_TOKEN` | Existing synthetic operator session; allowlist denial/approval | Missing |
| `INTEGRATION_API_URL` | Corresponding local authenticated API | Present; running instance not established |

`pnpm run test:pilot-integration` enforces loopback origins. It uses a synthetic AI provider and disabled payments, with no real Gemini call. It writes fixtures and performs cleanup; before execution, the owner must confirm the existing project is disposable and approve only test fixture writes/cleanup. No new Supabase project or key is needed or created by this work.

`pnpm run test:integration` additionally requires `INTEGRATION_STRIPE_FIXTURE_URL` (safe local payment fixture boundary) and `INTEGRATION_STRIPE_FIXTURE_SECRET` (fixture-only request authentication). Both are missing. This suite is a money-protocol contract; it is not the minimum payment-disabled release lane and must never be pointed at live Stripe.

## Reviewed security and privacy boundaries

- Anonymous callers can request demo customer/provider roles; that capability is intentionally disabled in the prepared deployment. Operator-role requests are refused before Auth regardless of configured operator credentials. Both independent demo markers, matching DB role, and explicit non-operator authority are mandatory before any token is returned. RPC failure/null/allowlist elevation is denied. A deployment secret/configuration compromise or future allowlist change is outside the login check; normal API authorization still checks the allowlist on requests.
- Server Auth verifies the Supabase user, reads the user's role through a bearer-scoped profile request, and checks `is_operator`. Client role buttons/URL changes do not replace these checks. User feature clients carry their bearer token; service-role helpers remain server-side. These code checks do not prove deployed RLS correctness without the DB lane.
- Intake source media is sanitized before private storage, with actor-bound confirmation, idempotent checksum retries and compensating cleanup. Provider work evidence has a separate assigned-provider lifecycle; retired upload/sanitization endpoints are not alternative access paths. Existing negative/private-media tests pass, but actual Storage denial remains a real integration gate.
- Mobile workspaces are keyed by authenticated user ID and are removed when the session disappears. Token revocation/sign-out clears account-specific drafts; another account's drafts are preserved. The privacy UI records a deletion request, not a claim of completed erasure. Retention and restore policy still has four unresolved decisions.
- No real demo login, operator session issuance, user-data access, Gemini call, external message, charge, destructive data operation, or credential creation was used in this review.

## Lint and package/deployment review

The 31 warnings were reviewed, rather than mechanically silenced. They concern React Compiler optimization (effect state resets, React Native Animated refs, render-time date validation), two hook dependency advisories, Fast Refresh exports, two long-file notices and an unused persona variable. No failing hook-rule violation or demonstrated launch-blocking behavior was found. Account data reload depends on the access token and the parent workspace remounts by user identity; NativeChat's preferred-locale effect uses the stable React state setter. Broad dependency insertion/refactoring could introduce rerender loops or discard drafts, so no speculative lint cleanup was made. Existing account cleanup/EN-ES/lifecycle/permission tests and browser route/retry checks remain the functional evidence. Device behavior is still a release gate.

Node 24 matches local execution and CI, `pnpm@9.15.9` matches packageManager/lockfiles, root and mobile frozen installs succeeded. Render build keeps required dev tools (`tsx`, TypeScript, Vite), runtime preflight requires ffmpeg/ffprobe, and both payment toggles deny activation. Mobile keys are public URLs/anon values only; service-role/model/payment secrets must stay server-side. The Node host's ffmpeg availability and the proposed CI additions have not been remotely executed.

## Read-only public deployment observations

On 2026-10-04, GitHub deployments API returned latest record `6554865292` at commit `9dc3677c0066b99970f0fe9c5894f11422237e24`, created 2026-09-20 16:14:06 UTC with successful status at 16:15:24 UTC. Its checked-in Blueprint declared `DEMO_MODE=true` and Node 22. These are historical deployment/configuration records, not a read of current Render secrets or overrides.

Public `GET /` returned HTTP 200 and bundle `index-BASmqvp6.js`; the public static bundle contains visual demo controls and lacks the later `demo-request-` marker. Public `GET /api/capabilities` first timed out at 30 seconds, then returned HTTP 200 with `payments.mode=disabled` and `enabled=false`. This is consistent with an older frontend, but does not prove exact server revision or whether current demo login/accounts are enabled.

No `/api/demo/login` request, exploit attempt or authenticated data request was made. Actual vulnerable-path activation is **unverified**: it depends on live `DEMO_MODE`, configured operator credentials and that account's authority. The owner should inspect only configuration presence/state privately; do not send values or tokens. New hardening remains local and is not deployed.

## Mandatory owner decisions

1. Confirm the existing disposable local project and three synthetic identities. Approve only their login/session provision and this project's test fixture creation/cleanup; no new project/key, production access, or database reset.
2. Resolve the four retention classes: audit/logs, financial/legal records, backups, deletion tombstones/progress. Specify purpose, expiry, legal hold, post-deletion access and restore handling; identify the policy approver. Approve telemetry destination/access/retention, on-call groups and incident stop/recovery actions.
3. Confirm native app identity/signing ownership and existing Apple/Google/EAS accounts/device access. Authorize an internal signed RC only, with no store submission or public distribution.
4. Decide the capped pilot ZIP/provider/customer limits and responsible support/incident/privacy owners. Actual ingress opening requires a separate signed go/no-go after all technical evidence.

## Mandatory technical blockers

- Existing local Supabase unavailable; actor sessions and safe fixture boundary absent. DB/RLS/private Storage, matching and recovery persistence remain unverified.
- Retention-dependent erasure/restore executor, monitoring receipts and capped admission work cannot be completed using invented owner decisions or credentials.
- Real staging model identity/quota/inference remains unverified; calls are intentionally held because cost authorization is absent.
- Host media executables, deployed revision/manifest binding and authenticated readiness must be confirmed after separately authorized deployment.
- Signed iOS/Android installation and real device permission/offline/background/re-auth flows lack evidence.

## Optional improvements

React Compiler/Fast Refresh lint cleanup, formatting long components, persona unused-variable cleanup, paid-host uptime and additional visual polish can follow independently. They do not substitute for DB, privacy, monitoring, model or signed-device gates.

## Approval checklist to return to the owner

- Which existing disposable local Supabase project and three synthetic accounts may be used, and are only their login plus test fixture writes/cleanup approved without reset or new keys?
- Who approves the four retention/restore decisions and telemetry/on-call/stop policies, and what are their periods and owners?
- Which existing signing accounts/devices and app identifiers are approved for an internal RC; which host/runtime may supply ffmpeg/ffprobe?
- May `codex/release-readiness-20261004` be pushed and opened as a **draft PR targeting master**, while deployment, live Gemini calls, messages/payments, and pilot ingress stay on hold?
- After privately confirming current demo configuration presence/state, is disabling public demo login (`DEMO_MODE=false`) and deploying the reviewed revision approved separately? No live operator token needs to be requested to answer this.

## Code preparation status

Follow-up complete server suite: **324 passed / 22 files**; focused demo boundary **19 passed**, including 15 new account-authority cases. Production TypeScript/Vite build passed; lint remains **0 errors / 31 warnings**. Repository and root/mobile export secret scan has **0 findings**. Prior mobile 41 tests, typecheck, all-platform exports, and Chromium 19 pass / 1 real-DB skip remain applicable because mobile/UI implementations were not changed in this follow-up. CI additions are prepared and locally executed commands passed; no remote CI result is claimed. Push, draft PR, deployment and paid calls remain held.

These are concrete decisions for remaining boundaries, not repeated approvals for local code/tests.
