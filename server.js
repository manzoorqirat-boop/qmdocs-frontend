// Production server for Railway. `vite preview` (the only thing that would
// otherwise run) is explicitly not meant for production traffic — it lacks
// security headers and isn't built for real concurrency. This is a small,
// dependency-free static file server instead: same approach the legacy
// frontend used, ported to ESM since this project has "type": "module".
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let filePath = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath);
    const ext = path.extname(filePath);

    // SPA fallback: only for paths with NO extension — real client-side
    // routes like /app/dashboard or /external/sign/:token, which don't
    // correspond to a file on disk and need index.html so TanStack Router
    // can take over. A path WITH an extension that's missing (e.g. a
    // content-hashed chunk from a build that's since been replaced by a
    // redeploy) is a genuinely missing asset and must 404 — silently
    // serving index.html for it makes the browser reject the response
    // ("Expected a JavaScript module but the server responded with
    // text/html") instead of surfacing a clean, recoverable 404 that the
    // app's own stale-chunk handling can act on.
    if (!ext) {
      filePath = path.join(DIST, 'index.html');
    } else if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      res.end('Not found');
      return;
    }

    const contentType = MIME[path.extname(filePath)] || 'application/octet-stream';
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Internal server error');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        // Hashed asset filenames (Vite's default) are safe to cache
        // aggressively; index.html must always be revalidated so a
        // deploy is picked up on next load instead of being served stale.
        'Cache-Control': path.basename(filePath) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      });
      res.end(data);
    });
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`QMDocs frontend serving ${DIST} on port ${PORT}`);
  });
