# Keepalive, public smoke and release evidence

`.github/workflows/keepalive.yml` runs every six hours to warm Render and reduce Supabase inactivity. Both curls intentionally end with `|| true`. A job can be green when origins are missing, TLS/network times out, Auth returns 401, the service returns 5xx, or the DB project is unavailable. The existing schedule and curls are unchanged; comments now make its non-gating intent explicit.

## Independent public smoke

`pnpm check:public-smoke` exits 0 only when both configured public GET checks pass. It exits 1 for missing/unsafe origins, redirects, non-200 HTTP, network timeout, non-JSON content/invalid JSON, or a payment capability that is not explicitly `mode=disabled`, `enabled=false`, `provider=stripe`.

Only `GET /api/capabilities` and `GET /auth/v1/health` are called, with no credentials, request body, model call or data writes. Origins must be HTTPS, except HTTP loopback for local tests; userinfo/query/fragment/path origins are refused. Redirects are not followed and requests abort after 30 seconds. TLS verification is not disabled. Output contains check names, booleans, fixed reasons and failing HTTP status codes; it excludes origins, credentials, response bodies and raw network errors.

For existing owner-approved endpoints in a private PowerShell session:

```powershell
$env:PUBLIC_APP_URL='https://approved-existing-app.example.invalid'
$env:PUBLIC_SUPABASE_URL='https://approved-existing-project.example.invalid'
pnpm.cmd check:public-smoke
if ($LASTEXITCODE -ne 0) { throw 'public_smoke_failed' }
```

The `.invalid` placeholders are deliberately non-routable. Missing configuration fails rather than choosing an old demo URL. Do not add `|| true`, make this command create accounts, or substitute live demo/model smoke scripts. If the selected Auth gateway requires a key, an unauthenticated 401 fails this check: it is not a health pass or proof of a broken DB. The owner must arrange a separately approved authenticated check without exposing keys.

Public smoke success is limited to public HTTP availability and the disabled-payment contract. Every CLI report therefore explicitly includes `releaseReady=false`, `authenticatedReadinessVerified=false`, `databaseRlsVerified=false`, and `mediaRuntimeVerified=false`. Auth health JSON does not prove Postgres queries, tenant RLS, Storage, actual model inference, signed device behavior or release manifest identity. Use the protected operator readiness and isolated integration lanes for those gates.

## New local verification

`pnpm exec vitest run server/deployment --maxWorkers=1` covers 21 contract/negative cases and three CLI cases against an ephemeral loopback HTTP fixture. Real CLI exit codes are checked for healthy/disabled (0), activated payments (1), and Auth HTTP 503 (1). Timeout abort, redirects, 401/429/5xx, malformed content, origin credential/query rejection and non-disclosure are also verified. The fixture creates no users or DB records and is closed after the test.

The full local server suite after adding smoke coverage passed **348 tests / 24 files**. Production build and lint passed (31 existing warnings, 0 errors). No live full public smoke was claimed because an approved current Supabase public origin is not established in this workspace. Local runtime prerequisites passed previously; host media runtime remains unverified.

## Evidence that must remain separate

| Evidence | Observed result | What it establishes |
| --- | --- | --- |
| Remote push CI | [run 36151286631](https://github.com/missedlead-os/missedlead-os/actions/runs/36151286631), `405d4906582dc42203186acbd27b3f46b1a025fc`, success updated 2026-09-25 15:01:34 UTC; read-only rechecked 2026-10-04 | That remote revision passed its then-configured CI; not our unpushed work or live deployment |
| Keepalive green | Best-effort curl failures are swallowed | Workflow finished; not health evidence |
| GitHub deployment metadata | Latest recorded successful deployment `9dc3677`, 2026-09-20 | Historical recorded revision/status; no current server secret/configuration observation |
| Public homepage/capabilities | HTTP 200; older static marker; payments disabled | Public responses only; not DB/model/media runtime |
| Local code/test/runtime | 348 server tests; web build; Node/ffmpeg/ffprobe preflight | Prepared local revision and local host tools only |
| Protected release readiness | Not run; approved manifest/operator evidence absent | Still required for deployed manifest/payment binding |
| Isolated DB/RLS/Storage and native RC | Blocked as described in release decisions | Still required before launch |

Push, PR, remote workflow changes, deployment, paid Gemini calls, external sends/payments and data deletion remain on hold. No existing keepalive service behavior was interrupted.
