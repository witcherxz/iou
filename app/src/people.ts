import { PersistedState, Person } from './types';

/** Match the add-person form without combining distinct ledger identities. */
export function personNameError(people: Person[], personId: string, raw: string): string | null {
  const person = people.find(item => item.id === personId);
  if (!person) return 'هذا الشخص غير موجود في الدفتر.';
  const name = raw.trim();
  if (!name) return 'أدخل اسم الشخص.';
  if (name.length > 100) return 'استخدم اسماً من 100 حرف أو أقل.';
  // Older imports may contain people with identical names. Keeping the current
  // name must remain a no-op; their records are still separate by person ID.
  if (name === person.name.trim()) return null;
  if (people.some(item => item.id !== personId && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return 'يوجد شخص آخر بهذا الاسم. استخدم اسماً يميّزه.';
  }
  return null;
}

/** Only the person's display name changes; all financial records keep their IDs. */
export function renamePerson(state: PersistedState, personId: string, raw: string): PersistedState | null {
  if (personNameError(state.people, personId, raw)) return null;
  const name = raw.trim();
  const person = state.people.find(item => item.id === personId)!;
  if (name === person.name) return state;
  return { ...state, people: state.people.map(item => item.id === personId ? { ...item, name } : item) };
}
