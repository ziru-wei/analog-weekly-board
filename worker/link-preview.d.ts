export interface PreviewResult {
  ok: boolean; html?: string; url?: string; restricted?: boolean;
  preview?: { title: string; description: string; image: string; media?: import('./xiaohongshu.js').XiaohongshuMedia };
}
export function previewUrl(value: string): URL | null;
export function bilibiliMetadataUrl(url: URL): string | null;
export function fetchLinkPreview(value: string, validateAddress?: (hostname: string) => Promise<void>): Promise<PreviewResult>;
