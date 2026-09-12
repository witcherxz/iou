import { STORAGE_RECOVERY_KEY } from '../config/app';
import { PersistedState } from '../types';
import { isLedgerDate, validateState } from '../validation';

export const LOCAL_HISTORY_KEY = 'iou.state.history.v2';
export const LOCAL_HISTORY_LIMIT = 10;
export const LOCAL_HISTORY_QUARANTINE_KEY = `${LOCAL_HISTORY_KEY}.damaged`;
export interface LocalSnapshot { id: string; createdAt: string; state: PersistedState }
interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
let sequence = 0;

/** A broken individual snapshot cannot hide other readable recovery points. */
export async function readLocalHistory(storage: Pick<Storage, 'getItem'>): Promise<LocalSnapshot[]> {
  const raw = await storage.getItem(LOCAL_HISTORY_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('تعذّرت قراءة سجل النسخ المحلية.');
  const seen = new Set<string>();
  const result: LocalSnapshot[] = [];
  for (const item of parsed) {
    try {
      if (!item || typeof item.id !== 'string' || seen.has(item.id) || !isLedgerDate(item.createdAt)) continue;
      const state = validateState(item.state);
      seen.add(item.id);
      result.push({ id: item.id, createdAt: item.createdAt, state });
    } catch { /* Other snapshots remain available. */ }
  }
  if (parsed.length && !result.length) throw new Error('تعذّرت قراءة النسخ المحلية المحفوظة.');
  return result.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

const fingerprint = (state: PersistedState) => JSON.stringify([state.people, state.tx, state.changes]);

/** Called inside the ordered write queue before replacing the current ledger. */
export async function keepLocalSnapshot(storage: Storage, beforeJSON: string, nextJSON: string, now = new Date().toISOString()): Promise<void> {
  const before = validateState(JSON.parse(beforeJSON)), next = validateState(JSON.parse(nextJSON));
  if (fingerprint(before) === fingerprint(next)) return;
  let snapshots: LocalSnapshot[];
  try { snapshots = await readLocalHistory(storage); }
  catch {
    // Preserve unreadable history before repairing it from a verified live
    // ledger. A damaged secondary copy must not permanently prevent saving.
    const damaged = await storage.getItem(LOCAL_HISTORY_KEY);
    if (damaged !== null) {
      const existing = await storage.getItem(LOCAL_HISTORY_QUARANTINE_KEY);
      const key = existing === null || existing === damaged ? LOCAL_HISTORY_QUARANTINE_KEY : `${LOCAL_HISTORY_QUARANTINE_KEY}.${Date.now()}-${++sequence}`;
      await storage.setItem(key, damaged);
      if (await storage.getItem(key) !== damaged) throw new Error('تعذّر حفظ سجل النسخ المحلية المتضرر.');
    }
    snapshots = [];
  }
  const snapshot: LocalSnapshot = { id: `${Date.now()}-${++sequence}`, createdAt: now, state: before };
  const retained = [snapshot, ...snapshots.filter(s => fingerprint(s.state) !== fingerprint(before))].slice(0, LOCAL_HISTORY_LIMIT);
  const encoded = JSON.stringify(retained);
  await storage.setItem(LOCAL_HISTORY_KEY, encoded);
  if (await storage.getItem(LOCAL_HISTORY_KEY) !== encoded) throw new Error('تعذّر التحقق من النسخة المحلية.');
}

export async function availableLocalHistory(storage: Pick<Storage, 'getItem'>): Promise<LocalSnapshot[]> {
  let snapshots: LocalSnapshot[] = [];
  let failure: unknown;
  try { snapshots = await readLocalHistory(storage); } catch (error) { failure = error; }
  try {
    const previous = await storage.getItem(STORAGE_RECOVERY_KEY);
    if (previous) {
      const state = validateState(JSON.parse(previous));
      if (!snapshots.some(s => fingerprint(s.state) === fingerprint(state))) {
        snapshots.unshift({ id: 'previous', createdAt: '', state });
      }
    }
  } catch (error) { failure ??= error; }
  // Read recovery sources independently: either one can survive the other.
  if (!snapshots.length && failure) throw failure;
  return snapshots;
}
