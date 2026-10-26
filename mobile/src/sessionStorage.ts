/**
 * 네이티브 세션 저장소(보안 스토리지): refresh 토큰·계정 ID 보관/삭제.
 */
import * as SecureStore from 'expo-secure-store';
import { clearAccountDraft } from './chat/draft';

const refreshKey = 'wecover.refresh';
const accountKey = 'wecover.account';
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

export const readRefresh = () => serialize(() => SecureStore.getItemAsync(refreshKey));
async function writeRefreshNow(value: string, accountId: string): Promise<void> {
  if (!validAccountId(accountId)) throw new Error('The account identifier is invalid.');
  const previousAccount = await SecureStore.getItemAsync(accountKey);
  await SecureStore.setItemAsync(accountKey, accountId);
  try {
    await SecureStore.setItemAsync(refreshKey, value);
  } catch (error) {
    if (previousAccount === null) await SecureStore.deleteItemAsync(accountKey);
    else await SecureStore.setItemAsync(accountKey, previousAccount);
    throw error;
  }
}
const removeRefreshNow = () => SecureStore.deleteItemAsync(refreshKey);

async function clearSessionNow(accountId?: string | null, clearDraft: typeof clearAccountDraft = clearAccountDraft): Promise<void> {
  await removeRefreshNow();
  const storedAccount = await SecureStore.getItemAsync(accountKey);
  const id = validAccountId(accountId) ? accountId : validAccountId(storedAccount) ? storedAccount : null;
  if (id) clearDraft(id);
  await SecureStore.deleteItemAsync(accountKey);
}

export const writeRefresh = (value: string, accountId: string): Promise<void> => serialize(() => writeRefreshNow(value, accountId));
export const removeRefresh = (): Promise<void> => serialize(removeRefreshNow);
export const clearSession = (accountId?: string | null, clearDraft: typeof clearAccountDraft = clearAccountDraft): Promise<void> => serialize(() => clearSessionNow(accountId, clearDraft));
