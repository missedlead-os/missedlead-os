/**
 * 폼 입력 파싱: 금액(센트 변환)·날짜 검증, FormInputError 코드.
 */
export class FormInputError extends Error {
  constructor(readonly code: 'money' | 'date' | 'file_size') { super(code); this.name = 'FormInputError'; }
}
export function parseMoney(input: string): number {
  const value = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new FormInputError('money');
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents >= 4_000_000) throw new FormInputError('money');
  return cents;
}
export function parseDateInput(input: string, withTime = false): string {
  const value = input.trim();
  if (!(withTime ? /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/).test(value)) throw new FormInputError('date');
  const iso = `${value.replace(' ', 'T')}${withTime ? ':00Z' : 'T23:59:59Z'}`;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, withTime ? 16 : 10) !== value.replace(' ', 'T')) throw new FormInputError('date');
  return date.toISOString();
}

export function dateFieldSelection(value: string, withTime = false): Date {
  const iso = parseDateInput(value, withTime);
  // Date-only values are calendar days, not the UTC end-of-day submission instant.
  return new Date(withTime ? iso : `${value.trim()}T12:00:00`);
}

export function localDateFieldValue(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  const local = `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (local !== value) return undefined;
  return date.toISOString().slice(0, 16).replace('T', ' ');
}
