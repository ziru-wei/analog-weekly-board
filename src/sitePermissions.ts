type ExtensionApi = {
  runtime?: { id?: string };
  permissions?: { contains(value: { origins: string[] }): Promise<boolean>; request(value: { origins: string[] }): Promise<boolean> };
};
export const YOUTUBE_ORIGINS = ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*'];
export function extensionApi() {
  const scope = globalThis as typeof globalThis & { browser?: ExtensionApi; chrome?: ExtensionApi };
  return scope.browser ?? scope.chrome;
}
/** Must be called directly from a click: Firefox requires a user gesture for new host grants. */
export async function requestSiteAccess(origins: string[]) {
  const api = extensionApi();
  if (!api?.runtime?.id || !api.permissions) return false;
  const granted = await api.permissions.request({ origins });
  if (granted) window.dispatchEvent(new Event('site-permissions-changed'));
  return granted;
}
export class SitePermissionError extends Error {}
