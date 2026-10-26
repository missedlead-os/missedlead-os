import { publicSmoke } from '../server/deployment/publicSmoke.js';

const result = await publicSmoke({ appOrigin: process.env.PUBLIC_APP_URL ?? '', supabaseOrigin: process.env.PUBLIC_SUPABASE_URL ?? '' });
console.log(JSON.stringify({ ...result, scope: 'public_http_only', releaseReady: false, authenticatedReadinessVerified: false, databaseRlsVerified: false, mediaRuntimeVerified: false }));
if (!result.passed) process.exitCode = 1;
