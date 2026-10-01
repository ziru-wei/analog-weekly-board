import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { acknowledgeUpload, emptyBoard, reconcile, weekStartISO, type CurrentWeek, type WeekState } from '../src/weeks';
import { readKv, writeKv } from '../src/storage';
import { createCloud, type Backend } from '../src/cloud/sync';

vi.mock('../src/cloud/auth', () => ({
  requestToken: vi.fn(), hasValidToken: () => true, hasRefreshFlow: () => false,
  fetchUser: async () => ({ email: 'test@example.com' }), revoke: vi.fn(), invalidateToken: vi.fn(),
}));

const weekStart = weekStartISO(new Date());
const current = (rev = 'base', baseRev = 'base'): CurrentWeek => ({
  weekStart, startedOn: weekStart, rev, baseRev, updatedAt: 1, doc: emptyBoard(weekStart),
});
const stateOf = (c = current()): WeekState => ({ v: 1, current: c, archives: [], conflicts: [] });
function fixture(initial = current('edit')) {
  let local = stateOf(initial), remote = current();
  const backend: Backend = {
    list: async () => [{ id: 'current', name: 'current.json', modifiedTime: new Date().toISOString() }],
    read: vi.fn(async () => structuredClone(remote)) as Backend['read'],
    write: vi.fn(async (_name, value) => { remote = structuredClone(value as CurrentWeek); }),
    readAsset: vi.fn(), writeAsset: vi.fn(), remove: vi.fn(),
  };
  const engine = createCloud(backend, true, async () => {});
  engine.attach({ getState: () => local, apply: next => { local = next; }, markSynced: c => { local = acknowledgeUpload(local, c); } });
  return { engine, backend, local: () => local, remote: () => remote,
    edit: (rev: string) => { local = { ...local, current: { ...local.current, rev, doc: { ...local.current.doc, board: { ...local.current.doc.board, title: rev } } } }; engine.changed(); },
  };
}
beforeEach(async () => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); await writeKv('cloud-pending-upload', null); await writeKv('cloud-pending-deletes', []); });
afterEach(() => { vi.useRealTimers(); });

test('continuous edits during uploads advance the base without creating self-conflicts', async () => {
  const f = fixture();
  const write = f.backend.write;
  let n = 0;
  f.backend.write = async (...args) => { f.edit(`during-upload-${++n}`); return write(...args); };
  await f.engine.signIn();
  for (let i = 0; i < 5; i++) await f.engine.syncNow();
  expect(f.local().current.rev).toBe('during-upload-6');
  expect(f.local().current.baseRev).toBe('during-upload-5');
  expect(f.local().conflicts).toHaveLength(0);
  f.backend.write = write;
  await f.engine.syncNow();
  expect(f.remote().rev).toBe(f.local().current.rev);
  expect(f.local().current.baseRev).toBe(f.local().current.rev);
});

test('edits made during downloads are included in the merge and upload', async () => {
  const f = fixture(current());
  const read = f.backend.read;
  f.backend.read = async id => { f.edit('during-download'); return read(id); };
  await f.engine.signIn();
  expect(f.local().current.rev).toBe('during-download');
  expect(f.remote().doc.board.title).toBe('during-download');
  expect(f.local().conflicts).toHaveLength(0);
});

test('lost upload responses recover their baseline on the next pull', async () => {
  const f = fixture();
  const write = f.backend.write;
  f.backend.write = async (...args) => { await write(...args); f.edit('newer'); throw new Error('connection lost'); };
  await f.engine.signIn();
  expect(f.engine.getState().status).toBe('error');
  expect(await readKv('cloud-pending-upload')).toMatchObject({ rev: 'edit' });
  f.backend.write = write;
  await f.engine.syncNow();
  expect(f.local().conflicts).toHaveLength(0);
  expect(f.remote().rev).toBe('newer');
});

test('a failed upload never marks content as synced', async () => {
  const f = fixture();
  f.backend.write = async () => { throw new Error('offline'); };
  await f.engine.signIn();
  expect(f.local().current.baseRev).toBe('base');
  expect(f.local().current.rev).toBe('edit');
});

test('acknowledgements cannot cross weeks or an independently changed baseline', () => {
  const local = stateOf(current('newer', 'different-base'));
  expect(acknowledgeUpload(local, current('edit'))).toBe(local);
  expect(acknowledgeUpload(local, { ...local.current, weekStart: '2000-01-03' })).toBe(local);
});

test('genuine offline divergence still preserves one stable conflict copy', () => {
  const local = stateOf(current('local'));
  local.current.doc.board.title = 'local edits';
  const remote = current('remote', 'remote');
  const first = reconcile(local, remote, [], []);
  expect(first.state.current.rev).toBe('remote');
  expect(first.state.conflicts).toHaveLength(1);
  expect(first.state.conflicts[0].doc.board.title).toBe('local edits');
  expect(reconcile(first.state, remote, [], []).state.conflicts).toHaveLength(1);
});
