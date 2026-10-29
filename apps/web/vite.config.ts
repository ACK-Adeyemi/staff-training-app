import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const rootPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

/** Adds the Content-Security-Policy meta tag to the built index.html (the dev server needs inline scripts). */
const cspMeta = (): Plugin => ({
  name: 'csp-meta',
  apply: 'build',
  // A string edit, because tag descriptors would HTML-escape the quotes in the policy.
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
});

const base = process.env.BASE_PATH ?? '/staff-training-app/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    cspMeta(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Staff training demo',
        short_name: 'Staff training',
        description: 'A demo of staff compliance training.',
        scope: base,
        start_url: `${base}#/staff`,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1f4e79',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(rootPackage.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
});
