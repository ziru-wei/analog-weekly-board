import { SitePermissionError } from './sitePermissions';
export interface YouTubeVideo { id: string; start: number }

/** Parse only known YouTube video routes; never embed an arbitrary pasted URL. */
export function youtubeVideo(value: string): YouTubeVideo | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase(), parts = url.pathname.split('/').filter(Boolean);
    let id: string | null = null;
    if (host === 'youtu.be' || host === 'www.youtu.be') id = parts.length === 1 ? parts[0] : null;
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (parts.length === 2 && ['embed', 'shorts', 'live'].includes(parts[0])) id = parts[1];
    }
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    const time = url.searchParams.get('start') ?? url.searchParams.get('t') ?? '';
    const units = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(time);
    const seconds = /^\d+$/.test(time) ? Number(time) : units ? Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0) : 0;
    return { id, start: Number.isSafeInteger(seconds) && seconds >= 0 ? Math.min(seconds, 2147483647) : 0 };
  } catch { return null; }
}

export function youtubeEmbedUrl(video: YouTubeVideo) {
  const url = new URL(`https://www.youtube-nocookie.com/embed/${video.id}`);
  url.searchParams.set('playsinline', '1');
  // Extension URLs have no HTTPS origin. Supply our app identity explicitly,
  // alongside the scoped Referer header installed before the frame is mounted.
  const origin = typeof location !== 'undefined' && /^https?:$/.test(location.protocol) ? location.origin : 'https://ziru-wei.github.io';
  url.searchParams.set('origin', origin);
  url.searchParams.set('widget_referrer', typeof location !== 'undefined' && /^https?:$/.test(location.protocol) ? location.href : 'https://ziru-wei.github.io/analog-weekly-board/');
  if (video.start) url.searchParams.set('start', String(video.start));
  return url.href;
}

export async function prepareYouTubePlayer() {
  type Runtime = { id?: string; sendMessage(message: unknown): Promise<{ ok: boolean; needsPermission?: boolean }> };
  const scope = globalThis as typeof globalThis & { browser?: { runtime?: Runtime }; chrome?: { runtime?: Runtime } };
  const runtime = scope.browser?.runtime ?? scope.chrome?.runtime;
  if (!runtime?.id) return;
  const response = await runtime.sendMessage({ type: 'prepare-youtube-player' });
  if (response?.needsPermission) throw new SitePermissionError('Allow YouTube playback to grant the missing site permission.');
  if (!response?.ok) throw new Error('Could not load the player. Try again or open on YouTube.');
}

/** Compact 16:9 viewport, with space for the clipping header. */
export function videoCardSize(width: number, height = 0) {
  width = Math.max(400, width);
  return { width, height: Math.max(height, (width - 32) * 9 / 16 + 90) };
}

const titles = new Map<string, Promise<string>>();
export function youtubeTitle(id: string): Promise<string> {
  if (!/^[\w-]{11}$/.test(id)) return Promise.resolve('');
  let result = titles.get(id);
  if (!result) {
    const url = new URL('https://www.youtube.com/oembed');
    url.searchParams.set('url', `https://www.youtube.com/watch?v=${id}`);
    url.searchParams.set('format', 'json');
    result = fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(6000) })
      .then(async response => { if (!response.ok) return ''; const data = await response.json(); return typeof data.title === 'string' ? data.title.slice(0, 500) : ''; })
      .catch(() => '')
      .then(title => { if (!title) titles.delete(id); return title; });
    titles.set(id, result);
  }
  return result;
}
