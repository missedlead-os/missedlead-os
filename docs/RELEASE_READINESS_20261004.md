# Release readiness — 2026-10-04

WeCover is a Charlotte home repair platform. The primary product is the native Expo/React Native iOS and Android app; React/Vite is a secondary website. Express/TypeScript handles authenticated intake, matching, provider and operator workflows; Supabase supplies Auth, Postgres and private Storage. Gemini inference and Stripe activation have separate integration gates.

This is a local code preparation receipt. No production deployment, remote push, account creation, external message, charge, deletion, or database migration was performed.

## Source and isolation

- Existing checkout: `D:\missedlead-os`, clean at `2976026`; preserved without pull, stash, or edits.
- Working copy: `C:\Users\ert93\Documents\Codex\2026-10-04\task\missedlead-os`.
- Fetched and rebased the isolated copy to `405d490`, then created `codex/release-readiness-20261004`.
- Read README, mobile README, feature acceptance, collaborator rules, deployment/retention/staging handoffs, current CI and recent history. No AGENTS.md or `.agents/skills` was present in this checkout; the tracked skill is a Claude frontend design skill, outside these backend changes.
- GitHub open issue search returned no issues. Local memory was used only to locate the checkout and identify old verification gaps; current tests supersede old results.

## Changes

1. **Public privileged login blocked.** `/api/demo/login` previously accepted `role=operator` and skipped the two demo markers for operators. It now returns 403 before contacting Auth and never issues an operator token. Verified customer/provider demo accounts remain supported; both Auth metadata and DB profile must mark them as demo, and the profile role must match. Nine new regression cases cover rejection before Auth, valid isolated actors, missing markers and privileged profile substitution. Visual-only Admin role buttons do not grant real API authority.
2. **Deployment defaults tightened.** `render.yaml` selects Node 24, explicit `PAYMENTS_MODE=disabled`, and `DEMO_MODE=false`. Existing deployments are not changed until separately approved and deployed. Runtime preflight checks Node, ffmpeg and ffprobe before API startup. CI runs the same check after installing ffmpeg. A host missing media executables intentionally refuses startup instead of accepting unusable audio/video processing.
3. **Recovery checks strengthened.** Browser tests now execute the AI outage retry, verify the original message is sent once with the same JSON payload, and exercise browser Back/Forward after a role-route substitution. Multipart boundary strings vary between attempts and are excluded from the payload comparison.

## Verification

Commands were run in the isolated copy on Windows, Node 24.16.0 / pnpm 9.15.9, with no `.env.local` copied from the original.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed |
| `pnpm --dir mobile install --frozen-lockfile` | Passed, 83 seconds; tool initially timed out while process continued |
| `pnpm run test --maxWorkers=1` | 318 passed, 22 files; original baseline was 309 |
| `pnpm run test:mobile` | 41 passed |
| `pnpm --dir mobile typecheck` | Passed |
| `pnpm lint` | 0 errors, 31 existing warnings |
| `pnpm build` | TypeScript and Vite production build passed |
| `pnpm check:runtime` | Local Node/ffmpeg/ffprobe passed |
| `pnpm exec playwright test` | Final: 19 passed, 1 skipped, including actual retry and Back/Forward recovery |
| `pnpm --dir mobile exec expo export --platform all --output-dir dist-release-check --max-workers 1` | iOS, Android and web bundles exported; no signing or device installation |
| `pnpm run test:integration` | Failed before collection: missing `SUPABASE_TEST_URL`; no real DB contract pass claimed |
| Secret scan, repository + dist | 0 findings; negative synthetic fixture correctly returned failure |
| Manifest validators | Valid fixture passed, invalid fixture failed as expected |
| Deletion matrix fixture | Schema passed, but four unresolved policy decisions remain; not release approval |

Logs are in the parent `task` directory: `baseline-*.log`, `final-server-tests.log`, `final-browser.log`, `final-build.log`, `final-lint.log`, `mobile-export.log`. Browser artifacts are under ignored `artifacts/` and `test-results/`. Mocked browser/payment flows prove client behavior, not Supabase persistence, Gemini inference, real Stripe, or signed device execution.

