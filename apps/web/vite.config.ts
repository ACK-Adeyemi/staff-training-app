import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

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

export default defineConfig({
  base: process.env.BASE_PATH ?? '/staff-training-app/',
  plugins: [react(), tailwindcss(), cspMeta()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPackage.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
});
