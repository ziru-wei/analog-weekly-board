# Auth worker (Cloudflare Workers)

Exchanges Google OAuth codes for tokens and refreshes access tokens, so the extension never holds the client secret.

```sh
cd worker
npx wrangler login
# put your client id in wrangler.toml, then:
npx wrangler secret put GOOGLE_CLIENT_SECRET     # paste the secret when prompted
npx wrangler deploy                              # prints https://analog-weekly-board-auth.<you>.workers.dev
```

Put that URL in the app's `.env.local` as `VITE_AUTH_WORKER_URL` and rebuild the extensions.
Only requests from `chrome-extension://` / `moz-extension://` origins with extension redirect URIs are accepted.
