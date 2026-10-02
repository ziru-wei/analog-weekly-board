import { XHS_MOBILE_AGENT, xiaohongshuMetadataUrl, parseXiaohongshuPreview } from './xiaohongshu.js';
const MAX_BYTES = 2_000_000;

export function previewUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
      !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return null;
    return url;
  } catch { return null; }
}

async function readText(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty response');
  const decoder = new TextDecoder(); let text = '', size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Page too large'); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export function bilibiliMetadataUrl(url) {
  let bvid = '', aid = '';
  if (['www.bilibili.com', 'bilibili.com', 'm.bilibili.com'].includes(url.hostname)) {
    const id = /^\/video\/(BV[\dA-Za-z]{10}|av[1-9]\d{0,15})\/?$/.exec(url.pathname)?.[1] ?? '';
    if (id.startsWith('BV')) bvid = id; else if (id) aid = id.slice(2);
  } else if (url.hostname === 'player.bilibili.com' && url.pathname === '/player.html') {
    bvid = url.searchParams.get('bvid') ?? ''; aid = url.searchParams.get('aid') ?? '';
  }
  const api = new URL('https://api.bilibili.com/x/web-interface/view');
  if (/^BV[\dA-Za-z]{10}$/.test(bvid)) api.searchParams.set('bvid', bvid);
  else if (/^[1-9]\d{0,15}$/.test(aid)) api.searchParams.set('aid', aid);
  else return null;
  return api.href;
}

/** Public page metadata only; no cookies, remote scripts, or remote document mounting. */
export async function fetchLinkPreview(value, validateAddress = async () => {}) {
  let url = previewUrl(value);
  if (!url) return { ok: false };
  try {
    const api = bilibiliMetadataUrl(url);
    if (api) {
      try {
        const response = await fetch(api, { credentials: 'omit', signal: AbortSignal.timeout(6000), redirect: 'error' });
        if (response.ok) {
          const result = JSON.parse(await readText(response));
          if (result.code === 0 && typeof result.data?.title === 'string' && result.data.title.trim()) {
            const { title, desc, pic } = result.data;
            const image = typeof pic === 'string' ? previewUrl(pic.replace(/^http:/, 'https:'))?.href ?? '' : '';
            return { ok: true, preview: { title: title.slice(0, 500), description: typeof desc === 'string' ? desc.slice(0, 700) : '', image } };
          }
        }
      } catch { /* Fall back to the public video page. */ }
      const id = new URL(api).searchParams;
      url = new URL(`https://www.bilibili.com/video/${id.get('bvid') ?? `av${id.get('aid')}`}/`);
    }
    url = xiaohongshuMetadataUrl(url) ?? url;
    const signal = AbortSignal.timeout(8000);
    for (let redirects = 0; redirects < 5; redirects++) {
      await validateAddress(url.hostname);
      const xhs = xiaohongshuMetadataUrl(url);
      const response = await fetch(url.href, { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'manual', signal, ...(xhs || url.hostname.endsWith('xhslink.com') ? { headers: { 'User-Agent': XHS_MOBILE_AGENT } } : {}) });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        url = location ? previewUrl(new URL(location, url).href) : null;
        if (!url) return { ok: false };
        if (/\/(?:login|signin|accounts)(?:\/|$)/i.test(url.pathname)) return { ok: false, restricted: true };
        url = xiaohongshuMetadataUrl(url) ?? url;
        continue;
      }
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) { await response.body?.cancel(); return { ok: false }; }
      const html = await readText(response);
      const preview = xhs ? parseXiaohongshuPreview(html, url.href) : null;
      return preview ? { ok: true, preview } : { ok: true, html, url: url.href };
    }
  } catch { /* A blocked or unavailable page still keeps its original link. */ }
  return { ok: false };
}
