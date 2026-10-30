import { describe, it, expect } from 'vitest';
import { createApp, InMemoryRepository, emptyState } from './app.js';
import { localFetch } from './testing/local-http.js';
function setup(status = 'matched', visitStatus: 'proposed' | 'confirmed' = 'proposed') {
  const state = emptyState();
  state.requests.r = { id: 'r', customerId: 'owner', customerName: 'Owner', description: 'Sink leak', address: 'Charlotte', status, safetyStatus: 'cleared', providerIds: ['pro'], expandedSearch: true, createdAt: '2026-10-30T12:00:00Z' };
  state.schedules.r = { requestId: 'r', startsAt: '2026-11-01T14:00:00Z', timeZone: 'America/New_York', status: visitStatus };
  state.providerEligibility.pro = { status:'approved', organizationName:'Pro', serviceAreas:['Charlotte'], serviceCategories:['general'], licenseVerified:true, insuranceVerified:true, licenseExpiresAt:'2030-01-01', insuranceExpiresAt:'2030-01-01' };
  const repository = new InMemoryRepository(state);
  const app = createApp({ repository, auth: { async authenticate(token) { return { id: token, role: token === 'pro' ? 'provider' : 'customer' }; } }, paymentsMode:'disabled', now: () => new Date('2026-10-30T12:00:00Z') });
  return async (method: string, path: string, body?: unknown, token = 'owner') => {
    const response = await localFetch(app, `http://local${path}`, { method, headers:{ Authorization:`Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type':'application/json' }) }, body:body === undefined ? undefined : JSON.stringify(body) });
    return { status:response.status, data:await response.json() };
  };
}
describe('customer request cancellation (no sockets)', () => {
  it.each(['proposed','confirmed'] as const)('cancels owner request and %s visit; repeats return the same state', async visit => {
    const call = setup('matched', visit);
    const first = await call('POST','/api/requests/r/cancel',{ reason:'Filed by mistake' });
    expect(first).toEqual({ status:200, data:{ requestId:'r',status:'cancelled' } });
    expect(await call('POST','/api/requests/r/cancel')).toEqual(first);
    const dashboard = await call('GET','/api/dashboard');
    expect(dashboard.data.requests[0]).toMatchObject({ status:'cancelled', expandedSearch:false });
    expect(dashboard.data.schedules[0].status).toBe('cancelled');
    expect((await call('GET','/api/dashboard',undefined,'pro')).data.requests).toEqual([]);
    expect((await call('PUT','/api/requests/r/schedule',{ startsAt:'2026-11-02T14:00:00Z', timeZone:'America/New_York',status:'proposed' })).status).toBe(409);
  });
  it.each(['other','pro'])('rejects non-owner %s', async token => {
    const call = setup();
    expect((await call('POST','/api/requests/r/cancel',{},token)).status).toBe(403);
    expect((await call('GET','/api/dashboard')).data.requests[0].status).toBe('matched');
  });
  it.each(['completed','settled'])('rejects %s requests', async status => {
    expect((await setup(status)('POST','/api/requests/r/cancel',{})).status).toBe(409);
  });
  it('validates reason and rejects missing requests', async () => {
    const call = setup();
    expect((await call('POST','/api/requests/r/cancel',{reason:'x'.repeat(501)})).status).toBe(400);
    expect((await call('POST','/api/requests/missing/cancel',{})).status).toBe(403);
    expect((await call('POST','/api/requests/r/cancel',{reason:12})).status).toBe(400);
  });
});
