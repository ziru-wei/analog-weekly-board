import 'fake-indexeddb/auto';
import { beforeEach, expect, test } from 'vitest';
import { getWeekPreference, loadWeekPreference, setWeekStartDay, mergeWeekPreference } from '../src/weekPreferences';
import { writeKv } from '../src/storage';
import { emptyBoard, rollover, weekStartISO, type WeekState } from '../src/weeks';

beforeEach(async () => { await writeKv('week-start-preference', { day: 1 }); await loadWeekPreference(); });
const now = new Date(2026, 9, 1, 12);
const initial = (): WeekState => {
  const doc = emptyBoard('2026-09-28');
  doc.pins.p = { id: 'p', itemId: null, x: 20, y: 20, xRatio: 0, yRatio: 0, color: 'blue' };
  return { v: 1, current: { doc, weekStart: '2026-09-28', startedOn: '2026-09-28', updatedAt: 1, rev: 'a', baseRev: 'a' }, archives: [], conflicts: [] };
};
test('Sunday preference persists and switches at the next Sunday without losing the current board', async () => {
  const state = initial();
  await setWeekStartDay(0, now);
  await loadWeekPreference();
  expect(getWeekPreference()).toMatchObject({ day: 0, effectiveFrom: '2026-10-04' });
  expect(rollover(state, now)).toBe(state);
  const next = rollover(state, new Date(2026, 9, 4));
  expect(next.current.weekStart).toBe('2026-10-04');
  expect(next.archives[0].doc).toBe(state.current.doc);
  expect(next.archives[0].weekEnd).toBe('2026-10-03');
  expect(rollover(next, new Date(2026, 9, 5))).toBe(next);
});
test('selecting today takes effect next week, including across year boundaries', async () => {
  await setWeekStartDay(4, new Date(2026, 11, 31, 12));
  expect(getWeekPreference().effectiveFrom).toBe('2027-01-07');
  expect(weekStartISO(new Date(2027, 0, 8))).toBe('2027-01-07');
});
test('invalid weekdays do not alter the preference', async () => {
  await setWeekStartDay(9, now);
  expect(getWeekPreference().day).toBe(1);
});

test('newer cloud settings persist and older offline settings cannot override them', async () => {
  await setWeekStartDay(0, now);
  const local = getWeekPreference();
  const remote = { day: 5, effectiveFrom: '2026-10-09', updatedAt: local.updatedAt + 1, rev: 'remote' };
  await mergeWeekPreference(remote);
  await loadWeekPreference();
  expect(getWeekPreference()).toEqual(remote);
  expect(await mergeWeekPreference(local)).toEqual(remote);
});
test('equal timestamps converge by revision id', async () => {
  await mergeWeekPreference({ day: 0, updatedAt: 1, rev: 'b' });
  await mergeWeekPreference({ day: 6, updatedAt: 1, rev: 'a' });
  expect(getWeekPreference().day).toBe(0);
});
