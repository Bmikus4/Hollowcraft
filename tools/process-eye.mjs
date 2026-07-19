// ============================================================================
// tools/process-eye.mjs — OPTIONAL bake path for the seraphim eye textures.
// ----------------------------------------------------------------------------
// Canon §4.2. The shipping path is the RUNTIME <canvas> generation in
// src/boss/seraphim/geometry/eye.js (the game generates every texture at
// runtime). This tool bakes the SAME pure functions to JPEGs for inspection /
// faster loads. There is NO node `canvas` or `sharp` here, so we run the exact
// same eye.js functions inside a real browser (installed Chrome via
// playwright-core) and read back the canvases as JPEGs — one implementation,
// zero drift between bake-time and runtime.
//
//   node tools/process-eye.mjs               # bake from assets/.../eye_source.jpg
//   node tools/process-eye.mjs --procedural  # bake the procedural fallback
//
// Writes: assets/seraphim/eye/{iris_albedo,sclera_albedo,iris_bump}.jpg
// If no Chrome/Edge is found, it prints a notice and exits 0 — the runtime path
// covers the game regardless (baked files are an optimization, not a dependency).
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EYE_DIR = path.join(ROOT, 'assets', 'seraphim', 'eye');
const PROCEDURAL = process.argv.includes('--procedural');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };

const BAKE_PAGE = `<!doctype html><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/jsm/"}}</script>
<script type="module">
import { processIris, processSclera, processIrisBump, proceduralIris, proceduralSclera } from '/src/boss/seraphim/geometry/eye.js';
const loadImg = u => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('img ' + u)); i.src = u; });
window.__bake = async (procedural) => {
  let iris, sclera, bump;
  if (procedural) { iris = proceduralIris({ size: 2048 }); sclera = proceduralSclera({ size: 2048 }); bump = processIrisBump(iris, { size: 1024 }); }
  else {
    const img = await loadImg('/assets/seraphim/eye/eye_source.jpg');
    iris = processIris(img, { size: 1024 });
    sclera = processSclera(img, { size: 2048 });
    bump = processIrisBump(iris, { size: 1024 });
  }
  return { iris: iris.toDataURL('image/jpeg', 0.92), sclera: sclera.toDataURL('image/jpeg', 0.90), bump: bump.toDataURL('image/jpeg', 0.90),
           dims: { iris: [iris.width, iris.height], sclera: [sclera.width, sclera.height], bump: [bump.width, bump.height] } };
};
window.__ready = true;
</script>`;

function freePort() { return new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); }); }

function startServer(port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      if (url === '/__bake') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(BAKE_PAGE); return; }
      const file = path.join(ROOT, url);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

function findBrowser() {
  const cands = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const p of cands) if (fs.existsSync(p)) return p;
  return null;
}

function writeDataUrl(file, dataUrl) {
  const b64 = dataUrl.split(',')[1];
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return fs.statSync(file).size;
}

(async () => {
  if (!PROCEDURAL && !fs.existsSync(path.join(EYE_DIR, 'eye_source.jpg'))) {
    console.error('no eye_source.jpg — run with --procedural to bake the fallback, or place the source first.');
    process.exit(1);
  }
  const exe = findBrowser();
  if (!exe) {
    console.warn('[process-eye] No Chrome/Edge found. Skipping bake.');
    console.warn('[process-eye] Runtime path (eye.js loadEyeTextures) still generates textures on <canvas> from eye_source.jpg — baked JPEGs are optional.');
    process.exit(0);
  }
  fs.mkdirSync(EYE_DIR, { recursive: true });
  const port = await freePort();
  const srv = await startServer(port);
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    page.on('console', m => { const t = m.text(); if (/error|warn|todo/i.test(t)) console.log('  [page]', t); });
    page.on('pageerror', e => console.log('  [pageerror]', String(e.message || e)));
    await page.goto(base + '/__bake', { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction('window.__ready === true', { timeout: 30000 });
    console.log(`baking eye textures (${PROCEDURAL ? 'procedural' : 'from eye_source.jpg'})…`);
    const out = await page.evaluate((proc) => window.__bake(proc), PROCEDURAL);
    const si = writeDataUrl(path.join(EYE_DIR, 'iris_albedo.jpg'), out.iris);
    const ss = writeDataUrl(path.join(EYE_DIR, 'sclera_albedo.jpg'), out.sclera);
    const sb = writeDataUrl(path.join(EYE_DIR, 'iris_bump.jpg'), out.bump);
    console.log(`  iris_albedo.jpg   ${out.dims.iris.join('x')}   ${(si / 1024).toFixed(0)} KB`);
    console.log(`  sclera_albedo.jpg ${out.dims.sclera.join('x')} ${(ss / 1024).toFixed(0)} KB`);
    console.log(`  iris_bump.jpg     ${out.dims.bump.join('x')}   ${(sb / 1024).toFixed(0)} KB`);
    console.log('done. baked JPEGs written to assets/seraphim/eye/');
  } finally {
    await browser.close();
    srv.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
