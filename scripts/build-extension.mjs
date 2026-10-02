// Builds the Chrome and Firefox (Manifest V3) extensions into dist-ext/<browser>/.
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['chrome', 'firefox'];
const base = {
  manifest_version: 3,
  name: 'Analog Weekly Board',
  version: pkg.version,
  description: 'A weekly corkboard that archives itself weekly and syncs through your Google Drive.',
  action: { default_title: 'Open Analog Weekly Board', default_icon: { 128: 'icons/icon-128.png' } },
  icons: { 128: 'icons/icon-128.png' },
  permissions: ['identity', 'unlimitedStorage', 'declarativeNetRequestWithHostAccess'],
  host_permissions: ['https://www.googleapis.com/*', 'https://oauth2.googleapis.com/*', 'https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*', 'https://api.bilibili.com/*'],
  optional_host_permissions: ['https://*/*', 'http://*/*'],
  content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; frame-src https://www.youtube-nocookie.com https://player.bilibili.com https://www.instagram.com https://platform.twitter.com https://www.xiaohongshu.com https://xhslink.com https://www.xhslink.com" },
};
const manifests = {
  // `key` pins Chrome's extension ID, so the Google redirect URI https://<id>.chromiumapp.org/ is the same for every install.
  chrome: { ...base, key: readFileSync('extension/chrome-key.pub.b64', 'utf8').trim(), background: { service_worker: 'background.js' } },
  firefox: {
    ...base,
    permissions: ['identity', 'unlimitedStorage', 'webRequest', 'webRequestBlocking'],
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Period', mac: 'Alt+Period' },
        description: 'Open or focus Analog Weekly Board',
      },
    },
    background: { scripts: ['background.js'] },
    browser_specific_settings: {
      gecko: {
        id: 'weekly-board@analogwitch',
        strict_min_version: '140.0',
        // Sync is opt-in: nothing is collected unless the user signs in with Google.
        data_collection_permissions: { required: ['none'], optional: ['authenticationInfo', 'personallyIdentifyingInfo'] },
      },
      gecko_android: { strict_min_version: '142.0' },
    },
  },
};
for (const target of targets) {
  execFileSync('npx', ['vite', 'build'], { stdio: 'inherit', env: { ...process.env, EXT_TARGET: target } });
  const out = `dist-ext/${target}`;
  copyFileSync('extension/background.js', `${out}/background.js`);
  writeFileSync(`${out}/manifest.json`, JSON.stringify(manifests[target], null, 2));
  console.log(`✓ ${out}`);
}
