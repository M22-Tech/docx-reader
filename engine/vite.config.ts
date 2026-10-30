import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The policy of docs/spec/05-privacy.md: no network of any kind.
const BUILD_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:";
// The dev server needs its own module scripts and hot reload.
const SERVE_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; connect-src 'self' ws: wss:";

/** Adds the Content-Security-Policy meta: the strict one to the build, a looser one to the dev server. */
function contentSecurityPolicy(): Plugin {
  let serving = false;
  return {
    name: 'content-security-policy',
    configResolved(config) {
      serving = config.command === 'serve';
    },
    transformIndexHtml(html) {
      // Written as text: Vite's tag form escapes the quotes, which the single-file plugin's policy check can't read.
      const policy = serving ? SERVE_CSP : BUILD_CSP;
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

export default defineConfig({
  plugins: [contentSecurityPolicy(), viteSingleFile()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: { input: 'viewer.html' },
  },
});
