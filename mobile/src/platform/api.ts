/**
 * API 호출 헬퍼. ApiError/errorMessage는 errorMessage.ts에서 다시 내보낸다.
 */
import { fetch } from 'expo/fetch';
import type { z } from 'zod';
import { apiUrl } from '../config';
import { ApiError } from './errorMessage';

export { ApiError, errorMessage } from './errorMessage';

async function send<T>(method: 'GET' | 'POST' | 'PUT', path: string, token: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${apiUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body), signal: controller.signal });
    const data: unknown = await response.json();
    if (!response.ok) {
      const code = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : 'request_failed';
      throw new ApiError(response.status, code);
    }
    return schema.parse(data);
  } finally { clearTimeout(timer); }
}
export function get<T>(path: string, token: string, schema: z.ZodType<T>) { return send('GET', path, token, schema); }
export function post<T>(path: string, token: string, schema: z.ZodType<T>, body: unknown) { return send('POST', path, token, schema, body); }
export function put<T>(path: string, token: string, schema: z.ZodType<T>, body: unknown) { return send('PUT', path, token, schema, body); }
