import { createDemo } from './demo';
import type { BoardDocument } from './model';
import { type LegacyCurrent, type StoredBoard, readStored, writeBoards, writeConflicts, writeMeta } from './storage';
import { equivalentBoards } from './cloud/equivalence';
import { loadWeekPreference } from './weekPreferences';
import { carryPinnedItems } from './carryForward';

// Weeks always begin on Monday in local time.
/**
 * One corkboard. A week has one or more boards; any of them can be opened for editing.
 * `rev` identifies this exact content; `baseRev` is the cloud version it was last in sync with ('' = never synced).
 * `rev !== baseRev` means there are local edits the cloud hasn't seen. `updatedAt` is 0 for a pristine board.
 */
export interface Board {
  id: string;
  weekStart: string; // YYYY-MM-DD
  startedOn: string; // first day the board was used; later than weekStart for a partial week
  /** Inclusive last day, stored only by boards archived before multiple boards existed. */
  weekEnd?: string;
  createdAt: number;
  updatedAt: number;
  rev: string;
  baseRev: string;
  doc: BoardDocument;
}
/** A deleted board. Kept (locally and as the board's cloud file) so another device cannot bring the board back. */
export interface Tombstone { id: string; deleted: true; deletedAt: number }
/** A board version set aside instead of overwriting someone's work (two devices edited the same board offline). */
export interface ConflictCopy { id: string; sourceBoardId?: string; createdAt: number; weekStart: string; startedOn: string; doc: BoardDocument }
/**
 * `week` is the week this device last rolled over to; `activeId` is the board open on this device (never synced).
 * `deleted` maps deleted board ids to their deletion time.
 */
export interface WeekState { v: 2; week: string; activeId: string; boards: Board[]; deleted: Record<string, number>; conflicts: ConflictCopy[]; resolvedConflicts?: string[] }

const LEGACY_KEY = 'analog-weekly-board:v1';
export const newRev = () => crypto.randomUUID();

const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (iso: string, days: number) => { const d = fromISO(iso); return toISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)); };
export const weekStartISO = (d: Date) => toISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() - 1 + 7) % 7)));
export const weekEndISO = (weekStart: string) => addDays(weekStart, 6);
/** Every week is exactly Monday through Sunday. */
export function weekEndOf(weekStart: string, _weekStarts: Iterable<string>) {
  return weekEndISO(weekStartISO(fromISO(weekStart)));
}
/** The month a week is listed under: the one holding most of the days it shows. */
export function weekMonth(from: string, end: string) {
  const days = Math.round((fromISO(end).getTime() - fromISO(from).getTime()) / 86_400_000);
  return addDays(from, Math.floor(days / 2)).slice(0, 7);
}

const fmt = (iso: string, withYear: boolean) => fromISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
export function weekLabel(weekStart: string, _startedOn = weekStart, end = weekEndISO(weekStart)) {
  const from = weekStartISO(fromISO(weekStart));
  end = weekEndISO(from);
  return `${fmt(from, false)} – ${fmt(end, fromISO(end).getFullYear() !== new Date().getFullYear() || fromISO(from).getFullYear() !== fromISO(end).getFullYear())}`;
}

export function emptyBoard(weekStart: string): BoardDocument {
  return { board: { id: `week-${weekStart}`, title: weekLabel(weekStart), width: 1600, height: 1000 }, items: {}, pins: {}, connections: {} };
}
export const isEmpty = (doc: BoardDocument) => Object.keys(doc.items).length === 0 && Object.keys(doc.pins).length === 0;
/** The board every week starts with. Its id is shared by all devices, so their automatic boards merge into one. */
export const weeklyBoardId = (weekStart: string) => `week-${weekStart}`;
export function newBoard(weekStart: string, now = new Date(), doc = emptyBoard(weekStart), id = `board-${crypto.randomUUID()}`): Board {
  weekStart = weekStartISO(fromISO(weekStart));
  const rev = newRev();
  return { id, weekStart, startedOn: weekStart, createdAt: now.getTime(), updatedAt: 0, rev, baseRev: rev, doc };
}

