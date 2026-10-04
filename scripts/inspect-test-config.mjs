import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';

const names = ['SUPABASE_TEST_URL', 'SUPABASE_TEST_ANON_KEY', 'SUPABASE_TEST_SERVICE_ROLE_KEY', 'SUPABASE_TEST_CUSTOMER_TOKEN', 'SUPABASE_TEST_PROVIDER_TOKEN', 'SUPABASE_TEST_OPERATOR_TOKEN', 'INTEGRATION_API_URL', 'INTEGRATION_STRIPE_FIXTURE_URL', 'INTEGRATION_STRIPE_FIXTURE_SECRET'];
const directory = path.resolve(process.argv[2] ?? '.');
const classify = value => {
 if (!value) return 'absent';
 try {
  const url = new URL(value);
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return 'loopback';
  return url.protocol === 'https:' ? 'remote_https_unverified' : 'other_unverified';
 } catch { return 'invalid'; }
};
const sources = [];
for (const file of ['.env.local', '.env', 'mobile/.env.local', 'mobile/.env']) {
 const location = path.join(directory, file);
 if (!existsSync(location)) { sources.push({ file, exists: false }); continue; }
 const env = parse(readFileSync(location));
 sources.push({ file, exists: true,
  requiredVariablesPresent: Object.fromEntries(names.map(name => [name, Boolean(env[name])])),
  endpointKinds: Object.fromEntries(['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_TEST_URL', 'INTEGRATION_API_URL', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_API_URL'].map(name => [name, classify(env[name])])),
  serverAndWebProjectMatch: env.SUPABASE_URL && env.VITE_SUPABASE_URL ? env.SUPABASE_URL === env.VITE_SUPABASE_URL : null,
 });
}
sources.push({ source: 'inherited_process', requiredVariablesPresent: Object.fromEntries(names.map(name => [name, Boolean(process.env[name])])) });
console.log(JSON.stringify({ sources, valuesDisclosed: false, credentialsCopied: false }, null, 2));
