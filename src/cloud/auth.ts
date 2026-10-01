import { AUTH_WORKER_URL, GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from './config';
import { readKv, writeKv } from '../storage';

// Google Identity Services token flow (browser only, no backend). Tokens last ~1h and live in memory.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const google: any;
export interface GoogleUser { name: string; email: string; picture?: string }

let scriptPromise: Promise<void> | null = null;
function loadScript() {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    if (typeof google !== 'undefined' && google.accounts?.oauth2) return resolve();
    const script = window.document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onload = () => resolve(); script.onerror = () => { scriptPromise = null; reject(new Error('Could not load Google sign-in. Check your connection.')); };
    window.document.head.appendChild(script);
  });
  return scriptPromise;
}

let token: { value: string; expiresAt: number } | null = null;
export const hasValidToken = () => !!token && token.expiresAt - Date.now() > 60_000;
export const accessToken = () => token?.value ?? '';
/** Forget the in-memory access token (e.g. after a 401) so the next request renews it. */
export const invalidateToken = () => { token = null; };
/** True when sign-in can renew itself in the background (extension + deployed worker => refresh tokens). */
export const hasRefreshFlow = () => isExtension() && !!AUTH_WORKER_URL;
const REFRESH_KEY = 'cloud-refresh-token';

// Inside a Chrome/Firefox extension the page's origin is chrome-extension://…, which Google Identity Services rejects.
// There we run the OAuth implicit flow ourselves through the WebExtension `identity` API (works in both browsers).
const extensionApi = (): any => (globalThis as any).browser?.identity ? (globalThis as any).browser : (globalThis as any).chrome?.identity ? (globalThis as any).chrome : null;
export const isExtension = () => !!extensionApi()?.runtime?.id;
/** The redirect URI that must be registered on the Google OAuth client (shown in the Dashboard while setting up). */
export const redirectUrl = () => {
  if (!isExtension()) return window.location.origin;

  const raw = extensionApi().identity.getRedirectURL();
  const url = new URL(raw);

  if (url.hostname.endsWith('.extensions.allizom.org')) {
    const subdomain = url.hostname.split('.')[0];
    return `http://127.0.0.1/mozoauth2/${subdomain}`;
  }

  return raw;
};
async function requestTokenInExtension(interactive: boolean): Promise<string> {
  const api = extensionApi();
  const params = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, response_type: 'token', redirect_uri: redirectUrl(), scope: GOOGLE_SCOPES, prompt: interactive ? 'select_account' : 'none', include_granted_scopes: 'true' });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  if (interactive) console.info('[sync] Google sign-in URL (open it in a normal tab to read Google\'s own error message):', authUrl);
  let redirected: string | undefined;
  try { redirected = await api.identity.launchWebAuthFlow({ url: authUrl, interactive }); }
  catch (error) { throw new Error(interactive ? `Sign-in was cancelled or blocked (${(error as Error).message}). If the Google page showed a redirect_uri_mismatch error, add exactly this URI to the OAuth client: ${api.identity.getRedirectURL()}` : `interaction_required: ${(error as Error).message}`); }
  const hash = new URLSearchParams((redirected ?? '').split('#')[1] ?? '');
  if (hash.get('error')) throw new Error(`${hash.get('error')}${hash.get('error_description') ? `: ${hash.get('error_description')}` : ''}`);
  const value = hash.get('access_token'); if (!value) throw new Error('interaction_required: Google did not return a token.');
  token = { value, expiresAt: Date.now() + Number(hash.get('expires_in') ?? 3600) * 1000 };
  return value;
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function pkcePair() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}
async function worker(path: string, body: unknown) {
  let response: Response;
  try { response = await fetch(`${AUTH_WORKER_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw new Error('Could not reach the sign-in service. Check your connection.'); } // transient: not an auth failure
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 400 ? `interaction_required: ${data.error ?? 'invalid_grant'}` : `Sign-in service error (${response.status}).`);
  return data;
}
const useToken = (data: { access_token: string; expires_in: number }) => { token = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in) * 1000 }; return token.value; };

// Authorization-code flow with PKCE: the worker swaps the code for a refresh token the browser keeps, then renews access silently.
async function signInWithCode(): Promise<string> {
  const api = extensionApi(), { verifier, challenge } = await pkcePair(), redirect = api.identity.getRedirectURL();
  const params = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, response_type: 'code', redirect_uri: redirect, scope: GOOGLE_SCOPES, access_type: 'offline', prompt: 'consent select_account', code_challenge: challenge, code_challenge_method: 'S256' });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  console.info('[sync] Google sign-in URL (open it in a normal tab to read Google\'s own error message):', authUrl);
  let redirected: string | undefined;
  try { redirected = await api.identity.launchWebAuthFlow({ url: authUrl, interactive: true }); }
  catch (error) { throw new Error(`Sign-in was cancelled or blocked (${(error as Error).message}). If the Google page showed a redirect_uri_mismatch error, add exactly this URI to the OAuth client: ${redirect}`); }
  const query = new URL(redirected ?? '').searchParams;
  if (query.get('error')) throw new Error(`${query.get('error')}${query.get('error_description') ? `: ${query.get('error_description')}` : ''}`);
  const code = query.get('code'); if (!code) throw new Error('Google did not return an authorization code.');
  const data = await worker('/token', { code, code_verifier: verifier, redirect_uri: redirect });
  if (!data.refresh_token) throw new Error('Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and sign in again.');
  await writeKv(REFRESH_KEY, data.refresh_token);
  return useToken(data);
}
async function refreshAccess(): Promise<string> {
  const refresh = await readKv<string>(REFRESH_KEY);
  if (!refresh) throw new Error('interaction_required: no refresh token');
  try { return useToken(await worker('/refresh', { refresh_token: refresh })); }
  catch (error) { if (/interaction_required/.test((error as Error).message)) await writeKv(REFRESH_KEY, null); throw error; } // revoked or expired
}

/** `interactive` opens the Google sign-in; otherwise it only succeeds if the user already granted access (silent). */
export async function requestToken(interactive: boolean): Promise<string> {
  if (hasRefreshFlow()) return interactive ? signInWithCode() : refreshAccess();
  if (isExtension()) return requestTokenInExtension(interactive);
  if (__EXTENSION_BUILD__) throw new Error('Google sign-in is unavailable here.');
  await loadScript();
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID, scope: GOOGLE_SCOPES,
      callback: (response: any) => {
        if (response.error) return reject(new Error(response.error_description || response.error));
        token = { value: response.access_token, expiresAt: Date.now() + Number(response.expires_in) * 1000 };
        resolve(token.value);
      },
      error_callback: (error: any) => reject(new Error(error?.type === 'popup_closed' ? 'Sign-in was cancelled.' : error?.message || error?.type || 'Sign-in failed.')),
    });
    client.requestAccessToken({ prompt: interactive ? 'select_account' : 'none' });
  });
}
export async function fetchUser(): Promise<GoogleUser> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken()}` } });
  if (!response.ok) throw new Error('Could not read your Google profile.');
  const u = await response.json();
  return { name: u.name ?? u.email, email: u.email, picture: u.picture };
}
export function revoke() {
  const value = token?.value; token = null;
  if (hasRefreshFlow()) { void readKv<string>(REFRESH_KEY).then(refresh => { if (refresh) void fetch(`https://oauth2.googleapis.com/revoke?token=${refresh}`, { method: 'POST' }).catch(() => {}); void writeKv(REFRESH_KEY, null); }); return; }
  if (!value) return;
  if (isExtension()) void fetch(`https://oauth2.googleapis.com/revoke?token=${value}`, { method: 'POST' }).catch(() => {});
  else if (typeof google !== 'undefined') google.accounts.oauth2.revoke(value, () => {});
}
