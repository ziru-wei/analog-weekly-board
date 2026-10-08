// Prepares everything for a Mozilla Add-ons (AMO) submission in release/amo/:
//   - the extension zip to upload,
//   - a source-code zip (AMO requires it because the build is bundled/minified),
//   - REVIEWER_NOTES.md to paste into "Notes to Reviewer".
//   npm run package:amo               (requires VITE_AUTH_WORKER_URL; or pass --allow-no-worker)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadEnv } from 'vite';

const env = loadEnv('production', process.cwd(), 'VITE_');
if (env.VITE_AUTH_WORKER_URL && !/^https:\/\/[^\s<>]+$/.test(env.VITE_AUTH_WORKER_URL)) { console.error(`VITE_AUTH_WORKER_URL in .env.local is not a real URL ("${env.VITE_AUTH_WORKER_URL}"). Use the https://….workers.dev address printed by \`wrangler deploy\`.`); process.exit(1); }
if (!env.VITE_GOOGLE_CLIENT_ID) { console.error('Missing VITE_GOOGLE_CLIENT_ID in .env.local.'); process.exit(1); }
if (!env.VITE_AUTH_WORKER_URL && !process.argv.includes('--allow-no-worker')) { console.error('Missing VITE_AUTH_WORKER_URL in .env.local (see worker/README.md), or pass --allow-no-worker.'); process.exit(1); }
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const out = 'release/amo';
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });

execFileSync('node', ['scripts/build-extension.mjs', 'firefox'], { stdio: 'inherit' });
const root = process.cwd(), extZip = `${root}/${out}/analog-weekly-board-firefox-${version}.zip`, srcZip = `${root}/${out}/analog-weekly-board-source-${version}.zip`;
execFileSync('zip', ['-r', '-q', extZip, '.', '-x', '.DS_Store', '*/.DS_Store'], { cwd: 'dist-ext/firefox' });
execFileSync('zip', ['-r', '-q', srcZip, '.', '-x', 'node_modules/*', 'dist/*', 'dist-ext/*', 'release/*', '.git/*', '.env', '.env.*', '*.pem', '*.DS_Store', '*.tsbuildinfo', 'worker/.wrangler/*', 'worker/.dev.vars*', 'developer_reminder.md', 'tests/*', 'coverage/*', 'test-results/*', 'playwright-report/*', 'web-ext-artifacts/*'], { cwd: root });

writeFileSync(`${out}/REVIEWER_NOTES.md`, `# Notes to reviewer — Analog Weekly Board ${version}

**What it is:** a weekly corkboard (notes, photos, links) that opens in its own tab. Data lives in IndexedDB. Sign-in with Google is optional and only used to sync boards through the user's hidden Google Drive app-data folder.

## Build (reproduces the submitted package exactly)
Requirements: Node.js 20+ and npm 10+.
\`\`\`
unzip analog-weekly-board-source-${version}.zip -d source && cd source
printf 'VITE_GOOGLE_CLIENT_ID=${env.VITE_GOOGLE_CLIENT_ID}\\nVITE_AUTH_WORKER_URL=${env.VITE_AUTH_WORKER_URL ?? ''}\\n' > .env.local
npm ci
npm run build:firefox
\`\`\`
Output: \`dist-ext/firefox/\` (this is what was zipped and uploaded). Both env values are public identifiers (an OAuth client ID and the URL of the auth worker); no secret is in the package.

## About the lint warnings
- \`DANGEROUS_EVAL\` / \`UNSAFE_VAR_ASSIGNMENT\` (innerHTML, dynamic import) come from bundled third-party libraries: three.js, threepipe and @threepipe/webgi-plugins (WebGL rendering of the colour palette tray). The app's own code does not use eval, and does not assign dynamic strings to innerHTML. No remote scripts execute in the extension page. YouTube, Instagram, X and Xiaohongshu content runs only in isolated, cross-origin provider iframes.

## Network and permissions
- \`identity\`: used with \`identity.launchWebAuthFlow\` for Google OAuth (authorization code + PKCE).
- \`unlimitedStorage\`: IndexedDB holds boards and photos pasted by the user.
- \`webRequest\` / \`webRequestBlocking\`: sets the app’s public HTTPS identity as Referer only for youtube-nocookie.com/embed/ subframes initiated by this extension, so YouTube can identify the embedding client. It does not modify normal website traffic.
- YouTube: opening a board with a YouTube clipping loads its player and fetches its title from youtube.com/oembed; no autoplay, no downloaded videos, and no players in Dashboard thumbnails.
- Optional \`http://*/*\` and \`https://*/*\` access is requested only when the user clicks "Enable website previews". The background fetches only board-requested links without cookies, limits HTML to 2 MB, and returns text for metadata parsing; it never executes page scripts. Instagram/X/Xiaohongshu frames remain cross-origin. Login-required notes show a fallback.
- Firefox checks YouTube host grants before loading the player and prompts only after an explicit "Allow YouTube playback" click; this covers upgrades where added host grants are absent.
- Host permissions: \`https://www.googleapis.com/*\` (Drive REST API), \`https://oauth2.googleapis.com/*\` (token revocation), \`https://www.youtube-nocookie.com/*\` (embedded video playback).
- Other requests: \`accounts.google.com\` (sign-in page), the auth worker${env.VITE_AUTH_WORKER_URL ? ` (${env.VITE_AUTH_WORKER_URL})` : ''} (exchanges the one-time code / refreshes access tokens; stateless, stores nothing), and Google Fonts (a stylesheet + font file for one typeface).
- Data handling: Google sign-in is optional; authentication tokens and basic profile (name, email, photo) are used for sync only. When the user opens a board containing a YouTube clipping, YouTube receives the video ID, IP address and normal playback request information even when signed out of sync. Privacy policy: https://ziru-wei.github.io/analog-weekly-board/privacy.html

## Testing
Everything except sync works without an account. To test sync you need a Google account; open the Dashboard (double-click the dark area outside the board) and use "Sign in with Google".
`);
console.log(`✓ ${extZip}\n✓ ${srcZip}\n✓ ${root}/${out}/REVIEWER_NOTES.md`);
