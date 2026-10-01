import { createDemo } from './demo';
import type { BoardDocument } from './model';
import { readStored, writeArchives, writeConflicts, writeCurrent } from './storage';

// Weeks run Monday–Sunday in the user's local time. The first week may be a partial one (started mid-week).
export interface Archive {
  id: string;
  weekStart: string; // Monday, YYYY-MM-DD
  weekEnd: string; // Sunday, YYYY-MM-DD
  startedOn: string; // first day the board was used this week; later than weekStart for a partial week
  archivedAt: string;
  /** When the board's content last changed (ms). */
  updatedAt: number;
  /** Version id of the content; two copies with the same `rev` are identical. */
  rev: string;
  doc: BoardDocument;
}
/**
 * The live board. `rev` identifies this exact content; `baseRev` is the cloud version it was last in sync with.
 * `rev !== baseRev` means there are local edits the cloud hasn't seen. `updatedAt` is 0 for a pristine board.
 */
export interface CurrentWeek { weekStart: string; startedOn: string; updatedAt: number; rev: string; baseRev: string; doc: BoardDocument }
/** A board version set aside instead of overwriting someone's work (two devices edited the same week offline). */
export interface ConflictCopy { id: string; createdAt: number; weekStart: string; startedOn: string; kind: 'week' | 'archive'; doc: BoardDocument }
export interface WeekState { v: 1; current: CurrentWeek; archives: Archive[]; conflicts: ConflictCopy[] }

const LEGACY_KEY = 'analog-weekly-board:v1';
export const newRev = () => crypto.randomUUID();

const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
export const weekStartISO = (d: Date) => toISO(mondayOf(d));
export const weekEndISO = (weekStart: string) => { const d = fromISO(weekStart); return toISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6)); };

const fmt = (iso: string, withYear: boolean) => fromISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
export function weekLabel(weekStart: string, startedOn = weekStart) {
  const from = startedOn > weekStart ? startedOn : weekStart, end = weekEndISO(weekStart);
  return `${fmt(from, false)} – ${fmt(end, fromISO(end).getFullYear() !== new Date().getFullYear() || fromISO(from).getFullYear() !== fromISO(end).getFullYear())}`;
}
export const isPartial = (weekStart: string, startedOn: string) => startedOn > weekStart;

export function emptyBoard(weekStart: string): BoardDocument {
  return { board: { id: `week-${weekStart}`, title: weekLabel(weekStart), width: 1600, height: 1000 }, items: {}, pins: {}, connections: {} };
}
export const isEmpty = (doc: BoardDocument) => Object.keys(doc.items).length === 0 && Object.keys(doc.pins).length === 0;
const freshCurrent = (weekStart: string, startedOn: string, doc: BoardDocument): CurrentWeek => { const rev = newRev(); return { weekStart, startedOn, updatedAt: 0, rev, baseRev: rev, doc }; };

export const archiveOf = (current: CurrentWeek, now = new Date()): Archive => ({
  id: `archive-${current.weekStart}`, weekStart: current.weekStart, weekEnd: weekEndISO(current.weekStart),
  startedOn: current.startedOn, archivedAt: now.toISOString(), updatedAt: current.updatedAt, rev: current.rev, doc: current.doc,
});

/** Archive the current board if its week is over, and start a fresh board for the week containing `now`. */
export function rollover(state: WeekState, now = new Date()): WeekState {
  const thisWeek = weekStartISO(now);
  if (state.current.weekStart >= thisWeek) return state;
  const archives = isEmpty(state.current.doc) ? state.archives : [...state.archives.filter(a => a.weekStart !== state.current.weekStart), archiveOf(state.current, now)];
  return { ...state, archives, current: freshCurrent(thisWeek, toISO(now), emptyBoard(thisWeek)) };
}

export interface Reconciled { state: WeekState; pushCurrent: boolean }
/**
 * Combine this device's state with what the cloud holds, without ever silently discarding edits:
 * - archives are unioned (identical `rev` = same content);
 * - the live week fast-forwards when only one side changed;
 * - if both sides changed, the cloud version stays current and the local edits are kept as a conflict copy.
 */
