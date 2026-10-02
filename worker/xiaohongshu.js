export const XHS_MOBILE_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

export function xiaohongshuMetadataUrl(url) {
  if (!['https:', 'http:'].includes(url.protocol) || url.port || url.username || url.password) return null;
  if (!['xiaohongshu.com', 'www.xiaohongshu.com', 'm.xiaohongshu.com'].includes(url.hostname)) return null;
  const id = /^\/(?:explore|discovery\/item)\/([a-f\d]{24})\/?$/i.exec(url.pathname)?.[1];
  if (!id) return null;
  const mobile = new URL(`https://www.xiaohongshu.com/discovery/item/${id}`);
  for (const key of ['xsec_token', 'xsec_source']) { const value = url.searchParams.get(key); if (value) mobile.searchParams.set(key, value); }
  return mobile;
}

function xhsMediaUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
      !['xhscdn.com', 'xiaohongshu.com'].some(domain => url.hostname.endsWith(`.${domain}`))) return '';
    url.protocol = 'https:'; return url.href;
  } catch { return ''; }
}

/** Read JSON-shaped page state without executing JavaScript, including its undefined values. */
export function parseXiaohongshuPreview(html, url) {
  let mobile; try { mobile = xiaohongshuMetadataUrl(new URL(url)); } catch { return null; }
  if (!mobile) return null;
  const source = /(?:window\.)?__INITIAL_STATE__\s*=\s*(\{[\s\S]*?)<\/script>/i.exec(html)?.[1];
  if (!source) return null;
  try {
    const json = source.trim().replace(/;\s*$/, '').replace(/"(?:\\.|[^"\\])*"|\bundefined\b/g, token => token === 'undefined' ? 'null' : token);
    const state = JSON.parse(json);
    const id = mobile.pathname.split('/').pop();
    const note = state.noteData?.data?.noteData ?? state.note?.noteDetailMap?.[id]?.note;
    if (!note || note.noteId && note.noteId !== id || typeof note.title !== 'string') return null;
    const images = (Array.isArray(note.imageList) ? note.imageList : []).slice(0, 20).map(image => {
      const info = Array.isArray(image?.infoList) ? image.infoList : [];
      return xhsMediaUrl(image?.urlDefault || image?.url || info.find(entry => ['H5_DTL', 'WB_DFT'].includes(entry?.imageScene))?.url || info[0]?.url);
    }).filter(Boolean);
    let mediaV2; try { mediaV2 = JSON.parse(note.video?.mediaV2 ?? '{}') ?? {}; } catch { mediaV2 = {}; }
    const streams = [note.video?.media?.stream?.h264, mediaV2.stream?.h264].flatMap(value => Array.isArray(value) ? value : []);
    const stream = streams.find(video => xhsMediaUrl(video?.masterUrl || video?.master_url));
    const validDimensions = video => Number.isFinite(video?.width) && video.width > 0 && Number.isFinite(video?.height) && video.height > 0;
    const dimensions = validDimensions(stream) ? stream : validDimensions(mediaV2.video) ? mediaV2.video : { width: 9, height: 16 };
    let { width, height } = dimensions;
    if ((validDimensions(stream) || validDimensions(mediaV2.video)) && Math.abs(stream?.rotate ?? 0) % 180 === 90) [width, height] = [height, width];
    const video = stream ? { url: xhsMediaUrl(stream.masterUrl || stream.master_url), width, height } : undefined;
    return { title: note.title.trim().slice(0, 500), description: typeof note.desc === 'string' ? note.desc.slice(0, 10000) : '', image: images[0] ?? '', media: { images, ...(video ? { video } : {}) } };
  } catch { return null; }
}