export const activeBoard = (state: WeekState) => state.boards.find(b => b.id === state.activeId)!;
const byCreation = (a: Board, b: Board) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);
/** Keep `activeId` pointing at a real board: prefer the newest board of the current week, then the newest week. */
function ensureActive(state: WeekState, now: Date): WeekState {
  if (state.boards.some(b => b.id === state.activeId)) return state;
  const thisWeek = state.boards.filter(b => b.weekStart === state.week).sort(byCreation);
  const fallback = thisWeek.at(-1) ?? [...state.boards].sort((a, b) => a.weekStart.localeCompare(b.weekStart) || byCreation(a, b)).at(-1);
  if (fallback) return { ...state, activeId: fallback.id };
  const fresh = newBoard(state.week, now, emptyBoard(state.week), state.deleted[weeklyBoardId(state.week)] ? undefined : weeklyBoardId(state.week));
  return { ...state, boards: [fresh], activeId: fresh.id };
}

/** Whether the tab was last closed with the Dashboard open (kv key). */
export const DASHBOARD_OPEN_KEY = 'dashboard-open';
/** The most recently edited board of the current week (the newest one if none was edited). */
export function latestEditedBoard(state: WeekState) {
  return state.boards.filter(b => b.weekStart === state.week).sort((a, b) => a.updatedAt - b.updatedAt || byCreation(a, b)).at(-1);
}
/** Add a blank board to the current week and open it. */
export function addBoard(state: WeekState, now = new Date()): WeekState {
  const board = newBoard(state.week, now);
  return { ...state, boards: [...state.boards, board], activeId: board.id };
}
export const openBoard = (state: WeekState, id: string): WeekState => state.boards.some(b => b.id === id) ? { ...state, activeId: id } : state;
export function deleteBoard(state: WeekState, id: string, now = new Date()): WeekState {
  if (!state.boards.some(b => b.id === id)) return state;
  return ensureActive({ ...state, boards: state.boards.filter(b => b.id !== id), deleted: { ...state.deleted, [id]: now.getTime() } }, now);
}
/** Bring a conflict copy back as a board of its week (it does not replace anything). */
export function restoreConflict(state: WeekState, id: string, now = new Date()): WeekState {
  const copy = state.conflicts.find(c => c.id === id); if (!copy) return state;
  const board = { ...newBoard(copy.weekStart, now, copy.doc), startedOn: copy.startedOn, updatedAt: now.getTime(), baseRev: '' };
  return { ...state, boards: [...state.boards, board], conflicts: state.conflicts.filter(c => c.id !== id) };
}

/** Match older conflict copies only when their original board can be identified unambiguously. */
export function conflictBoard(state: WeekState, copy: ConflictCopy) {
  if (copy.sourceBoardId) return state.boards.find(board => board.id === copy.sourceBoardId);
  const candidates = state.boards.filter(board => board.weekStart === copy.weekStart);
  if (candidates.length === 1) return candidates[0];
  const ids = new Set(Object.keys(copy.doc.items));
  const ranked = candidates.map(board => ({ board, shared: Object.keys(board.doc.items).filter(id => ids.has(id)).length })).sort((a, b) => b.shared - a.shared);
  return ranked[0]?.shared > 0 && ranked[0].shared > (ranked[1]?.shared ?? 0) ? ranked[0].board : undefined;
}

/** Keep one version of the original board; remember the decision so sync cannot restore its conflict copy. */
export function resolveBoardConflict(state: WeekState, id: string, choice: 'restore' | 'discard', now = new Date()): WeekState {
  const copy = state.conflicts.find(c => c.id === id); if (!copy) return state;
  const original = conflictBoard(state, copy);
  let next = state;
  if (choice === 'restore') {
    if (original) next = { ...state, boards: state.boards.map(board => board.id === original.id
      ? { ...board, doc: structuredClone(copy.doc), rev: newRev(), updatedAt: now.getTime() } : board) };
    else next = restoreConflict(state, id, now);
  }
  return { ...next, conflicts: next.conflicts.filter(c => c.id !== id), resolvedConflicts: [...new Set([...(state.resolvedConflicts ?? []), id])] };
}

