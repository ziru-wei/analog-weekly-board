import { expect, test, vi } from 'vitest';
import { youtubeVideo, youtubeEmbedUrl, videoCardSize, youtubeTitle } from '../src/youtube';

const id = 'M7lc1UVf-VE';
test.each([
  `https://www.youtube.com/watch?v=${id}&feature=share`,
  `https://youtu.be/${id}?si=abc`,
  `https://m.youtube.com/shorts/${id}`,
  `https://www.youtube.com/live/${id}`,
  `https://www.youtube-nocookie.com/embed/${id}`,
])('recognizes a supported video URL: %s', url => {
  expect(youtubeVideo(url)).toEqual({ id, start: 0 });
});
test.each([
  `https://youtube.com.evil.test/watch?v=${id}`,
  `https://youtube.com@evil.test/watch?v=${id}`,
  `https://evil.test/?url=https://youtube.com/watch?v=${id}`,
  `javascript:alert(1)`, `https://www.youtube.com/playlist?list=abc`,
  `https://www.youtube.com/watch?v=abc`, `https://youtu.be/${id}/extra`,
])('does not embed an unrelated or invalid URL: %s', url => {
  expect(youtubeVideo(url)).toBeNull();
});
test('preserves start timestamps without forwarding tracking or arbitrary player parameters', () => {
  const video = youtubeVideo(`https://youtu.be/${id}?t=1h2m3s&autoplay=1&si=private`)!;
  expect(video.start).toBe(3723);
  const url = new URL(youtubeEmbedUrl(video));
  expect(url.origin).toBe('https://www.youtube-nocookie.com');
  expect(url.searchParams.get('start')).toBe('3723');
  expect(url.searchParams.has('autoplay')).toBe(false);
  expect(url.searchParams.has('si')).toBe(false);
  expect(youtubeVideo(`https://www.youtube.com/watch?v=${id}&start=75`)?.start).toBe(75);
  expect(youtubeVideo(`https://www.youtube.com/watch?v=${id}&t=-20`)?.start).toBe(0);
});

test('extension players include HTTPS client identity and keep a compact 16:9 viewport', () => {
  const url = new URL(youtubeEmbedUrl({ id, start: 0 }));
  expect(url.searchParams.get('origin')).toBe('https://ziru-wei.github.io');
  expect(url.searchParams.get('widget_referrer')).toBe('https://ziru-wei.github.io/analog-weekly-board/');
  const small = videoCardSize(300, 76);
  expect(small).toEqual({ width: 400, height: 297 });
  expect((small.width - 32) / (small.height - 90)).toBeCloseTo(16 / 9);
  expect(videoCardSize(600, 500)).toEqual({ width: 600, height: 500 });
});
test('video titles are fetched without credentials and reused across cards', async () => {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ title: 'A video title' }) }));
  vi.stubGlobal('fetch', fetch);
  try {
    expect(await youtubeTitle(id)).toBe('A video title');
    expect(await youtubeTitle(id)).toBe('A video title');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual([expect.any(URL), expect.objectContaining({ credentials: 'omit' })]);
    expect(await youtubeTitle('invalid')).toBe('');
  } finally { vi.unstubAllGlobals(); }
});
