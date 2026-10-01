// Builds both extensions and zips them into release/ for a GitHub Release.
//   npm run package:ext               (requires VITE_AUTH_WORKER_URL so sign-in stays long-lived)
//   npm run package:ext -- --allow-no-worker
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { loadEnv } from 'vite';

const env = loadEnv('production', process.cwd(), 'VITE_');
if (env.VITE_AUTH_WORKER_URL && !/^https:\/\/[^\s<>]+$/.test(env.VITE_AUTH_WORKER_URL)) { console.error(`VITE_AUTH_WORKER_URL in .env.local is not a real URL ("${env.VITE_AUTH_WORKER_URL}"). Use the https://….workers.dev address printed by \`wrangler deploy\`.`); process.exit(1); }
if (!env.VITE_GOOGLE_CLIENT_ID) { console.error('Missing VITE_GOOGLE_CLIENT_ID in .env.local — the release would have no Google sign-in.'); process.exit(1); }
if (!env.VITE_AUTH_WORKER_URL && !process.argv.includes('--allow-no-worker')) {
  console.error('Missing VITE_AUTH_WORKER_URL in .env.local — sign-in would expire after an hour. Add it (see worker/README.md) or pass --allow-no-worker.');
  process.exit(1);
}
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const tag = process.env.RELEASE_TAG || `v${version}`;
mkdirSync('release', { recursive: true }); // keeps release/amo from `npm run package:amo`
execFileSync('node', ['scripts/build-extension.mjs'], { stdio: 'inherit' });
for (const target of ['chrome', 'firefox']) {
  const out = `${process.cwd()}/release/analog-weekly-board-${target}-${tag}.zip`;
  rmSync(out, { force: true });
  execFileSync('zip', ['-r', '-q', out, '.'], { cwd: `dist-ext/${target}` });
  console.log(`✓ ${out}`);
}
