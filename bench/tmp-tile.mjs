// Scratch: photograph ONE item's baked grid tile, big. The tile is rendered by the icon bake with its own lights and
// no world, so it is the only place a model can be looked at fully opaque — a held gun ghosts near cover and a bench
// frame of one is not evidence about its materials.
//   ID=revolver node bench/tmp-tile.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft', OUT = path.join(ROOT, 'bench', 'results');
const ID = process.env.ID || process.argv[2] || 'revolver';
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 3 });
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForTimeout(3500);
const box = await page.evaluate(async id => {
  __hc.gridFillPacked([id]); __hc.openInv();
  await new Promise(r => setTimeout(r, 1500));
  const t = [...document.querySelectorAll('#griditems .gitem')].find(e => e._st && e._st.id === id);
  if (!t) return null; const r = t.getBoundingClientRect();
  return { x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8 };
}, ID);
if (!box) { console.log('no tile for ' + ID); } else {
  await page.screenshot({ path: path.join(OUT, 'tile-' + ID + '.png'), clip: box });
  console.log('tile-' + ID + '.png  ' + JSON.stringify(box));
}
await b.close(); server.kill();
