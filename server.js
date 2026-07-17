// Tiny static server for The Wretch. ES modules require http (file:// is CORS-blocked)
// and a correct JS MIME type, both handled here.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8777;
const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
  '.svg':'image/svg+xml', '.ico':'image/x-icon', '.wasm':'application/wasm',
  '.tif':'image/tiff', '.tiff':'image/tiff',
  '.ogg':'audio/ogg', '.wav':'audio/wav', '.mp3':'audio/mpeg', '.m4a':'audio/mp4', '.flac':'audio/flac'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const full = path.join(ROOT, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  if (!full.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    });
    res.end(data);
  });
});

const URL = `http://127.0.0.1:${PORT}/index.html`;
function openBrowser(){
  if (process.env.NO_OPEN) return;
  const cmd = process.platform === 'win32' ? `start "" "${URL}"`
    : process.platform === 'darwin' ? `open "${URL}"` : `xdg-open "${URL}"`;
  require('child_process').exec(cmd, () => {});
}
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.log('Hollowcraft already serving — opening ' + URL); openBrowser(); }
  else { console.error(e); process.exit(1); }
});
server.listen(PORT, '127.0.0.1', () => {
  console.log('HOLLOWCRAFT serving at ' + URL + '   (close this window to stop)');
  openBrowser();
});
