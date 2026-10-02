import { youtubeVideo, videoCardSize } from './youtube';
import type { BoardItem } from './model';

export interface SocialPost { provider: 'instagram' | 'x' | 'xiaohongshu'; label: string; id: string; src: string }
export function socialPost(value: string): SocialPost | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'instagram.com') {
      const match = /^\/(p|reel|tv)\/([\w-]+)\/?$/.exec(url.pathname);
      if (match) return { provider: 'instagram', label: 'Instagram', id: match[2], src: `https://www.instagram.com/${match[1]}/${match[2]}/embed/captioned/` };
    }
    if (['x.com', 'twitter.com', 'mobile.twitter.com', 'mobile.x.com'].includes(host)) {
      const match = /^\/(?:[\w]+\/status|i\/web\/status)\/(\d+)(?:\/(?:photo|video)\/\d+)?\/?$/.exec(url.pathname);
      if (match) return { provider: 'x', label: 'X', id: match[1], src: `https://platform.twitter.com/embed/Tweet.html?id=${match[1]}&dnt=true&theme=light` };
    }
    if (host === 'xiaohongshu.com') {
      const match = /^\/(?:explore|discovery\/item)\/([a-f\d]{24})\/?$/i.exec(url.pathname);
      if (match) {
        const src = new URL(`https://www.xiaohongshu.com/explore/${match[1]}`);
        // The share token is required to open some public notes. Never drop it.
        for (const key of ['xsec_token', 'xsec_source']) { const value = url.searchParams.get(key); if (value) src.searchParams.set(key, value); }
        return { provider: 'xiaohongshu', label: '小红书', id: match[1], src: src.href };
      }
    }
    return null;
  } catch { return null; }
}

export function websiteCardSize(url: string, width?: number, height = 0) {
  if (youtubeVideo(url)) return videoCardSize(width ?? 400, height);
  if (socialPost(url)) return { width: width ?? 300, height: height || 360 };
  return { width: width ?? 300, height: height || 220 };
}

export function isCompactWebsiteCard(width: number, height: number) {
  return width < 180 || height < 150;
}

export function toggleWebsiteCard(item: BoardItem) {
  if (item.data.type !== 'website') return null;
  const data = item.data;
  if (isCompactWebsiteCard(item.width, item.height)) {
    const size = data.expandedSize ?? websiteCardSize(data.url);
    const { expandedSize: _saved, ...rest } = data;
    return { ...size, data: { ...rest, compact: false } };
  }
  return { width: 320, height: 96, data: { ...data, compact: true, expandedSize: { width: item.width, height: item.height } } };
}
