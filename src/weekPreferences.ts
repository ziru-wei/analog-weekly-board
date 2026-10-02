import { useSyncExternalStore } from 'react';
import { readKv, writeKv } from './storage';

export type WeekPreference = { day: number; effectiveFrom?: string; updatedAt: number; rev: string };
let preference: WeekPreference = { day: 1, updatedAt: 0, rev: '' };
const listeners = new Set<() => void>();
export const getWeekPreference = () => preference;
export const useWeekPreference = () => useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, getWeekPreference);
export async function loadWeekPreference() {
  const saved = await readKv<WeekPreference>('week-start-preference');
  if (saved && Number.isInteger(saved.day) && saved.day >= 0 && saved.day <= 6) preference = { ...saved, updatedAt: saved.updatedAt ?? 0, rev: saved.rev ?? `legacy-${saved.day}-${saved.effectiveFrom ?? ''}` };
}
async function savePreference(value: WeekPreference) {
  const previous = preference;
  preference = value; listeners.forEach(l => l());
  try { await writeKv('week-start-preference', value); }
  catch (error) { if (preference === value) { preference = previous; listeners.forEach(l => l()); } throw error; }
}
/** Deterministic last-edit-wins merge for the shared calendar setting. */
export async function mergeWeekPreference(remote?: WeekPreference) {
  if (remote) {
    if (!Number.isInteger(remote.day) || remote.day < 0 || remote.day > 6 || !Number.isFinite(remote.updatedAt) || typeof remote.rev !== 'string' || (remote.effectiveFrom !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(remote.effectiveFrom))) throw new Error('Invalid cloud week preference.');
    if (remote.updatedAt > preference.updatedAt || (remote.updatedAt === preference.updatedAt && remote.rev > preference.rev)) await savePreference(remote);
  }
  return preference;
}
export async function setWeekStartDay(day: number, now = new Date()) {
  if (!Number.isInteger(day) || day < 0 || day > 6 || day === preference.day) return;
  // Apply at the next selected weekday, never archive an active board retroactively.
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((day - now.getDay() + 7) % 7 || 7));
  const effectiveFrom = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  await savePreference({ day, effectiveFrom, updatedAt: Math.max(now.getTime(), preference.updatedAt + 1), rev: crypto.randomUUID() });
}
