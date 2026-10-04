import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { expect, it } from 'vitest';

for (const [mode, healthStatus, expectedCode] of [['disabled', 200, 0], ['enabled', 200, 1], ['disabled', 503, 1]] as const) {
 it(`CLI returns ${expectedCode} for mode=${mode} and Auth HTTP ${healthStatus}`, async () => {
  const server = createServer((request, response) => {
   const capabilities = request.url === '/api/capabilities';
   response.writeHead(capabilities ? 200 : healthStatus, { 'content-type': 'application/json' });
   response.end(JSON.stringify(capabilities ? { payments: { mode, enabled: mode === 'enabled', provider: 'stripe' } } : { name: 'GoTrue' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
   const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/public-smoke.ts'], {
     env: { ...process.env, PUBLIC_APP_URL: origin, PUBLIC_SUPABASE_URL: origin }, windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', data => { output += String(data); });
    child.once('error', reject); child.once('close', code => resolve({ code, output }));
   });
   expect(result.code).toBe(expectedCode);
   const report = JSON.parse(result.output);
   expect(report.passed).toBe(expectedCode === 0);
   expect(report.releaseReady).toBe(false);
   expect(report.databaseRlsVerified).toBe(false);
   expect(report.mediaRuntimeVerified).toBe(false);
   expect(report.authenticatedReadinessVerified).toBe(false);
   expect(result.output).not.toContain(origin);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
 }, 15_000);
}
