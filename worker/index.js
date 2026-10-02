// Stateless OAuth helper for the browser extensions. It holds the Google client secret so the extension doesn't have to:
//   POST /token    { code, code_verifier, redirect_uri }  ->  { access_token, expires_in, refresh_token }
//   POST /refresh  { refresh_token }                      ->  { access_token, expires_in }
// Nothing is stored; refresh tokens live only in the user's own browser.
import { fetchLinkPreview } from './link-preview.js';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Only extension redirect URLs may be exchanged (Chrome: *.chromiumapp.org; Firefox: *.extensions.allizom.org, or the
// http://127.0.0.1/mozoauth2/<hash> form that current Firefox versions return from identity.getRedirectURL()).
const REDIRECT_OK = /^(https:\/\/[a-z0-9]+\.(chromiumapp\.org|extensions\.allizom\.org)\/|http:\/\/127\.0\.0\.1\/mozoauth2\/[a-f0-9]{40})$/;
const ORIGIN_OK = /^(chrome-extension|moz-extension):\/\/[a-z0-9-]+$/;

const cors = origin => ({
  'Access-Control-Allow-Origin': origin && ORIGIN_OK.test(origin) ? origin : 'null',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});
const json = (body, status, origin) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });

const fingerprint = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).slice(0, 4), b => b.toString(16).padStart(2, '0')).join('');

async function google(params, env) {
  if (!(env.GOOGLE_CLIENT_ID ?? '').trim() || !(env.GOOGLE_CLIENT_SECRET ?? '').trim()) {
    console.error('worker misconfigured: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set');
    return { status: 500, data: { error: 'server_misconfigured', error_description: 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set on the worker' } };
  }
  // Secrets pasted into dashboards/terminals often carry a stray newline or space, which Google rejects.
  const clientId = (env.GOOGLE_CLIENT_ID ?? '').trim(), clientSecret = (env.GOOGLE_CLIENT_SECRET ?? '').trim();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status !== 200) {
    // Visible with `wrangler tail`. The fingerprint is the first 4 bytes of SHA-256 of the secret: it can be compared with
    // `printf %s "$SECRET" | shasum -a 256 | cut -c1-8` but cannot reveal the secret.
    console.error('google token endpoint:', response.status, data.error, data.error_description, JSON.stringify({
      client_id: clientId, secret_length: clientSecret.length, raw_length: (env.GOOGLE_CLIENT_SECRET ?? '').length,
      secret_prefix_ok: clientSecret.startsWith('GOCSPX-'), secret_fp: await fingerprint(clientSecret),
    }));
  }
  return { status: response.status, data };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    if (new URL(request.url).pathname === '/api/link-preview') {
      const allowed = (env.PREVIEW_ORIGINS ?? 'https://ziru-wei.github.io').split(',').map(value => value.trim());
      const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'no-store' };
      if (!allowed.includes(origin) && !ORIGIN_OK.test(origin)) return new Response(null, { status: 403 });
      if (request.method !== 'GET') return new Response(null, { status: 405, headers });
      return new Response(JSON.stringify(await fetchLinkPreview(new URL(request.url).searchParams.get('url') ?? '')), { headers });
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    // Configuration check: lists binding NAMES only (never values) so a missing secret is easy to spot.
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, bindings: Object.keys(env).sort(), has_client_id: !!env.GOOGLE_CLIENT_ID, has_client_secret: !!(env.GOOGLE_CLIENT_SECRET ?? '').trim() }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);
    if (!ORIGIN_OK.test(origin)) return json({ error: 'forbidden_origin' }, 403, origin);
    const path = new URL(request.url).pathname;
    let body;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400, origin); }

    if (path === '/token') {
      const { code, code_verifier, redirect_uri } = body;
      if (!code || !code_verifier || !REDIRECT_OK.test(redirect_uri ?? '')) return json({ error: 'invalid_request' }, 400, origin);
      const { status, data } = await google({ grant_type: 'authorization_code', code, code_verifier, redirect_uri }, env);
      if (status !== 200) return json({ error: data.error ?? 'token_exchange_failed', error_description: data.error_description }, status === 400 ? 400 : 502, origin);
      return json({ access_token: data.access_token, expires_in: data.expires_in, refresh_token: data.refresh_token }, 200, origin);
    }
    if (path === '/refresh') {
      if (!body.refresh_token) return json({ error: 'invalid_request' }, 400, origin);
      const { status, data } = await google({ grant_type: 'refresh_token', refresh_token: body.refresh_token }, env);
      if (status !== 200) return json({ error: data.error ?? 'refresh_failed', error_description: data.error_description }, status === 400 ? 400 : 502, origin);
      return json({ access_token: data.access_token, expires_in: data.expires_in }, 200, origin);
    }
    return json({ error: 'not_found' }, 404, origin);
  },
};
