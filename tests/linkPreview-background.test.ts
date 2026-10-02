import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, test, vi } from 'vitest';
const sender = { id: 'board', url: 'moz-extension://board/index.html' };
function background(granted = true, contentType = 'text/html', destination = 'https://example.com/article') {
  const listeners: ((message: unknown, sender: unknown) => unknown)[] = [];
  const response = new Response('<html><title>Article</title></html>', { headers: { 'content-type': contentType } });
  Object.defineProperty(response, 'url', { value: destination });
  const fetch = vi.fn(async () => response);
  runInNewContext(readFileSync('extension/background.js', 'utf8'), {
    browser: { action: { onClicked: { addListener() {} } }, runtime: { id: sender.id, getURL: (path: string) => `moz-extension://board/${path}`, onMessage: { addListener: (fn: typeof listeners[number]) => listeners.push(fn) } }, permissions: { contains: async () => granted } },
    URL, fetch, AbortSignal, TextDecoder,
  });
  return { fetch, call: (url: string, from = sender) => listeners.map(fn => fn({ type: 'link-preview', url }, from)).find(result => result !== undefined) };
}
test('previews fetch a board-requested page without cookies', async () => {
  const f = background();
  expect(await f.call('https://example.com/article')).toMatchObject({ ok: true, html: '<html><title>Article</title></html>' });
  expect(f.fetch).toHaveBeenCalledWith('https://example.com/article', expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }));
});
test('missing optional permission is reported without starting a request', async () => {
  const f = background(false);
  expect(await f.call('https://example.com/article')).toEqual({ ok: false, needsPermission: true });
  expect(f.fetch).not.toHaveBeenCalled();
});
test('untrusted pages and non-web URLs cannot use the background fetcher', async () => {
  const f = background();
  expect(f.call('https://example.com/', { ...sender, url: 'https://untrusted.test/' })).toBeUndefined();
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://user:secret@example.com/']) expect(await f.call(url)).toEqual({ ok: false });
  expect(f.fetch).not.toHaveBeenCalled();
});
test('login redirects are not presented as post content', async () => {
  const f = background(true, 'text/html', 'https://www.xiaohongshu.com/login');
  expect(await f.call('https://www.xiaohongshu.com/explore/example')).toEqual({ ok: false, restricted: true });
});
test('non-HTML responses are not parsed as previews', async () => {
  expect(await background(true, 'application/pdf').call('https://example.com/article')).toEqual({ ok: false });
});