/** When a new week begins, start its board and open it. Boards from earlier weeks stay as they are. */
export function rollover(state: WeekState, now = new Date()): WeekState {
  // Force every board into a full Monday–Sunday week.
  const week = weekStartISO(fromISO(state.week));
  const normalized = state.boards.map(board => {
    const start = weekStartISO(fromISO(board.weekStart));
    if (start === board.weekStart && board.startedOn === start && !board.weekEnd) return board;
    const { weekEnd: _legacyEnd, ...rest } = board;
    return { ...rest, weekStart: start, startedOn: start };
  });
  const conflicts = state.conflicts.map(copy => {
    const start = weekStartISO(fromISO(copy.weekStart));
    return start === copy.weekStart && copy.startedOn === start ? copy : { ...copy, weekStart: start, startedOn: start };
  });
  if (week !== state.week || normalized.some((b, i) => b !== state.boards[i]) || conflicts.some((c, i) => c !== state.conflicts[i])) {
    state = { ...state, week, boards: normalized, conflicts };
  }
  const thisWeek = weekStartISO(now);
  if (state.week >= thisWeek) return state;
  let boards = state.boards.filter(b => b.weekStart === thisWeek);
  if (!boards.length) boards = [newBoard(thisWeek, now, emptyBoard(thisWeek), state.deleted[weeklyBoardId(thisWeek)] ? undefined : weeklyBoardId(thisWeek))];
  const first = [...boards].sort(byCreation)[0];
  const doc = carryPinnedItems(state.boards.filter(b => b.weekStart === state.week).sort(byCreation), first.doc, thisWeek);
  if (doc !== first.doc) boards = boards.map(b => b === first ? { ...b, doc, rev: newRev(), updatedAt: now.getTime() } : b);
  const byId = new Map(state.boards.map(b => [b.id, b]));
  boards.forEach(b => byId.set(b.id, b));
  return { ...state, week: thisWeek, boards: [...byId.values()], activeId: [...boards].sort(byCreation).at(-1)!.id };
}

/** A successful upload advances the base even when editing continued during the request. */
export function acknowledgeUpload(state: WeekState, uploaded: Board): WeekState {
  const board = state.boards.find(b => b.id === uploaded.id);
  if (!board || (board.baseRev !== uploaded.baseRev && board.rev !== uploaded.rev)) return state;
  return { ...state, boards: state.boards.map(b => b === board ? { ...b, baseRev: uploaded.rev } : b) };
}

export interface Remote { boards: Board[]; deleted: Tombstone[]; conflicts: ConflictCopy[]; resolvedConflicts?: string[] }
/**
 * Combine this device's state with what the cloud holds, preserving meaningful divergent edits:
 * - a board fast-forwards when only one side changed it;
 * - if both sides changed it, the cloud version wins and the local edits are kept as a conflict copy;
 * - a deletion on either side wins, unless this device edited the board after it was deleted elsewhere.
 */
export function reconcile(local: WeekState, remote: Remote, now = new Date()): WeekState {
  const resolvedConflicts = [...new Set([...(local.resolvedConflicts ?? []), ...(remote.resolvedConflicts ?? [])])];
  const resolved = new Set(resolvedConflicts);
  const conflicts = new Map(local.conflicts.filter(c => !resolved.has(c.id)).map(c => [c.id, c]));
  remote.conflicts.forEach(c => { if (!resolved.has(c.id) && !conflicts.has(c.id)) conflicts.set(c.id, c); });
  const keep = (board: Board) => {
    const id = `conflict-${board.weekStart}-${board.rev}`;
    if (resolved.has(id) || [...conflicts.values()].some(c => (c.sourceBoardId ? c.sourceBoardId === board.id : c.weekStart === board.weekStart) && equivalentBoards(c.doc, board.doc))) return;
    if (!conflicts.has(id)) conflicts.set(id, { id, sourceBoardId: board.id, createdAt: now.getTime(), weekStart: board.weekStart, startedOn: board.startedOn, doc: board.doc });
  };
  const deleted = { ...local.deleted };
  for (const t of remote.deleted) deleted[t.id] = Math.max(deleted[t.id] ?? 0, t.deletedAt);
  const remoteBoards = new Map(remote.boards.map(b => [b.id, b]));
  const boards: Board[] = [];
  for (const l of local.boards) {
    const r = remoteBoards.get(l.id); remoteBoards.delete(l.id);
    if (deleted[l.id] !== undefined) { if (l.rev !== l.baseRev && l.updatedAt > deleted[l.id] && !isEmpty(l.doc)) keep(l); continue; }
    if (!r || r.rev === l.baseRev) boards.push(l); // unknown to the cloud, or the cloud is unchanged since we last synced
    else if (r.rev === l.rev) boards.push({ ...l, baseRev: r.rev });
    else if (l.rev === l.baseRev) boards.push({ ...r, baseRev: r.rev, startedOn: r.startedOn < l.startedOn ? r.startedOn : l.startedOn });
    else { // both changed since the last sync: keep the cloud version, set our edits aside
      if (!equivalentBoards(l.doc, r.doc)) keep(l);
      boards.push({ ...r, baseRev: r.rev });
    }
  }
  for (const r of remoteBoards.values()) if (deleted[r.id] === undefined) boards.push({ ...r, baseRev: r.rev });
  return rollover(ensureActive({ ...local, boards, deleted, conflicts: [...conflicts.values()], resolvedConflicts }, now), now);
}

