import { describe, expect, it, vi } from 'vitest';
import { publicSmoke } from './publicSmoke.js';

const configuration = { appOrigin: 'https://app.example.invalid', supabaseOrigin: 'https://auth.example.invalid' };
const capabilities = { payments: { mode: 'disabled', enabled: false, provider: 'stripe' } };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const healthy = () => vi.fn<typeof fetch>().mockImplementation(async url => json(String(url).includes('/api/capabilities') ? capabilities : { name: 'GoTrue' }));

describe('public smoke fails independently of keepalive', () => {
 it('checks only public GET endpoints, with no redirects or credentials', async () => {
  const fetcher = healthy();
  expect((await publicSmoke({ ...configuration, fetcher })).passed).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const [, init] of fetcher.mock.calls) {
   expect(init?.method).toBe('GET'); expect(init?.redirect).toBe('manual');
   expect(init?.headers).toBeUndefined(); expect(init?.body).toBeUndefined(); expect(init?.signal).toBeInstanceOf(AbortSignal);
  }
 });
 for (const appOrigin of ['', 'http://remote.example.invalid', 'https://user:private@app.example.invalid', 'https://app.example.invalid/path', 'https://app.example.invalid/?token=private']) {
  it(`rejects unsafe origin configuration without requests (${appOrigin.split(':')[0]})`, async () => {
   const fetcher = healthy();
   expect((await publicSmoke({ ...configuration, appOrigin, fetcher })).passed).toBe(false);
   expect(fetcher).not.toHaveBeenCalled();
  });
 }
 it('allows HTTP only for loopback development origins', async () => {
  expect((await publicSmoke({ appOrigin: 'http://127.0.0.1:5191', supabaseOrigin: 'http://localhost:56321', fetcher: healthy() })).passed).toBe(true);
 });
 for (const mode of ['enabled', 'drain', undefined]) {
  it(`rejects payment mode ${String(mode)}`, async () => {
   const fetcher = healthy();
   fetcher.mockImplementation(async url => json(String(url).includes('/api/capabilities') ? { payments: { ...capabilities.payments, mode } } : {}));
   expect((await publicSmoke({ ...configuration, fetcher })).passed).toBe(false);
  });
 }
 it('rejects contradictory payment capability', async () => {
  const fetcher = healthy().mockResolvedValue(json({ payments: { ...capabilities.payments, enabled: true } }));
  expect((await publicSmoke({ ...configuration, fetcher })).passed).toBe(false);
 });
 for (const status of [302, 401, 429, 500, 503]) {
  it(`reports failure when Auth health returns ${status}`, async () => {
   const fetcher = healthy();
   fetcher.mockImplementation(async url => String(url).includes('/api/capabilities') ? json(capabilities) : new Response('', { status }));
   const result = await publicSmoke({ ...configuration, fetcher });
   expect(result.passed).toBe(false); expect(result.checks[0].passed).toBe(true); expect(result.checks[1].passed).toBe(false);
   expect(result.checks[1].httpStatus).toBe(status);
  });
 }
 for (const response of [new Response('<html>proxy error</html>'), new Response('{broken', { headers: { 'content-type': 'application/json' } }), new Response('{}', { headers: { 'content-type': 'application/json', location: 'https://elsewhere.example.invalid' } })]) {
  it('rejects invalid content or redirect headers even with HTTP 200', async () => {
   const fetcher = healthy().mockImplementation(async () => response.clone());
   expect((await publicSmoke({ ...configuration, fetcher })).passed).toBe(false);
  });
 }
 it('reports a timeout without leaking the underlying error', async () => {
  const fetcher = healthy().mockRejectedValue(new Error('private network details'));
  const result = await publicSmoke({ ...configuration, fetcher });
  expect(result.passed).toBe(false); expect(JSON.stringify(result)).not.toContain('private network details');
 });
 it('aborts pending requests at the configured deadline', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
   init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }));
  const result = await publicSmoke({ ...configuration, fetcher, timeoutMs: 10 });
  expect(result.passed).toBe(false); expect(fetcher).toHaveBeenCalledTimes(2);
 });
});
