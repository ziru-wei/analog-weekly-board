import { publicWebUrl } from './linkPreview';

/** Accept complete URLs and the text produced by Xiaohongshu's Copy Link action. */
export function websitePaste(text: string): { url: string; title?: string } | null {
  text = text.trim();
  if (!/\s/.test(text)) {
    const url = publicWebUrl(text);
    if (url) return { url };
  }
  const match = /https?:\/\/(?:www\.)?(?:xhslink\.com|xiaohongshu\.com)\/[^\s<>"'，。\]\[()（）]+/i.exec(text);
  if (!match) return null;
  const url = publicWebUrl(match[0].replace(/[)）.,;；]+$/, ''));
  if (!url) return null;
  const prefix = text.slice(0, match.index).trim();
  const title = prefix.split('\n')[0]?.replace(/^\d+(?:\.\d+)?\s+/, '').replace(/^\[$/, '').trim().slice(0, 300);
  return { url, ...(title ? { title } : {}) };
}
