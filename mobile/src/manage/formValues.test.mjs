/**
 * 금액/날짜 파싱 테스트.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, parseDateInput, dateFieldSelection, localDateFieldValue, FormInputError } from './formValues.ts';

test('date-only picker preserves calendar day independently of UTC submission', () => {
  const prior = process.env.TZ;
  try {
    for (const zone of ['Asia/Seoul', 'America/New_York', 'UTC']) {
      process.env.TZ = zone;
      for (const value of ['2027-02-28', '2028-02-29', '2027-12-31']) {
        const date = dateFieldSelection(value);
        assert.equal(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`, value);
      }
      assert.equal(dateFieldSelection('2027-02-28 10:30', true).toISOString(), '2027-02-28T10:30:00.000Z');
      assert.equal(parseDateInput('2027-02-28'), '2027-02-28T23:59:59.000Z');
      assert.throws(() => dateFieldSelection('2027-02-30'), FormInputError);
    }
  } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
});

test('local datetime rejects DST normalization and retains valid UTC conversion', () => {
  const prior = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    assert.equal(localDateFieldValue('2027-03-14T02:30'), undefined);
    assert.equal(localDateFieldValue('2027-03-14T01:30'), '2027-03-14 06:30');
    assert.equal(localDateFieldValue('2027-03-14T03:30'), '2027-03-14 07:30');
    assert.equal(localDateFieldValue('2027-11-07T01:30'), '2027-11-07 05:30');
    process.env.TZ = 'Asia/Seoul';
    assert.equal(localDateFieldValue('2027-03-14T02:30'), '2027-03-13 17:30');
    for (const value of ['', '2027-02-30T12:00', '2027-03-14T24:00', '2027-03-14 02:30', '2027-03-14T02:30Z']) assert.equal(localDateFieldValue(value), undefined);
  } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
});
test('money accepts whole cents and rejects hidden rounding or nonnumeric input', () => {
  assert.equal(parseMoney('12.34'), 1234);
  for (const input of ['1.005', '-1', 'foo', 'Infinity']) assert.throws(() => parseMoney(input), FormInputError);
});
test('dates reject impossible days and require explicit minute format', () => {
  assert.equal(parseDateInput('2027-02-28'), '2027-02-28T23:59:59.000Z');
  assert.equal(parseDateInput('2027-02-28 10:30', true), '2027-02-28T10:30:00.000Z');
  for (const input of ['2027-02-30', '2027-2-2', '']) assert.throws(() => parseDateInput(input), FormInputError);
});
