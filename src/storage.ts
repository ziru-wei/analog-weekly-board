import type { Board, ConflictCopy } from './weeks';

// Local persistence in IndexedDB: a `kv` store for settings and which board is open, and one row per board in `archives`
// (named when only finished weeks lived there; the store now holds every board).
const DB_NAME = 'analog-weekly-board', DB_VERSION = 2;
let dbPromise: Promise<IDBDatabase> | null = null;
// Cleared when another tab takes over the board, so this tab can never overwrite what that tab saves.
let writable = true;
export const stopWriting = () => { writable = false; };

function open() {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('archives')) db.createObjectStore('archives', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('conflicts')) db.createObjectStore('conflicts', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}
const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); });
const result = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });

export interface StoredMeta { week: string; activeId: string; deleted: Record<string, number>; resolvedConflicts?: string[] }
/** Before multiple boards: the single live week, saved under the `current` key. */
export interface LegacyCurrent { weekStart: string; startedOn: string; updatedAt?: number; rev?: string; baseRev?: string; doc: Board['doc'] }
export type StoredBoard = Partial<Board> & Pick<Board, 'id' | 'weekStart' | 'doc'> & { archivedAt?: string };
export async function readStored(): Promise<{ meta?: StoredMeta; current?: LegacyCurrent; boards: StoredBoard[]; conflicts: (ConflictCopy & { kind?: string })[] }> {
  const db = await open();
  const tx = db.transaction(['kv', 'archives', 'conflicts'], 'readonly');
  const [meta, current, boards, conflicts] = await Promise.all([result(tx.objectStore('kv').get('boards')), result(tx.objectStore('kv').get('current')), result(tx.objectStore('archives').getAll()), result(tx.objectStore('conflicts').getAll())]);
  return { meta: meta as StoredMeta | undefined, current: current as LegacyCurrent | undefined, boards: boards as StoredBoard[], conflicts: conflicts as ConflictCopy[] };
}
/** Save one board (the open board is saved this way while it is being edited). */
export async function writeBoard(board: Board) {
  if (!writable) return;
  const db = await open(); const tx = db.transaction('archives', 'readwrite');
  tx.objectStore('archives').put(board); await done(tx);
}
export async function writeMeta(meta: StoredMeta) {
  if (!writable) return;
  const db = await open(); const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put(meta, 'boards'); tx.objectStore('kv').delete('current'); await done(tx);
}
// Replace the whole store so removed entries (deleted boards, discarded conflicts) disappear too.
async function replaceAll(storeName: 'archives' | 'conflicts', rows: unknown[]) {
  if (!writable) return;
  const db = await open(); const tx = db.transaction(storeName, 'readwrite'); const store = tx.objectStore(storeName);
  store.clear(); rows.forEach(r => store.put(r)); await done(tx);
}
export const writeBoards = (boards: Board[]) => replaceAll('archives', boards);
export const writeConflicts = (conflicts: ConflictCopy[]) => replaceAll('conflicts', conflicts);
export async function readKv<T>(key: string): Promise<T | undefined> {
  const db = await open(); return result(db.transaction('kv').objectStore('kv').get(key)) as Promise<T | undefined>;
}
export async function writeKv(key: string, value: unknown) {
  if (!writable) return;
  const db = await open(); const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(value, key); await done(tx);
}
