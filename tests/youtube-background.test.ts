import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, test, vi } from 'vitest';

function background() {
  let listener: (message: unknown, sender: unknown) => Promise<unknown> | undefined;
  const updateSessionRules = vi.fn(async (_rules: unknown) => {});
  const api = {
    permissions: { contains: vi.fn(async () => true) },
    action: { onClicked: { addListener: vi.fn() } },
    runtime: { id: 'weekly-board@analogwitch', getURL: (path: string) => `moz-extension://app-uuid/${path}`, onMessage: { addListener: (fn: typeof listener) => { listener ??= fn; } } },
    declarativeNetRequest: { updateSessionRules },
  };
  runInNewContext(readFileSync('extension/background.js', 'utf8'), { browser: api, URL });
  return { permissions: api.permissions, call: (sender: unknown) => listener({ type: 'prepare-youtube-player' }, sender), updateSessionRules };
}
const sender = { id: 'weekly-board@analogwitch', url: 'moz-extension://app-uuid/index.html' };
test('player identification affects only this extension’s YouTube iframe requests', async () => {
  const f = background();
  expect(await f.call(sender)).toEqual({ ok: true });
  const rules = f.updateSessionRules.mock.calls[0][0] as { addRules: { condition: unknown; action: unknown }[] };
  expect(rules.addRules[0].condition).toEqual({ urlFilter: '|https://www.youtube-nocookie.com/embed/', initiatorDomains: ['app-uuid'], resourceTypes: ['sub_frame'] });
  expect(rules.addRules[0].action).toMatchObject({ type: 'modifyHeaders', requestHeaders: [{ header: 'Referer', operation: 'set', value: 'https://ziru-wei.github.io/analog-weekly-board/' }] });
  await f.call(sender);
  expect(f.updateSessionRules).toHaveBeenCalledTimes(1);
});
test('other pages and extensions cannot initialize the player rule', () => {
  const f = background();
  expect(f.call({ ...sender, url: 'https://example.com/' })).toBeUndefined();
  expect(f.call({ ...sender, id: 'other-extension' })).toBeUndefined();
  expect(f.updateSessionRules).not.toHaveBeenCalled();
});
test('a failed setup can be retried before creating an iframe', async () => {
  const f = background();
  f.updateSessionRules.mockRejectedValueOnce(new Error('permission missing'));
  expect(await f.call(sender)).toEqual({ ok: false });
  expect(await f.call(sender)).toEqual({ ok: true });
});

test('Firefox supplies Referer only for player frames from the board', async () => {
  let headerListener: (details: { documentUrl?: string; originUrl?: string; requestHeaders?: { name: string; value: string }[] }) => { requestHeaders?: { name: string; value: string }[] };
  let messageListener: (message: unknown, sender: unknown) => Promise<unknown>;
  const addListener = vi.fn(fn => { headerListener = fn; });
  const api = {
    permissions: { contains: vi.fn(async () => true) },
    action: { onClicked: { addListener: vi.fn() } },
    runtime: { id: sender.id, getURL: (path: string) => `moz-extension://app-uuid/${path}`, onMessage: { addListener: (fn: typeof messageListener) => { messageListener ??= fn; } } },
    webRequest: { onBeforeSendHeaders: { addListener } },
  };
  runInNewContext(readFileSync('extension/background.js', 'utf8'), { browser: api, URL });
  expect(addListener.mock.calls[0].slice(1)).toEqual([{ urls: ['https://www.youtube-nocookie.com/embed/*'], types: ['sub_frame'] }, ['blocking', 'requestHeaders']]);
  expect(headerListener!({ documentUrl: sender.url, requestHeaders: [{ name: 'referer', value: sender.url }, { name: 'Accept', value: '*/*' }] }).requestHeaders).toEqual([
    { name: 'Accept', value: '*/*' }, { name: 'Referer', value: 'https://ziru-wei.github.io/analog-weekly-board/' },
  ]);
  expect(headerListener!({ originUrl: sender.url }).requestHeaders).toHaveLength(1);
  expect(headerListener!({ documentUrl: 'https://example.com/' })).toEqual({});
  expect(headerListener!({ documentUrl: 'moz-extension://different/index.html' })).toEqual({});
  expect(headerListener!({})).toEqual({});
  expect(await messageListener!({ type: 'prepare-youtube-player' }, sender)).toEqual({ ok: true });
});

test('a Firefox upgrade without newly added host grants cannot report player setup success', async () => {
  const f = background();
  f.permissions.contains.mockResolvedValueOnce(false);
  expect(await f.call(sender)).toEqual({ ok: false, needsPermission: true });
  expect(f.updateSessionRules).not.toHaveBeenCalled();
  expect(await f.call(sender)).toEqual({ ok: true });
});
