import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { lookup } from 'node:dns/promises';
import { fetchLinkPreview } from './worker/link-preview.js';

function previewServer(): Plugin {
  const install = (server: Pick<ViteDevServer, 'middlewares'>) => {
    server.middlewares.use(async (request, response, next) => {
      if (request.method !== 'GET' || !request.url?.startsWith('/api/link-preview?')) return next();
      const url = new URL(request.url, 'http://localhost').searchParams.get('url') ?? '';
      const result = await fetchLinkPreview(url, async hostname => {
        const addresses = await lookup(hostname, { all: true });
        if (!addresses.length || addresses.some(({ address }) => {
          if (address.includes(':')) return /^(?:::|fc|fd|fe80:)/i.test(address);
          const [a, b] = address.split('.').map(Number);
          return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127;
        })) throw new Error('Private address');
      });
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify(result));
    });
  };
  return { name: 'link-preview', configureServer: install, configurePreviewServer: install };
}

// `EXT_TARGET=chrome|firefox` builds a browser extension (see scripts/build-extension.mjs); otherwise a normal web app.
const target = process.env.EXT_TARGET;
export default defineConfig({
  plugins: [react(), previewServer()],
  // Extension builds must not contain code that loads remote scripts (Mozilla/Chrome store policy), so web-only sign-in is compiled out.
  define: { __EXTENSION_BUILD__: JSON.stringify(!!target) },
  base: target ? './' : '/',
  build: target ? { outDir: `dist-ext/${target}`, emptyOutDir: true, chunkSizeWarningLimit: 2500 } : undefined,
});
