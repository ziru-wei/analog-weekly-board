import { parseXiaohongshuPreview, type XiaohongshuMedia } from '../worker/xiaohongshu.js';
export interface LinkPreview { title: string; description: string; image: string; media?: XiaohongshuMedia; restricted?: boolean; needsPermission?: boolean }

export function publicWebUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

/** Extract text and image URLs only. The remote document is never mounted or executed. */
export function parseLinkPreview(html: string, url: string): LinkPreview {
  const xhs = parseXiaohongshuPreview(html, url); if (xhs) return xhs;
  const inert = html.replace(/<(script|style|iframe|object|video|audio)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(?:link|base|embed)\b[^>]*>/gi, '')
    .replace(/(<img\b[^>]*?)\bsrc\s*=/gi, '$1data-preview-src=');
  const doc = new DOMParser().parseFromString(inert, 'text/html');
  const meta = (...names: string[]) => {
    for (const name of names) {
      const value = doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content')?.trim();
      if (value) return value;
    }
    return '';
  };
  const text = (value: string) => value.replace(/\s+/g, ' ').trim();
  const title = text(meta('og:title', 'twitter:title') || doc.querySelector('title')?.textContent || '').slice(0, 300);
  const paragraph = Array.from(doc.querySelectorAll('main p, article p')).map(p => text(p.textContent ?? '')).find(p => p.length > 70) ?? '';
  const description = text(meta('og:description', 'twitter:description', 'description') || paragraph).slice(0, 700);
  const candidate = meta('og:image:secure_url', 'og:image', 'twitter:image') || doc.querySelector('main img[data-preview-src], article img[data-preview-src]')?.getAttribute('data-preview-src') || '';
  const image = candidate ? publicWebUrl(candidate, url) ?? '' : '';
  return { title, description, image };
}

const previews = new Map<string, { task: Promise<LinkPreview | null>; expires: number }>();
export function loadLinkPreview(url: string): Promise<LinkPreview | null> {
  if (!publicWebUrl(url)) return Promise.resolve(null);
  const cached = previews.get(url); if (cached && cached.expires > Date.now()) return cached.task;
  const task = (async () => {
    type Result = { ok: boolean; html?: string; url?: string; preview?: LinkPreview; restricted?: boolean; needsPermission?: boolean };
    type Runtime = { id?: string; sendMessage(message: unknown): Promise<Result> };
    const scope = globalThis as typeof globalThis & { browser?: { runtime?: Runtime }; chrome?: { runtime?: Runtime } };
    const runtime = scope.browser?.runtime ?? scope.chrome?.runtime;
    if (runtime?.id) {
      const response = await runtime.sendMessage({ type: 'link-preview', url });
      if (response?.ok && response.preview) return response.preview;
      if (!response?.ok || !response.html || !response.url) return response?.needsPermission ? { title: '', description: '', image: '', needsPermission: true } : response?.restricted ? { title: '', description: '', image: '', restricted: true } : null;
      return parseLinkPreview(response.html, response.url);
    }
    const worker = (import.meta.env.VITE_PREVIEW_WORKER_URL || import.meta.env.VITE_AUTH_WORKER_URL || '').replace(/\/$/, '');
    const endpoint = import.meta.env.DEV || location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? '/api/link-preview' : worker ? `${worker}/api/link-preview` : '';
    if (endpoint) {
      try {
        const response = await fetch(`${endpoint}?${new URLSearchParams({ url })}`, { credentials: 'omit', signal: AbortSignal.timeout(16000) });
        if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
          const result = await response.json() as Result;
          if (result.ok && result.preview) return result.preview;
          if (result.ok && result.html && result.url) return parseLinkPreview(result.html, result.url);
          if (result.restricted) return { title: '', description: '', image: '', restricted: true };
        }
      } catch { /* Try sites which permit a direct browser fetch. */ }
    }
    const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(8000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return null;
    return parseLinkPreview((await response.text()).slice(0, 2_000_000), response.url || url);
  })().catch(() => null).then(result => { if (!result || result.restricted || result.needsPermission) previews.delete(url); return result; });
  if (previews.size > 200) previews.delete(previews.keys().next().value!);
  previews.set(url, { task, expires: Date.now() + 5 * 60_000 });
  return task;
}

export function clearLinkPreviewCache() { previews.clear(); }
