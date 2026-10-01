// Builds the Chrome and Firefox (Manifest V3) extensions into dist-ext/<browser>/.
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['chrome', 'firefox'];
const base = {
  manifest_version: 3,
  name: 'Analog Weekly Board',
  version: pkg.version,
  description: 'A weekly corkboard that archives itself every Monday and syncs through your Google Drive.',
  action: { default_title: 'Open Analog Weekly Board', default_icon: { 128: 'icons/icon-128.png' } },
  icons: { 128: 'icons/icon-128.png' },
  permissions: ['identity', 'unlimitedStorage'],
  host_permissions: ['https://www.googleapis.com/*', 'https://oauth2.googleapis.com/*'],
  content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
};
const manifests = {
  chrome: { ...base, background: { service_worker: 'background.js' } },
  firefox: { ...base, background: { scripts: ['background.js'] }, browser_specific_settings: { gecko: { id: 'weekly-board@analogwitch', strict_min_version: '121.0' } } },
};
for (const target of targets) {
  execFileSync('npx', ['vite', 'build'], { stdio: 'inherit', env: { ...process.env, EXT_TARGET: target } });
  const out = `dist-ext/${target}`;
  copyFileSync('extension/background.js', `${out}/background.js`);
  writeFileSync(`${out}/manifest.json`, JSON.stringify(manifests[target], null, 2));
  console.log(`✓ ${out}`);
}