export function reconcile(local: WeekState, remoteCurrent: CurrentWeek | undefined, remoteArchives: Archive[], remoteConflicts: ConflictCopy[], now = new Date()): Reconciled {
  const archives = new Map(local.archives.map(a => [a.id, a]));
  const conflicts = new Map(local.conflicts.map(c => [c.id, c]));
  remoteConflicts.forEach(c => { if (!conflicts.has(c.id)) conflicts.set(c.id, c); });
  const addConflict = (copy: Omit<ConflictCopy, 'id' | 'createdAt'> & { rev: string }) => {
    const id = `conflict-${copy.weekStart}-${copy.rev}`;
    if (!conflicts.has(id)) conflicts.set(id, { id, createdAt: now.getTime(), weekStart: copy.weekStart, startedOn: copy.startedOn, kind: copy.kind, doc: copy.doc });
  };
  const put = (a: Archive) => {
    const existing = archives.get(a.id);
    if (!existing) { archives.set(a.id, a); return; }
    if (existing.rev === a.rev) return;
    const [winner, loser] = (a.updatedAt ?? 0) > (existing.updatedAt ?? 0) ? [a, existing] : [existing, a];
    archives.set(a.id, winner);
    if (!isEmpty(loser.doc)) addConflict({ weekStart: loser.weekStart, startedOn: loser.startedOn, kind: 'archive', doc: loser.doc, rev: loser.rev });
  };
  remoteArchives.forEach(put);

  let current = local.current, pushCurrent = false;
  const dirty = local.current.rev !== local.current.baseRev;
  if (!remoteCurrent) pushCurrent = true;
  else if (remoteCurrent.weekStart > local.current.weekStart) { // another device already moved on to a later week
    if (!isEmpty(local.current.doc)) put(archiveOf(local.current, now));
    current = { ...remoteCurrent, baseRev: remoteCurrent.rev };
  } else if (remoteCurrent.weekStart < local.current.weekStart) { // the other device is behind; it will catch up from our push
    if (!isEmpty(remoteCurrent.doc)) put(archiveOf(remoteCurrent, now));
    pushCurrent = true;
  } else if (remoteCurrent.rev === local.current.rev) {
    current = { ...local.current, baseRev: remoteCurrent.rev };
  } else if (remoteCurrent.rev === local.current.baseRev) {
    pushCurrent = dirty; // cloud unchanged since we last synced
  } else if (!dirty) {
    current = { ...remoteCurrent, baseRev: remoteCurrent.rev, startedOn: remoteCurrent.startedOn < local.current.startedOn ? remoteCurrent.startedOn : local.current.startedOn };
  } else { // both changed since the last sync: keep the cloud version, set our edits aside
    addConflict({ weekStart: local.current.weekStart, startedOn: local.current.startedOn, kind: 'week', doc: local.current.doc, rev: local.current.rev });
    current = { ...remoteCurrent, baseRev: remoteCurrent.rev };
  }
  const state = rollover({ v: 1, current, archives: [...archives.values()], conflicts: [...conflicts.values()] }, now);
  return { state, pushCurrent: pushCurrent && state.current === current };
}

export async function loadWeekState(now = new Date()): Promise<WeekState> {
  try {
    const stored = await readStored();
    if (stored.current) {
      const c = stored.current as Partial<CurrentWeek> & Pick<CurrentWeek, 'weekStart' | 'startedOn' | 'doc'>;
      const rev = c.rev ?? newRev(); // data from before cloud sync: unsynced unless it was never edited
      const current: CurrentWeek = { ...c, updatedAt: c.updatedAt ?? 0, rev, baseRev: c.baseRev ?? ((c.updatedAt ?? 0) === 0 ? rev : '') };
      return rollover({ v: 1, current, archives: stored.archives.map(a => ({ ...a, rev: a.rev ?? `legacy-${a.updatedAt ?? 0}`, updatedAt: a.updatedAt ?? 0 })), conflicts: stored.conflicts }, now);
    }
    // One-time migration from the earliest localStorage persistence.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as { v: 1; current: { weekStart: string; startedOn: string; doc: BoardDocument }; archives: Omit<Archive, 'rev' | 'updatedAt'>[] };
      if (parsed?.v === 1 && parsed.current?.doc && Array.isArray(parsed.archives)) {
        const state = rollover({ v: 1, current: { ...parsed.current, updatedAt: Date.now(), rev: newRev(), baseRev: '' }, archives: parsed.archives.map(a => ({ ...a, updatedAt: 0, rev: `legacy-${a.weekStart}` })), conflicts: [] }, now);
        await saveWeekState(state); localStorage.removeItem(LEGACY_KEY); return state;
      }
    }
  } catch { /* fall through to a fresh start */ }
  const weekStart = weekStartISO(now);
  return { v: 1, archives: [], conflicts: [], current: freshCurrent(weekStart, toISO(now), createDemo()) };
}
export async function saveWeekState(state: WeekState) {
  try { await Promise.all([writeCurrent(state.current), writeArchives(state.archives), writeConflicts(state.conflicts)]); return true; } catch { return false; }
}
