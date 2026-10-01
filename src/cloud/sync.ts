import { useSyncExternalStore } from 'react';
import { type Archive, type ConflictCopy, type CurrentWeek, type WeekState, reconcile } from '../weeks';
import type { BoardDocument } from '../model';
import { readKv, writeKv } from '../storage';
import { fetchUser, hasRefreshFlow, hasValidToken, invalidateToken, requestToken, revoke, type GoogleUser } from './auth';
import { externalize, internalize } from './assets';
import { isCloudConfigured } from './config';
import * as drive from './drive';

export interface Backend {
  list(): Promise<drive.DriveFile[]>;
  read<T>(id: string): Promise<T>;
  write(name: string, value: unknown, existingId?: string): Promise<unknown>;
  readAsset(id: string): Promise<string>;
  writeAsset(name: string, dataUrl: string, existingId?: string): Promise<unknown>;
  remove(id: string): Promise<unknown>;
}
const driveBackend: Backend = { list: drive.listFiles, read: drive.readJson, write: drive.writeJson, readAsset: drive.readAsset, writeAsset: drive.writeAsset, remove: drive.remove };

export type CloudStatus = 'unconfigured' | 'signed-out' | 'connecting' | 'idle' | 'syncing' | 'needs-reconnect' | 'error';
export interface CloudState { status: CloudStatus; user?: GoogleUser; lastSyncedAt?: number; error?: string }
/** What the sync engine needs from the app: the live state, a way to apply a merged result, and to mark a pushed version. */
export interface Host { getState(): WeekState; apply(next: WeekState): void; markSynced(uploaded: CurrentWeek): void }

const SESSION_KEY = 'cloud-session', PENDING_DELETES = 'cloud-pending-deletes', PENDING_UPLOAD = 'cloud-pending-upload';
const CURRENT_FILE = 'current.json', archiveFile = (a: { weekStart: string }) => `archive-${a.weekStart}.json`, conflictFile = (c: { id: string }) => `${c.id}.json`, assetFile = (hash: string) => `asset-${hash}`;
const GC_GRACE_MS = 24 * 3600_000, GC_INTERVAL_MS = 3600_000;
const AUTH_ERROR = /interaction_required|login_required|consent_required|popup|access_denied|did not approve|user interaction|cancel/i;

