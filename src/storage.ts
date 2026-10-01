import type { Archive, ConflictCopy, CurrentWeek } from './weeks';

// Local persistence in IndexedDB: one `kv` store for the live week, one `archives` store keyed by archive id.
const DB_NAME = 'analog-weekly-board', DB_VERSION = 2;
let dbPromise: Promise<IDBDatabase> | null = null;

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

export async function readStored(): Promise<{ current?: CurrentWeek; archives: Archive[]; conflicts: ConflictCopy[] }> {
  const db = await open();
  const tx = db.transaction(['kv', 'archives', 'conflicts'], 'readonly');
  const [current, archives, conflicts] = await Promise.all([result(tx.objectStore('kv').get('current')), result(tx.objectStore('archives').getAll()), result(tx.objectStore('conflicts').getAll())]);
  return { current: current as CurrentWeek | undefined, archives: archives as Archive[], conflicts: conflicts as ConflictCopy[] };
}
export async function writeCurrent(current: CurrentWeek) {
  const db = await open(); const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put(current, 'current'); await done(tx);
}
// Replace the whole store so removed entries (e.g. discarded conflicts) disappear too.
async function replaceAll(storeName: 'archives' | 'conflicts', rows: unknown[]) {
  const db = await open(); const tx = db.transaction(storeName, 'readwrite'); const store = tx.objectStore(storeName);
  store.clear(); rows.forEach(r => store.put(r)); await done(tx);
}
export const writeArchives = (archives: Archive[]) => replaceAll('archives', archives);
export const writeConflicts = (conflicts: ConflictCopy[]) => replaceAll('conflicts', conflicts);
export async function readKv<T>(key: string): Promise<T | undefined> {
  const db = await open(); return result(db.transaction('kv').objectStore('kv').get(key)) as Promise<T | undefined>;
}
export async function writeKv(key: string, value: unknown) {
  const db = await open(); const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(value, key); await done(tx);
}
