/**
 * 웹 세션 저장소: localStorage 기반, 토큰 길이·계정 ID 형식 검증.
 */
const refreshKey = 'wecover.refresh';
const accountKey = 'wecover.account';
const maxTokenLength = 16_384;
const maxAccountIdLength = 128;

// Module lifetime spans hook remounts. Queue whole transactions, including reads.
// Keep internal operations unqueued to avoid clear -> remove queue deadlocks.
let operations: Promise<void> = Promise.resolve();
function serialize<T>(operation: () => T | Promise<T>): Promise<T> {
  const result = operations.then(operation);
  operations = result.then(() => {}, () => {});
  return result;
}

function validAccountId(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length <= maxAccountIdLength && /^[a-zA-Z0-9_-]+$/.test(value);
}

export const readRefresh = (): Promise<string | null> => serialize(() => sessionStorage.getItem(refreshKey));
async function writeRefreshNow(value: string, accountId: string) {
  if (value.length > maxTokenLength) throw new Error('The session token exceeds the browser storage limit.');
  if (!validAccountId(accountId)) throw new Error('The account identifier is invalid.');
  const previousAccount = sessionStorage.getItem(accountKey);
  try {
    sessionStorage.setItem(accountKey, accountId);
    sessionStorage.setItem(refreshKey, value);
  } catch (error) {
    if (previousAccount === null) sessionStorage.removeItem(accountKey);
    else sessionStorage.setItem(accountKey, previousAccount);
    throw error;
  }
}
async function removeRefreshNow() { sessionStorage.removeItem(refreshKey); }

async function clearSessionNow(accountId?: string | null): Promise<void> {
  await removeRefreshNow();
  const storedAccount = sessionStorage.getItem(accountKey);
  const id = validAccountId(accountId) ? accountId : validAccountId(storedAccount) ? storedAccount : null;
  if (id) sessionStorage.removeItem(`wecover:mobile-draft:${id}`);
  sessionStorage.removeItem(accountKey);
}

export const writeRefresh = (value: string, accountId: string): Promise<void> => serialize(() => writeRefreshNow(value, accountId));
export const removeRefresh = (): Promise<void> => serialize(removeRefreshNow);
export const clearSession = (accountId?: string | null): Promise<void> => serialize(() => clearSessionNow(accountId));
