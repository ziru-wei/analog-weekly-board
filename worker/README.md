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

The same worker serves `GET /api/link-preview?url=…` for website metadata, Bilibili video titles/covers, and Xiaohongshu note titles/text/media. Xiaohongshu share links retain their share tokens; the parser handles public mobile and desktop note state without executing page scripts. Video dimensions come from each note, with a 9:16 fallback when absent. This route accepts the web origin `https://ziru-wei.github.io` by default; set `PREVIEW_ORIGINS` to a comma-separated list to support another deployed web origin. OAuth routes remain extension-only. Requests omit cookies, bound response sizes, and reject private destinations and redirects to sign-in pages.

Deploy the updated worker to enable previews on the hosted web app. Set `VITE_PREVIEW_WORKER_URL` to use a separate worker, or keep `VITE_AUTH_WORKER_URL` to use this one. `npm run dev` and `npm run preview` provide the same preview endpoint locally without deploying.