/** Older boards (and other devices' files) may lack fields added later. */
export function normalizeBoard(raw: StoredBoard): Board {
  const rev = raw.rev ?? `legacy-${raw.updatedAt ?? 0}`;
  return {
    id: raw.id, weekStart: weekStartISO(fromISO(raw.weekStart)), startedOn: weekStartISO(fromISO(raw.weekStart)),
    createdAt: raw.createdAt ?? (Date.parse(raw.archivedAt ?? '') || fromISO(raw.weekStart).getTime()), updatedAt: raw.updatedAt ?? 0,
    rev, baseRev: raw.baseRev ?? '', doc: raw.doc,
  };
}
/** The single live board of earlier versions becomes the board its week would have been archived as. */
export const legacyCurrentId = (weekStart: string) => `archive-${weekStart}`;

export async function loadWeekState(now = new Date()): Promise<WeekState> {
  try {
    await loadWeekPreference();
    const stored = await readStored();
    if (stored.boards.length && (stored.meta || !stored.current)) {
      const boards = stored.boards.map(normalizeBoard);
      const meta = stored.meta ?? { week: weekStartISO(now), activeId: '', deleted: {} }; // boards saved before their index was
      return rollover(ensureActive({ v: 2, ...meta, boards, conflicts: stored.conflicts }, now), now);
    }
    let legacy: { current?: LegacyCurrent; archives: StoredBoard[] } = { current: stored.current, archives: stored.boards };
    // The earliest versions kept everything in localStorage.
    const early = !stored.current && localStorage.getItem(LEGACY_KEY);
    if (early) {
      const parsed = JSON.parse(early) as { v: 1; current: LegacyCurrent; archives: Omit<StoredBoard, 'rev' | 'updatedAt'>[] };
      if (parsed?.v === 1 && parsed.current?.doc && Array.isArray(parsed.archives)) legacy = { current: { ...parsed.current, updatedAt: Date.now(), rev: newRev(), baseRev: '' }, archives: parsed.archives.map(a => ({ ...a, updatedAt: 0, rev: `legacy-${a.weekStart}` })) };
    }
    if (legacy.current) {
      // One-time migration from a single live board plus read-only archives.
      const c = legacy.current;
      const archives = legacy.archives.map(normalizeBoard);
      const id = archives.some(a => a.id === legacyCurrentId(c.weekStart)) ? weeklyBoardId(c.weekStart) : legacyCurrentId(c.weekStart);
      const rev = c.rev ?? newRev(); // data from before cloud sync: unsynced unless it was never edited
      const current = normalizeBoard({ ...c, id, rev, createdAt: fromISO(c.startedOn ?? c.weekStart).getTime(), baseRev: c.baseRev ?? ((c.updatedAt ?? 0) === 0 ? rev : '') });
      const state = rollover({ v: 2, week: c.weekStart, activeId: id, boards: [...archives, current], deleted: {}, conflicts: stored.conflicts.map(({ kind: _kind, ...copy }) => copy) }, now);
      if (await saveWeekState(state) && early) localStorage.removeItem(LEGACY_KEY);
      return state;
    }
  } catch { /* fall through to a fresh start */ }
  const week = weekStartISO(now);
  const first = newBoard(week, now, createDemo(), weeklyBoardId(week));
  const state: WeekState = { v: 2, week, activeId: first.id, boards: [first], deleted: {}, conflicts: [] };
  await saveWeekState(state);
  return state;
}
export async function saveWeekState(state: WeekState) {
  try { await Promise.all([writeBoards(state.boards), writeMeta({ week: state.week, activeId: state.activeId, deleted: state.deleted, resolvedConflicts: state.resolvedConflicts }), writeConflicts(state.conflicts)]); return true; } catch { return false; }
}
