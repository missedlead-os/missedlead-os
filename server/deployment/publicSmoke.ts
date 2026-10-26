export type SmokeCheck = { check: 'app_capabilities' | 'supabase_auth_health'; passed: boolean; reason?: string; httpStatus?: number };

function origin(value: string): string {
 const url = new URL(value);
 const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
 if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
  throw new Error('invalid_smoke_origin');
 }
 return url.origin;
}

export async function publicSmoke(options: {
 appOrigin: string; supabaseOrigin: string; fetcher?: typeof fetch; timeoutMs?: number;
}): Promise<{ passed: boolean; checks: SmokeCheck[] }> {
 let appOrigin: string, supabaseOrigin: string;
 try { appOrigin = origin(options.appOrigin); supabaseOrigin = origin(options.supabaseOrigin); }
 catch { return { passed: false, checks: [{ check: 'app_capabilities', passed: false, reason: 'invalid_origin_configuration' }] }; }
 const fetcher = options.fetcher ?? fetch;
 const checks = await Promise.all(([
  ['app_capabilities', `${appOrigin}/api/capabilities`],
  ['supabase_auth_health', `${supabaseOrigin}/auth/v1/health`],
 ] as const).map(async ([check, url]): Promise<SmokeCheck> => {
  try {
   const response = await fetcher(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(options.timeoutMs ?? 30_000) });
   if (response.status !== 200) return { check, passed: false, reason: 'unexpected_http_status', httpStatus: response.status };
   if (response.headers.has('location')) return { check, passed: false, reason: 'unexpected_redirect' };
   if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) return { check, passed: false, reason: 'non_json_response' };
   const body: unknown = await response.json();
   if (check === 'app_capabilities') {
    const payments = (body as { payments?: { mode?: unknown; enabled?: unknown; provider?: unknown } } | null)?.payments;
    if (payments?.mode !== 'disabled' || payments.enabled !== false || payments.provider !== 'stripe') return { check, passed: false, reason: 'payments_not_verified_disabled' };
   } else if (!body || typeof body !== 'object' || Array.isArray(body)) return { check, passed: false, reason: 'invalid_auth_health_response' };
   return { check, passed: true };
  } catch { return { check, passed: false, reason: 'network_timeout_or_invalid_json' }; }
 }));
 return { passed: checks.every(check => check.passed), checks };
}
