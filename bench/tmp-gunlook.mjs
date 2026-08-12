// Scratch: one gun, fixed frames, at a NOON and a NIGHT sky — the two frames G6 asks for before a sight or a
// finish is called done. Extends tmp-modelshots rather than replacing it: same boot, same clip, one weapon.
//   node bench/tmp-gunlook.mjs ar15
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft', OUT = path.join(ROOT, 'bench/results/models');
const ID = process.argv[2] || 'ar15';
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
fs.mkdirSync(OUT, { recursive: true });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
const page = await b.newPage({ viewport: { width: Number(process.env.VW||1280), height: Number(process.env.VH||720) } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()", null, { timeout: 420000 });
await page.evaluate(() => { for (const id of ['bgvid','menufx']){ const e = document.getElementById(id); if (e) e.style.display = 'none'; } });
await page.evaluate("__hc.lock(true); __hc.freezeAnimals(true);");
// The world has to be DRAWN before it is photographed: chunks stream in after started goes true, and a shot taken
// on the first frame is of an empty sky. Wait for the terrain to actually be there rather than for a timer.
await page.waitForTimeout(3000);
// WALK CLEAR OF THE SPAWN BEFORE PINNING. Another session's entity stands at the pinned spawn and fills the frame,
// and a gun photographed against a black body is not a photograph of a gun. Walking is the honest fix: it does not
// touch her, it does not touch the scene, it just puts the camera somewhere a weapon can be seen.
await page.keyboard.down('w'); await page.waitForTimeout(Number(process.env.WALK || 2600)); await page.keyboard.up('w');
await page.waitForTimeout(900);
await page.evaluate("__hc.pinScene(); __hc.freeze(true,false);");
console.log('state', JSON.stringify(await page.evaluate(() => { const s = __hc.st(); return { px: s.px, pz: s.pz, py: s.py, fps: s.fps }; })));
for (const [label, t] of [['noon', 0.50], ['night', 0.92]]){
  await page.evaluate(v => __hc.setTime(v), t); await page.waitForTimeout(900);
  await page.evaluate(i => __hc.hold(i), ID); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `look-${ID}-${label}.png`), fullPage:false });
  await page.mouse.move(640, 360); await page.mouse.down({ button: 'right' }); await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(OUT, `look-${ID}-${label}-ads.png`), fullPage:false });
  console.log(' ', label, JSON.stringify(await page.evaluate(() => __hc.sight())));
  await page.mouse.up({ button: 'right' }); await page.waitForTimeout(300);
}
console.log('shots in', OUT);
await b.close(); server.kill();
