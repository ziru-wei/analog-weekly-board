import type { BoardDocument } from '../model';

// Photos are inline data URLs locally. In the cloud they become `asset:<sha256>` references to separate files.
export const ASSET_PREFIX = 'asset:';
export async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
async function mapImages(doc: BoardDocument, fn: (src: string) => Promise<string>): Promise<BoardDocument> {
  const items = { ...doc.items };
  for (const [id, item] of Object.entries(doc.items)) {
    if (item.data.type !== 'image') continue;
    const src = await fn(item.data.src);
    if (src !== item.data.src) items[id] = { ...item, data: { ...item.data, src } };
  }
  return { ...doc, items };
}
/** Replace inline photos with asset references; `out` collects hash → data URL for upload. */
export const externalize = (doc: BoardDocument, out: Map<string, string>) => mapImages(doc, async src => {
  if (!src.startsWith('data:')) return src;
  const hash = await sha256(src); out.set(hash, src); return ASSET_PREFIX + hash;
});
/** Put photos back inline. `load` fetches an asset by hash (cached by the caller). */
export const internalize = (doc: BoardDocument, load: (hash: string) => Promise<string | undefined>) => mapImages(doc, async src => {
  if (!src.startsWith(ASSET_PREFIX)) return src;
  return (await load(src.slice(ASSET_PREFIX.length))) ?? '';
});