export function createCloud(backend: Backend = driveBackend, configured = isCloudConfigured, ensureToken: () => Promise<void> = async () => { if (!hasValidToken()) await requestToken(false); }) {
  let state: CloudState = { status: configured ? 'signed-out' : 'unconfigured' };
  let retriedAuth = false;
  let host: Host | null = null, timer: ReturnType<typeof setTimeout> | undefined, running = false, queued = false;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<CloudState>) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };
  const active = () => state.status !== 'signed-out' && state.status !== 'unconfigured' && state.status !== 'connecting';

  // Delete photo files no board in the cloud references any more. The grace period protects a photo another device
  // has just uploaded but not yet linked from its board file.
  let lastGc = 0;
  async function collectGarbage(files: drive.DriveFile[], merged: WeekState) {
    if (Date.now() - lastGc < GC_INTERVAL_MS) return;
    lastGc = Date.now();
    const referenced = new Map<string, string>();
    for (const doc of [merged.current.doc, ...merged.archives.map(a => a.doc), ...merged.conflicts.map(c => c.doc)]) await externalize(doc, referenced);
    for (const f of files) {
      if (!f.name.startsWith('asset-') || referenced.has(f.name.slice('asset-'.length))) continue;
      if (Date.now() - Date.parse(f.modifiedTime) > GC_GRACE_MS) await backend.remove(f.id);
    }
  }

  async function sync() {
    if (!host || !active()) return;
    if (running) { queued = true; return; }
    running = true; set({ status: 'syncing', error: undefined });
    let retry = false;
    try {
      await ensureToken();
      let files = await backend.list();
      const byName = new Map(files.map(f => [f.name, f]));
      // Apply deletions that were made while offline, and never pull a discarded conflict back.
      const pending = (await readKv<string[]>(PENDING_DELETES)) ?? [];
      for (const id of pending) { const f = byName.get(`${id}.json`); if (f) await backend.remove(f.id); byName.delete(`${id}.json`); }
      if (pending.length) { await writeKv(PENDING_DELETES, []); files = files.filter(f => byName.has(f.name)); }

      const local = host.getState();
      // Photos we already hold locally never need downloading.
      const assets = new Map<string, string>();
      const scan = async (doc: BoardDocument) => { await externalize(doc, assets); };
      for (const doc of [local.current.doc, ...local.archives.map(a => a.doc), ...local.conflicts.map(c => c.doc)]) await scan(doc);
      const loadAsset = async (hash: string) => {
        if (assets.has(hash)) return assets.get(hash);
        const file = byName.get(assetFile(hash)); if (!file) return undefined;
        const data = await backend.readAsset(file.id); assets.set(hash, data); return data;
      };
      const pull = async <T extends { doc: BoardDocument }>(id: string): Promise<T> => { const value = await backend.read<T>(id); return { ...value, doc: await internalize(value.doc, loadAsset) }; };

      // Pull: the live week, plus archives/conflicts we don't have yet or that changed since the last sync.
      const currentFile = byName.get(CURRENT_FILE);
      const remoteCurrent = currentFile ? await pull<CurrentWeek>(currentFile.id) : undefined;
      const conflictIds = new Set(local.conflicts.map(c => c.id));
      const remoteArchives: Archive[] = [], remoteConflicts: ConflictCopy[] = [];
      for (const f of files) {
        // Device clocks are not a reliable cursor for Drive changes.
        if (f.name.startsWith('archive-')) remoteArchives.push(await pull<Archive>(f.id));
        else if (f.name.startsWith('conflict-') && !conflictIds.has(f.name.replace('.json', ''))) remoteConflicts.push(await pull<ConflictCopy>(f.id));
      }

      // Recover a successful write whose response was lost (including a tab closed mid-upload).
      const pendingUpload = await readKv<CurrentWeek>(PENDING_UPLOAD);
      if (pendingUpload && remoteCurrent?.rev === pendingUpload.rev && remoteCurrent.weekStart === pendingUpload.weekStart) host.markSynced(pendingUpload);
      // No await between taking this snapshot and applying its merge: edits made during pulls survive.
      const latest = host.getState();
      const { state: merged, pushCurrent } = reconcile(latest, remoteCurrent, remoteArchives, remoteConflicts.filter(c => !pending.includes(c.id)));
      const sig = (s: WeekState) => JSON.stringify([s.current.rev, s.current.baseRev, s.current.weekStart, s.archives.map(a => [a.id, a.rev]), s.conflicts.map(c => c.id)]);
      if (sig(merged) !== sig(latest)) host.apply(merged);

      // Push: upload any photos the cloud lacks, then board files.
      const upload = async (doc: BoardDocument) => {
        const out = new Map<string, string>(), ext = await externalize(doc, out);
        for (const [hash, data] of out) if (!byName.has(assetFile(hash))) { await backend.writeAsset(assetFile(hash), data); byName.set(assetFile(hash), { id: '', name: assetFile(hash), modifiedTime: '' }); }
        return ext;
      };
      if (pushCurrent) {
        const c = merged.current;
        const doc = await upload(c.doc);
        await writeKv(PENDING_UPLOAD, c);
        await backend.write(CURRENT_FILE, { ...c, baseRev: c.rev, doc }, currentFile?.id);
        host.markSynced(c);
        await writeKv(PENDING_UPLOAD, null);
        if (host.getState().current.rev !== c.rev) queued = true;
      }
      const remoteArchiveById = new Map(remoteArchives.map(a => [a.id, a]));
      for (const a of merged.archives) {
        const file = byName.get(archiveFile(a)), remote = remoteArchiveById.get(a.id);
        if (!file || (remote && remote.rev !== a.rev)) await backend.write(archiveFile(a), { ...a, doc: await upload(a.doc) }, file?.id);
      }
      for (const c of merged.conflicts) if (!byName.has(conflictFile(c))) await backend.write(conflictFile(c), { ...c, doc: await upload(c.doc) });
      await collectGarbage(files, merged);
      set({ status: 'idle', lastSyncedAt: Date.now() });
    } catch (error) {
      // A rejected token is usually just expired: renew silently and retry once before asking the user to reconnect.
      if (error instanceof drive.DriveAuthError && !retriedAuth) { retriedAuth = true; invalidateToken(); retry = true; return; }
      const auth = error instanceof drive.DriveAuthError || AUTH_ERROR.test(String((error as Error).message));
      set(auth ? { status: 'needs-reconnect', error: undefined } : { status: 'error', error: (error as Error).message });
    } finally {
      running = false; if (!retry) retriedAuth = false;
      if (retry) queued = true;
      if (queued) { queued = false; schedule(500); }
    }
  }
  // Renew the access token in the background before it lapses, so a long-open tab never has to ask.
  if (typeof window !== 'undefined') setInterval(() => { if (active() && hasRefreshFlow() && !hasValidToken()) void requestToken(false).catch(() => schedule(500)); }, 5 * 60_000);
  function schedule(delay = 3000) { clearTimeout(timer); timer = setTimeout(sync, delay); }
  if (typeof window !== 'undefined') window.addEventListener('online', () => { if (active()) schedule(500); });

  return {
    getState: () => state,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
    attach(h: Host) { host = h; },
    /** Call when local data changed. */
    changed() { if (active()) schedule(); },
    syncNow: sync,
    /** Forget a conflict copy everywhere, including the cloud (applied on the next sync if offline). */
    async discardConflict(id: string) { await writeKv(PENDING_DELETES, [...((await readKv<string[]>(PENDING_DELETES)) ?? []), id]); if (active()) schedule(300); },
    /** Resume a previous session on startup, silently if the browser/Google allows it. */
    async resume() {
      const user = configured ? await readKv<GoogleUser>(SESSION_KEY) : undefined;
      if (!user) return;
      set({ status: 'needs-reconnect', user });
      try { await requestToken(false); set({ status: 'idle' }); await sync(); } catch { /* stays "needs-reconnect"; the user can click Reconnect */ }
    },
    async signIn() {
      if (!configured) return;
      set({ status: 'connecting', error: undefined });
      try {
        await requestToken(true);
        const user = await fetchUser(); await writeKv(SESSION_KEY, user);
        set({ status: 'idle', user }); await sync();
      } catch (error) { set({ status: state.user ? 'needs-reconnect' : 'signed-out', error: (error as Error).message }); }
    },
    async signOut() {
      clearTimeout(timer); revoke(); await writeKv(SESSION_KEY, null);
      set({ status: configured ? 'signed-out' : 'unconfigured', user: undefined, lastSyncedAt: undefined, error: undefined });
    },
  };
}
export const cloud = createCloud();
export type Cloud = ReturnType<typeof createCloud>;
export const useCloud = (c: Cloud = cloud) => useSyncExternalStore(c.subscribe, c.getState);
