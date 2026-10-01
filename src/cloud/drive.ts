import { accessToken } from './auth';

// Minimal Google Drive v3 client over the hidden `appDataFolder`.
export interface DriveFile { id: string; name: string; modifiedTime: string }
const API = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export class DriveAuthError extends Error {}
async function call(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken()}`, ...init.headers } });
  if (response.status === 401) throw new DriveAuthError('Google session expired.');
  if (!response.ok) throw new Error(`Google Drive error ${response.status}: ${(await response.text()).slice(0, 160)}`);
  return response;
}
export async function listFiles(): Promise<DriveFile[]> {
  const files: DriveFile[] = []; let pageToken = '';
  do {
    const params = new URLSearchParams({ spaces: 'appDataFolder', pageSize: '1000', fields: 'nextPageToken, files(id,name,modifiedTime)' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await (await call(`${API}/files?${params}`)).json();
    files.push(...data.files); pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  return files;
}
export async function readJson<T>(id: string): Promise<T> { return (await call(`${API}/files/${id}?alt=media`)).json(); }
export async function writeJson(name: string, value: unknown, existingId?: string) {
  const body = JSON.stringify(value);
  if (existingId) return call(`${UPLOAD}/files/${existingId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
  const boundary = 'awb' + Math.random().toString(36).slice(2);
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  return call(`${UPLOAD}/files?uploadType=multipart`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
}

export async function remove(id: string) { await call(`${API}/files/${id}`, { method: 'DELETE' }); }

// Photos live in their own files (not inside the board JSON) so a board sync stays small.
const dataUrlToBlob = (dataUrl: string) => { const [head, body] = dataUrl.split(','); const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream'; const bin = atob(body); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new Blob([bytes], { type: mime }); };
export async function writeAsset(name: string, dataUrl: string, existingId?: string) {
  const blob = dataUrlToBlob(dataUrl);
  if (existingId) return call(`${UPLOAD}/files/${existingId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': blob.type }, body: blob });
  const boundary = 'awb' + Math.random().toString(36).slice(2);
  const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: ['appDataFolder'] })}\r\n--${boundary}\r\nContent-Type: ${blob.type}\r\n\r\n`, blob, `\r\n--${boundary}--`]);
  return call(`${UPLOAD}/files?uploadType=multipart`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
}
export async function readAsset(id: string): Promise<string> {
  const blob = await (await call(`${API}/files/${id}?alt=media`)).blob();
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
}
