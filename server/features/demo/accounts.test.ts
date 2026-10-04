import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerDemoRoutes } from './routes.js';

const boundary = vi.hoisted(() => ({ signIn: vi.fn(), profile: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
 createClient: () => ({
  auth: { signInWithPassword: boundary.signIn },
  from: () => ({ select: () => ({ eq: () => ({ single: boundary.profile }) }) }),
 }),
}));

beforeEach(() => {
 vi.clearAllMocks();
 for (const [name, value] of Object.entries({
  DEMO_MODE: 'true', SUPABASE_URL: 'https://demo.example.invalid', SUPABASE_ANON_KEY: 'fixture',
  DEMO_CUSTOMER_EMAIL: 'customer@example.invalid', DEMO_CUSTOMER_PASSWORD: 'fixture-password',
  DEMO_PROVIDER_EMAIL: 'provider@example.invalid', DEMO_PROVIDER_PASSWORD: 'fixture-password',
  DEMO_OPERATOR_EMAIL: 'operator@example.invalid', DEMO_OPERATOR_PASSWORD: 'fixture-password',
 })) vi.stubEnv(name, value);
});
afterEach(() => vi.unstubAllEnvs());

function app() {
 const service = express();
 service.use(express.json());
 registerDemoRoutes(service);
 return service;
}
function account(role: string, metadataDemo = true, profileDemo = true) {
 boundary.signIn.mockResolvedValue({ data: {
  session: { access_token: 'fixture-access', refresh_token: 'fixture-refresh' },
  user: { id: 'fixture-user', email: `${role}@example.invalid`, app_metadata: { demo: metadataDemo } },
 }, error: null });
 boundary.profile.mockResolvedValue({ data: { role, is_demo: profileDemo }, error: null });
}

describe('demo sessions cannot grant production authority', () => {
 it('refuses operator credentials before contacting Supabase, even when configured', async () => {
  account('operator', false, false);
  const response = await request(app()).post('/api/demo/login').send({ role: 'operator' });
  expect(response.status).toBe(403);
  expect(response.body).toEqual({ error: 'demo_operator_access_disabled' });
  expect(boundary.signIn).not.toHaveBeenCalled();
  expect(boundary.profile).not.toHaveBeenCalled();
  expect(response.headers['cache-control']).toBe('no-store');
 });
 for (const role of ['customer', 'provider']) {
  it(`allows a verified isolated ${role} account`, async () => {
   account(role);
   const response = await request(app()).post('/api/demo/login').send({ role });
   expect(response.status).toBe(200);
   expect(response.body.actor.role).toBe(role);
   expect(boundary.signIn).toHaveBeenCalledWith({ email: `${role}@example.invalid`, password: 'fixture-password' });
  });
  for (const [metadataDemo, profileDemo] of [[false, true], [true, false]]) {
   it(`rejects ${role} without both independent demo markers (${metadataDemo}/${profileDemo})`, async () => {
    account(role, metadataDemo, profileDemo);
    const response = await request(app()).post('/api/demo/login').send({ role });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'demo_unavailable' });
    expect(response.body).not.toHaveProperty('access_token');
   });
  }
  it(`rejects a privileged profile behind ${role} demo credentials`, async () => {
   account('operator');
   const response = await request(app()).post('/api/demo/login').send({ role });
   expect(response.status).toBe(503);
   expect(response.body).not.toHaveProperty('access_token');
  });
 }
});
