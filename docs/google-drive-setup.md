# Google Drive sync — setup (Chrome + Firefox extensions)

Data lives in the hidden **appDataFolder** of each user's own Drive (scope `drive.appdata`): the app can't see any
other Drive file, and this non-sensitive scope needs no Google security review. Every user signs in with their own
Google account; nothing is shared between users.

## What you need to provide
1. A Google Cloud project with the **Google Drive API** enabled.
2. An **OAuth consent screen** (External). Scopes: `.../auth/drive.appdata`, `openid`, `email`, `profile`.
   While in *Testing*, add accounts under *Test users*; switch to *In production* to let anyone sign in.
3. One **OAuth client ID of type "Web application"** (works for both browsers via `identity.launchWebAuthFlow`).
   Under **Authorized redirect URIs** add the extension redirect URLs:
   - Chrome: `https://<chrome-extension-id>.chromiumapp.org/`
   - Firefox: the URL printed by `browser.identity.getRedirectURL()` (`https://<hash>.extensions.allizom.org/`)
   The Dashboard prints the exact redirect URL for the browser you're in while sync isn't configured yet.
   Pin Chrome's extension ID by adding a `key` to the manifest (or publish once) so the URL stays stable.
4. Put the client ID in `.env.local` (see `.env.example`) and rebuild.

## Build & load
```
npm run build:ext          # dist-ext/chrome and dist-ext/firefox (or build:chrome / build:firefox)
```
- Chrome: `chrome://extensions` → Developer mode → *Load unpacked* → `dist-ext/chrome`.
- Firefox: `about:debugging` → *This Firefox* → *Load Temporary Add-on* → `dist-ext/firefox/manifest.json`.
  (Set `browser_specific_settings.gecko.id` in `scripts/build-extension.mjs` to your own id before publishing.)
The toolbar button opens the board in its own tab. `npm run dev` still works as a plain web app (uses Google Identity Services,
needs `http://localhost:5173` as an authorized JavaScript origin).

## How syncing behaves
- Local data is in IndexedDB; the Drive folder holds `current.json`, `archive-YYYY-MM-DD.json`, `conflict-*.json`
  and `asset-<sha256>` (one file per photo, so board files stay small).
- Edits sync ~3 s after you stop; the app pulls on focus, every 2 minutes, and when the network returns.
- Each board version has a `rev`. If only one side changed, the other fast-forwards. If both changed since the last sync,
  the cloud version stays current and your local version is saved as a **conflict copy** on the Dashboard
  (Make current / Restore as archive / Discard). Nothing is silently overwritten.
- Known limits: the check-then-write has a tiny race window; unused photo files aren't garbage-collected yet;
  access tokens last ~1 hour, so after long idle a click on *Reconnect* may be needed.

## Long-lived sign-in (recommended): the auth worker
Without it the extensions use the implicit flow (1-hour tokens, silent renewal sometimes fails → "Session expired").
With the worker in `worker/` they use the authorization-code flow and keep a refresh token, so sign-in lasts.
1. Deploy the worker (see `worker/README.md`); it holds the OAuth client secret so the extension never ships it.
2. Set `VITE_AUTH_WORKER_URL` in `.env.local` and rebuild (`npm run build:ext`).
3. Publish the OAuth consent screen to **In production** (Google Auth Platform → Audience → *Publish app*); in *Testing* refresh tokens expire after 7 days.
Users must sign in once again after switching flows.
