import { writeKv } from './storage';

// Keep the legacy cloud settings file compatible while retiring configurable calendars.
export type WeekPreference = { day: number; effectiveFrom?: string; updatedAt: number; rev: string };
const preference: WeekPreference = { day: 1, updatedAt: 0, rev: 'fixed-monday-v1' };
export const getWeekPreference = () => preference;
export async function loadWeekPreference() {
  await writeKv('week-start-preference', preference);
}
export async function mergeWeekPreference(_remote?: WeekPreference) {
  await loadWeekPreference();
  return preference;
}
