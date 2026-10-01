// Stateless OAuth helper for the browser extensions. It holds the Google client secret so the extension doesn't have to:
//   POST /token    { code, code_verifier, redirect_uri }  ->  { access_token, expires_in, refresh_token }
//   POST /refresh  { refresh_token }                      ->  { access_token, expires_in }
// Nothing is stored; refresh tokens live only in the user's own browser.
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Only extension redirect URLs may be exchanged (Chrome: *.chromiumapp.org, Firefox: *.extensions.allizom.org).
const REDIRECT_OK = /^https:\/\/[a-z0-9]+\.(chromiumapp\.org|extensions\.allizom\.org)\/$/;
const ORIGIN_OK = /^(chrome-extension|moz-extension):\/\/[a-z0-9-]+$/;

const cors = origin => ({
  'Access-Control-Allow-Origin': origin && ORIGIN_OK.test(origin) ? origin : 'null',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});
const json = (body, status, origin) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });

async function google(params, env) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
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
