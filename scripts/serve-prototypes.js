// Server estático para prototipos: allowlist, cache eficiente y compresión.
// - Solo sirve /prototypes/ y /public/ (el resto del repo: 404, sin listado de directorios)
// - "/" redirige a /prototypes/
// - Imágenes y fuentes: Cache-Control immutable (1 año). HTML: no-cache (se sigue iterando)
// - brotli con fallback gzip para HTML/CSS/JS
// Uso:  node scripts/serve-prototypes.js [puerto] [carpeta-raiz] [host]
// Por defecto:  node scripts/serve-prototypes.js   (8080, raíz = repo, 0.0.0.0)
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = parseInt(process.argv[2], 10) || 8080;
const ROOT = path.resolve(process.argv[3] || __dirname + '/..');
const HOST = process.argv[4] || '0.0.0.0';

const ALLOW = ['/prototypes/', '/public/'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

const IMMUTABLE = /\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|eot)$/i;
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|svg|manifest))/i;

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('Not Found');
}

http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch { res.writeHead(400); res.end('Bad request'); return; }

  if (urlPath === '/') {
    res.writeHead(302, { Location: '/prototypes/', 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  if (urlPath === '/prototypes' || urlPath === '/public') {
    res.writeHead(302, { Location: urlPath + '/', 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  if (urlPath === '/favicon.ico' || urlPath === '/favicon.svg') { urlPath = '/public' + urlPath; }  // evita el 404 del favicon
  if (!ALLOW.some(p => urlPath.startsWith(p))) { notFound(res); return; }   // allowlist: nada más

  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const filePath = path.resolve(path.join(ROOT, '.' + path.normalize('/' + urlPath)));
  if (!filePath.startsWith(ROOT)) { notFound(res); return; }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { notFound(res); return; }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': mime,
      'Content-Length': st.size,
      'Cache-Control': IMMUTABLE.test(filePath) ? 'public, max-age=31536000, immutable'
                                                : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Accept-Encoding',
    };

    const accept = req.headers['accept-encoding'] || '';
    const stream = fs.createReadStream(filePath);

    if (COMPRESSIBLE.test(mime) && st.size > 300) {
      if (/\bbr\b/.test(accept)) {
        headers['Content-Encoding'] = 'br';
        delete headers['Content-Length'];
        res.writeHead(200, headers);
        stream.pipe(zlib.createBrotliCompress()).pipe(res);
        return;
      }
      if (/\bgzip\b/.test(accept)) {
        headers['Content-Encoding'] = 'gzip';
        delete headers['Content-Length'];
        res.writeHead(200, headers);
        stream.pipe(zlib.createGzip()).pipe(res);
        return;
      }
    }

    res.writeHead(200, headers);
    stream.pipe(res);
  });
}).listen(PORT, HOST, () => {
  console.log('Sirviendo /prototypes/ y /public/ desde ' + ROOT);
  console.log('  http://127.0.0.1:' + PORT + '/prototypes/   (host ' + HOST + ')');
  console.log('  Imágenes/fuentes: cache immutable 1 año · HTML: no-cache · brotli/gzip');
  console.log('  El resto del repo (.git, backups, DB-BACK, config, ...) devuelve 404.');
});