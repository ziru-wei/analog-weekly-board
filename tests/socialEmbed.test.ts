import { expect, test } from 'vitest';
import { socialPost, websiteCardSize, toggleWebsiteCard } from '../src/socialEmbed';
import { publicWebUrl } from '../src/linkPreview';

test('canonical embeds only allow supported post paths and discard tracking', () => {
  expect(socialPost('https://www.instagram.com/p/Cabc_123/?igsh=test')?.src).toBe('https://www.instagram.com/p/Cabc_123/embed/captioned/');
  expect(socialPost('https://x.com/nasa/status/123456/photo/1?s=20')?.src).toBe('https://platform.twitter.com/embed/Tweet.html?id=123456&dnt=true&theme=light');
  expect(socialPost('https://twitter.com/i/web/status/123456')?.id).toBe('123456');
  for (const url of ['https://instagram.com.evil.test/p/a/', 'https://x.com/user', 'https://x.com/user/status/not-a-number', 'https://evil.test/?url=https://x.com/user/status/123', 'javascript:alert(1)', 'https://x.com:444/user/status/123']) expect(socialPost(url)).toBeNull();
});
test('Xiaohongshu keeps the share credential needed to open the note', () => {
  const note = socialPost('https://www.xiaohongshu.com/explore/67b72e69000000002903fdb4?xsec_token=a%2Bb%3D&xsec_source=app_share&tracking=discard');
  expect(note?.provider).toBe('xiaohongshu');
  const url = new URL(note!.src);
  expect(url.searchParams.get('xsec_token')).toBe('a+b=');
  expect(url.searchParams.has('tracking')).toBe(false);
});
test('legacy and new website cards have room for their content', () => {
  expect(websiteCardSize('https://youtu.be/M7lc1UVf-VE', 300, 76)).toEqual({ width: 400, height: 297 });
  expect(websiteCardSize('https://x.com/nasa/status/123')).toEqual({ width: 300, height: 360 });
  expect(websiteCardSize('https://www.sony.com/')).toEqual({ width: 300, height: 220 });
});
test('preview images accept relative HTTP URLs, not executable or credentialed URLs', () => {
  expect(publicWebUrl('../cover.jpg', 'https://example.com/story/page/')).toBe('https://example.com/story/cover.jpg');
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,test', 'file:///etc/passwd', 'https://user:password@example.com/']) expect(publicWebUrl(url)).toBeNull();
});

test('compact presentation survives display normalization and restores the expanded size', () => {
  const item = { id: 'link', type: 'website' as const, x: 50, y: 60, width: 450, height: 380, rotation: 0, zIndex: 1, pins: [], data: { type: 'website' as const, url: 'https://www.sony.com/', title: 'Design', domain: 'sony.com', description: '' } };
  const compact = { ...item, ...toggleWebsiteCard(item)! };
  expect(compact.width).toBe(320);
  expect(compact.height).toBe(96);
  const restored = { ...compact, ...toggleWebsiteCard(compact)! };
  expect(restored.width).toBe(450);
  expect(restored.height).toBe(380);
  expect(restored.data.compact).toBe(false);
  expect(restored.x).toBe(50);
});
