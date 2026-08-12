// The three bags, held, before and after the GLB reader learned to load a model's own texture.
//   node bench/tmp-packshots.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft', OUT = path.join(ROOT, 'bench/results/packs');
const IDS = (process.argv[2] || 'backpack,field_pack,alice_pack,apple,bread,flashlight').split(',');
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
fs.mkdirSync(OUT, { recursive: true });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()", null, { timeout: 420000 });
await page.evaluate(() => { for (const id of ['bgvid','menufx']){ const e = document.getElementById(id); if (e) e.style.display = 'none'; } });
await page.evaluate("__hc.lock(true); __hc.pinScene(); __hc.freezeAnimals(true); __hc.freeze(true,false);");
await page.evaluate("__hc.setTime(0.27)"); await page.waitForTimeout(1400);
// A textured mesh takes a decode: the atlas is handed to TextureLoader when the template parses, so the first
// frame after a hold can legitimately be untextured. Waiting once here is cheaper than a flake per item.
await page.waitForTimeout(1500);
for (const id of IDS){
  await page.evaluate(i => __hc.hold(i), id);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, id + '.png'), clip: { x: 380, y: 200, width: 640, height: 460 } });
}
// Does the held mesh actually carry a map now? A picture can be argued with; this cannot.
const maps = await page.evaluate(ids => {
  const out = {};
  for (const id of ids){ __hc.hold(id); out[id] = __hc.viewMaps ? __hc.viewMaps() : 'no probe'; }
  return out;
}, IDS);
console.log(JSON.stringify(maps, null, 1));
console.log('pageerrors:', errs.length ? errs : 'none');
await b.close(); server.kill();
console.log('shots in', OUT);