## Remaining launch blockers, in priority order

1. **Isolated DB and real authorization evidence.** `http://127.0.0.1:56321/auth/v1/health` did not connect. No Docker Desktop process was found; approximately 1.6 GiB RAM was free. No Docker startup/reset, other-app termination, or system change was attempted. An existing authorized disposable staging Supabase/API plus synthetic actors is needed for `test:integration`, `test:pilot-integration` and SQL RLS/invariant suites. Do not use production credentials or run `db reset` on an existing data-bearing project.
2. **Deletion, backup/restore and monitoring decisions.** `COMMERCIALIZATION_OWNER_HANDOFF.md` still requires retention decisions, approved telemetry destinations/on-call groups and restoration evidence. These are not inferred or manufactured. No destructive deletion executor was enabled. Protect tenant data, private documents/media, Auth sessions and deletion tombstones before admitting customers.
3. **Deployment runtime and revision.** Confirm ffmpeg/ffprobe on the intended host with `pnpm check:runtime`; the Node Render host's availability is unverified. If absent, an owner-approved image/runtime change is needed. Existing handoff reports stalled Render auto-deploy; that historical claim was not treated as a current live check. Operator readiness must bind the exact new commit/migration/evidence hashes, rather than relying on the public capabilities endpoint alone.
4. **Native signed RC.** Bundle/type checks do not prove installation, permissions, background/offline/retry, token revocation or private media on actual iOS/Android hardware. Existing owner signing accounts/devices and identity decisions are required; no signing credentials or persistent access were created.
5. **Real model and capped pilot.** Confirm existing safe staging model identity/quota and real inference, provider eligibility/expiry/ZIP, zero-to-three matches, 24-hour expansion and original/translated message persistence. Pilot cap, admission implementation and owner go/no-go remain separate release gates. Live payments and real external notifications remain disabled and untested.

## Reproduce locally

In PowerShell, from the working copy:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd --dir mobile install --frozen-lockfile
pnpm.cmd check:runtime
pnpm.cmd run test --maxWorkers=1
pnpm.cmd run test:mobile
pnpm.cmd --dir mobile typecheck
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd exec playwright test
pnpm.cmd --dir mobile exec expo export --platform all --output-dir dist-release-check --max-workers 1
node scripts/verify-secret-scan.mjs --fixture scripts/fixtures/secret-scan-clean.json --roots . dist mobile/dist-release-check
```

Mock browser scenarios work without Docker. For the real app, configure only an approved existing isolated project's settings privately, keep `PAYMENTS_MODE=disabled` and `DEMO_MODE=false`, and use `.env.example` / `mobile/.env.example` as the variable-name references. Server service-role/model secrets must never enter mobile or Vite public variables. Run `pnpm.cmd dev` for API + mobile (8082), or `pnpm.cmd dev:stable` for API + the secondary web preview (5194); stop the owned terminals with Ctrl+C. Never duplicate an existing service's occupied port.

## Prepared deployment procedure — not executed

1. Review this branch's diff and approve the destination branch before push. If permitted, open a draft PR; do not push master because it may deploy.
2. Verify the selected host has Node 24 and ffmpeg/ffprobe, install locked dependencies including build tools, and run `pnpm build`. `render.yaml` runs `pnpm check:runtime && pnpm start:api`.
3. Owner injects existing approved secrets into the deployment secret manager and approves migrations for that exact isolated project. Never publish `.env` or reset project data. Keep demo and payment modes disabled and do not enable external send workers.
4. Validate a real deployment manifest with `node scripts/validate-deployment-manifest.mjs <private-manifest.json>`, bind it via `DEPLOYMENT_MANIFEST_JSON`, and verify authenticated allowlisted `/api/ops/readiness`. Example fixtures only test validation and cannot authorize release.
5. After separate deployment approval, check the deployed revision, HTTPS/auth redirect constraints, multi-user RLS/private-media denial, safe staging intake and telemetry redaction. Use `STAGING_PILOT_VERTICAL.md` and the owner handoff for go/no-go. Keep pilot ingress closed until all evidence and policy gates are satisfied.
