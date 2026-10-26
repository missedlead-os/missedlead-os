import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { localVisitInput, parseVisitDate } from './visitDate.ts';

const now = new Date('2026-01-01T00:00:00Z').getTime();

test('native submit callback rechecks expired, invalid and busy selections', () => {
  const source = readFileSync(new URL('./VisitPicker.tsx', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('VisitPicker.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'onPress' && node.initializer && ts.isJsxExpression(node.initializer)) {
      const expression = node.initializer.expression;
      if (expression?.getText(tree).includes('onPropose')) callback = expression.getText(tree);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(callback, 'production submit callback found');
  const compile = ts.transpileModule(`const submit = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const instantiate = new Function('date', 'busy', 'onPropose', 'Date', `${compile}\nreturn submit;`);
  const selected = new Date('2027-01-20T12:30:00Z');
  const instant = selected.getTime();
  for (const [date, busy, clock, expectedCalls] of [
    [selected, false, instant - 1, 1],
    [selected, false, instant, 0],
    [selected, false, instant + 1, 0],
    [selected, true, instant - 1, 0],
    [new Date(NaN), false, instant - 1, 0],
  ]) {
    const calls = [];
    instantiate(date, busy, value => calls.push(value), { now: () => clock })();
    assert.equal(calls.length, expectedCalls, `busy=${busy}, now=${clock}, date=${date}`);
    if (expectedCalls) assert.equal(calls[0], selected);
  }
});
test('visit dates preserve valid local minutes and reject rolled-over calendar input', () => {
  for (const value of ['2028-02-29T12:30', '2027-03-14T01:30', '2027-03-14T03:30']) {
    assert.equal(localVisitInput(parseVisitDate(value, now)), value);
  }
  for (const value of ['', '2027-02-29T12:30', '2027-04-31T12:30', '2027-03-14T24:00', '2027-03-14T03:60', '2027-3-14T03:30', '2027-03-14 03:30', '2027-03-14T03:30Z']) {
    assert.equal(parseVisitDate(value, now), undefined, value);
  }
});
test('visit submission rejects a time that has become past or exactly current', () => {
  const value = '2027-01-20T12:30';
  const instant = new Date(value).getTime();
  assert.ok(parseVisitDate(value, instant - 1));
  assert.equal(parseVisitDate(value, instant), undefined);
  assert.equal(parseVisitDate(value, instant + 1), undefined);
});
test('DST gap never silently changes the requested visit time', () => {
  const value = '2027-03-14T02:30';
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parsed = parseVisitDate(value, now);
  if (['America/New_York', 'America/Chicago'].includes(zone)) assert.equal(parsed, undefined);
  else if (['UTC', 'Asia/Seoul'].includes(zone)) assert.equal(localVisitInput(parsed), value);
  else assert.ok(parsed === undefined || localVisitInput(parsed) === value);
  const repeated = '2027-11-07T01:30';
  assert.equal(localVisitInput(parseVisitDate(repeated, now)), repeated);
});
