import { validateState } from '../validation';
import { PersistedState } from '../types';
import { STORAGE_KEY, STORAGE_RECOVERY_KEY } from '../config/app';
import { readLocalHistory } from './history';
import { emptyState } from '../initialState';

/** Runs writes in order, and lets a later retry proceed after a rejected write. */
export function createWriteQueue() {
  let tail: Promise<void> = Promise.resolve();
  return (write: () => Promise<void>): Promise<void> => {
    const result = tail.then(write);
    tail = result.catch(() => {});
    return result;
  };
}
interface StorageReader { getItem: (key: string) => Promise<string | null> }

/** Initialize only after storage has been read successfully, preserving existing ledgers. */
export async function readInitialLedger(storage: StorageReader): Promise<{ state: PersistedState; recovered: boolean; isNew: boolean }> {
  const result = await readStoredLedger(storage);
  return { state: result.state ?? emptyState(), recovered: result.recovered, isNew: result.state === null };
}

/** A failed read or invalid payload never starts a write. */
export async function readStoredLedger(storage: StorageReader): Promise<{ state: PersistedState | null; recovered: boolean }> {
  let failure: unknown;
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (raw !== null) return { state: validateState(JSON.parse(raw)), recovered: false };
  } catch (error) { failure = error; }
  try {
    const previous = await storage.getItem(STORAGE_RECOVERY_KEY);
    if (previous !== null) return { state: validateState(JSON.parse(previous)), recovered: true };
  } catch (error) { failure ??= error; }
  try {
    const snapshots = await readLocalHistory(storage);
    if (snapshots.length) return { state: snapshots[0].state, recovered: true };
  } catch (error) { failure ??= error; }
  // An empty install requires successful empty reads from every source. An
  // unavailable key cannot masquerade as an empty ledger and trigger a write.
  if (failure) throw failure;
  return { state: null, recovered: false };
}
