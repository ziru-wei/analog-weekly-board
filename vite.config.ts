import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `EXT_TARGET=chrome|firefox` builds a browser extension (see scripts/build-extension.mjs); otherwise a normal web app.
const target = process.env.EXT_TARGET;
export default defineConfig({
  plugins: [react()],
  // Extension builds must not contain code that loads remote scripts (Mozilla/Chrome store policy), so web-only sign-in is compiled out.
  define: { __EXTENSION_BUILD__: JSON.stringify(!!target) },
  base: target ? './' : '/',
  build: target ? { outDir: `dist-ext/${target}`, emptyOutDir: true, chunkSizeWarningLimit: 2500 } : undefined,
});
