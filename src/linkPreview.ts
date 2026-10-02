export interface LinkPreview { title: string; description: string; image: string; restricted?: boolean; needsPermission?: boolean }

export function publicWebUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

/** Extract text and image URLs only. The remote document is never mounted or executed. */
export function parseLinkPreview(html: string, url: string): LinkPreview {
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

const previews = new Map<string, Promise<LinkPreview | null>>();
export function loadLinkPreview(url: string): Promise<LinkPreview | null> {
  if (!publicWebUrl(url)) return Promise.resolve(null);
  const cached = previews.get(url); if (cached) return cached;
  const task = (async () => {
    type Runtime = { id?: string; sendMessage(message: unknown): Promise<{ ok: boolean; html?: string; url?: string; restricted?: boolean; needsPermission?: boolean }> };
    const scope = globalThis as typeof globalThis & { browser?: { runtime?: Runtime }; chrome?: { runtime?: Runtime } };
    const runtime = scope.browser?.runtime ?? scope.chrome?.runtime;
    if (runtime?.id) {
      const response = await runtime.sendMessage({ type: 'link-preview', url });
      if (!response?.ok || !response.html || !response.url) return response?.needsPermission ? { title: '', description: '', image: '', needsPermission: true } : response?.restricted ? { title: '', description: '', image: '', restricted: true } : null;
      return parseLinkPreview(response.html, response.url);
    }
    const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(8000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return null;
    return parseLinkPreview((await response.text()).slice(0, 2_000_000), response.url);
  })().catch(() => null);
  if (previews.size > 200) previews.delete(previews.keys().next().value!);
  previews.set(url, task);
  return task;
}

export function clearLinkPreviewCache() { previews.clear(); }
