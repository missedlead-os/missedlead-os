import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ApiError, errorMessage } from './errorMessage.ts';

const codes = ['schedule_outside_hours', 'schedule_in_past', 'schedule_too_far', 'schedule_time_zone_invalid', 'schedule_confirmation_forbidden', 'service_zip_unavailable', 'totally_new_server_code'];

test('schedule validation errors get readable English and Spanish text, never the raw code', () => {
  const statuses = { schedule_outside_hours: 422, schedule_in_past: 422, schedule_too_far: 422, schedule_time_zone_invalid: 422, schedule_confirmation_forbidden: 403, service_zip_unavailable: 422, totally_new_server_code: 422 };
  for (const code of codes) {
    for (const locale of ['en', 'es']) {
      const message = errorMessage(new ApiError(statuses[code], code), locale);
      assert.ok(message.length > 10, `${code}/${locale} has copy`);
      assert.ok(!message.includes('_'), `${code}/${locale} does not leak the code: ${message}`);
    }
  }
  assert.match(errorMessage(new ApiError(422, 'schedule_outside_hours'), 'en'), /between 7 AM and 8 PM/);
  assert.match(errorMessage(new ApiError(422, 'schedule_outside_hours'), 'es'), /entre las 7 AM y las 8 PM/);
  assert.match(errorMessage(new ApiError(422, 'schedule_in_past'), 'en'), /already passed/);
  assert.match(errorMessage(new ApiError(422, 'schedule_in_past'), 'es'), /ya pasó/);
  assert.match(errorMessage(new ApiError(403, 'schedule_confirmation_forbidden'), 'en'), /professional confirms/);
  assert.match(errorMessage(new ApiError(422, 'service_zip_unavailable'), 'es'), /código postal/);
});

test('plain errors never surface their message to the customer', () => {
  assert.doesNotMatch(errorMessage(new Error('service_zip_unavailable'), 'en'), /_/);
  assert.doesNotMatch(errorMessage(new Error('boom_internal'), 'es'), /_/);
});

test('customers cannot confirm a proposed visit from the request screen; providers still can', () => {
  const customer = readFileSync(new URL('../requests/RequestActions.tsx', import.meta.url), 'utf8');
  assert.ok(!/status:\s*'confirmed'/.test(customer), 'customer screen must only propose');
  assert.match(customer, /Waiting for your pro to confirm/);
  const provider = readFileSync(new URL('../manage/ProviderCommunication.tsx', import.meta.url), 'utf8');
  assert.match(provider, /status:\s*'confirmed'/);
});

test('account screen routes failures through errorMessage', () => {
  const source = readFileSync(new URL('./AccountScreen.tsx', import.meta.url), 'utf8');
  assert.ok(!/error instanceof Error \? error\.message/.test(source));
});
