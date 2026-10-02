export interface BilibiliVideo {
  kind: 'bvid' | 'aid';
  id: string;
  page: number;
  start: number;
  cid?: string;
}

const bvId = /^BV[\dA-Za-z]{10}$/;
const numericId = /^[1-9]\d{0,15}$/;

/** Accept canonical video and official player URLs, never arbitrary iframe URLs. */
export function bilibiliVideo(value: string): BilibiliVideo | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    let kind: BilibiliVideo['kind'], id: string;
    if (['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(url.hostname)) {
      const match = /^\/video\/(BV[\dA-Za-z]{10}|av[1-9]\d{0,15})\/?$/.exec(url.pathname);
      if (!match) return null;
      kind = match[1].startsWith('BV') ? 'bvid' : 'aid';
      id = kind === 'bvid' ? match[1] : match[1].slice(2);
    } else if (url.hostname === 'player.bilibili.com' && url.pathname === '/player.html') {
      const bv = url.searchParams.get('bvid') ?? '', aid = url.searchParams.get('aid') ?? '';
      if (bvId.test(bv)) { kind = 'bvid'; id = bv; }
      else if (numericId.test(aid)) { kind = 'aid'; id = aid; }
      else return null;
    } else return null;
    const page = Number(url.searchParams.get('p') ?? url.searchParams.get('page') ?? 1);
    const start = Number(url.searchParams.get('t') ?? 0);
    const cid = url.searchParams.get('cid') ?? '';
    return {
      kind, id,
      page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 2147483647) : 1,
      start: Number.isFinite(start) && start >= 0 ? Math.min(start, 2147483647) : 0,
      ...(numericId.test(cid) ? { cid } : {}),
    };
  } catch { return null; }
}

export function bilibiliEmbedUrl(video: BilibiliVideo) {
  const url = new URL('https://player.bilibili.com/player.html');
  url.searchParams.set(video.kind, video.id);
  url.searchParams.set('p', String(video.page));
  if (video.cid) url.searchParams.set('cid', video.cid);
  if (video.start) url.searchParams.set('t', String(video.start));
  url.searchParams.set('autoplay', '0');
  url.searchParams.set('poster', '1');
  return url.href;
}
