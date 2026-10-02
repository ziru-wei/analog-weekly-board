export interface XiaohongshuMedia { images: string[]; video?: { url: string; width: number; height: number } }
export interface XiaohongshuPreview { title: string; description: string; image: string; media: XiaohongshuMedia }
export const XHS_MOBILE_AGENT: string;
export function xiaohongshuMetadataUrl(url: URL): URL | null;
export function parseXiaohongshuPreview(html: string, url: string): XiaohongshuPreview | null;
