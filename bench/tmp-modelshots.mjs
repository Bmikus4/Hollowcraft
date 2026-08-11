// Scratch: photograph every replaced model in the hand (hip and aimed) so the pack can be LOOKED at.
//   node bench/tmp-modelshots.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft', OUT = path.join(ROOT, 'bench/results/models');
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
fs.mkdirSync(OUT, { recursive: true });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()", null, { timeout: 420000 });
// The menu's background video and fx layer sit at z-index 19 over the canvas and are still up after start in this
// working copy (another session is mid-change on the menu art), so a screenshot photographs the key art. Hidden here
// rather than worked around: this harness is about what the HANDS are holding.
await page.evaluate(() => { for (const id of ['bgvid','menufx']){ const e = document.getElementById(id); if (e) e.style.display = 'none'; } });
await page.evaluate("__hc.lock(true); __hc.pinScene(); __hc.freezeAnimals(true); __hc.freeze(true,false);");
await page.evaluate("__hc.setTime(0.30)"); await page.waitForTimeout(1200); await page.evaluate("__hc.setTime(0.30)");
await page.waitForTimeout(600);
const IDS = (process.argv[2] || 'ar15,ar15_dot,hunting_rifle,hunting_rifle_dot,revolver,shotgun,shotgun_suppressed,iron_axe,wood_axe,iron_shovel,apple,green_apple,bread,cooked_meat,bottle_water,alice_pack,flashlight,bandage').split(',');
for (const id of IDS){
  await page.evaluate(i => { __hc.hold(i); }, id);
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(OUT, id + '.png'), clip: { x: 320, y: 120, width: 900, height: 600 } });
}
// aimed frames: hold the right mouse button so the ADS ramp lands
for (const id of ['ar15', 'ar15_dot', 'hunting_rifle', 'revolver', 'shotgun']){
  await page.evaluate(i => { __hc.hold(i); }, id);
  await page.mouse.move(640, 360); await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(1400);
  console.log('  ads', id, JSON.stringify(await page.evaluate(() => __hc.sight())));
  await page.screenshot({ path: path.join(OUT, 'ads-' + id + '.png'), clip: { x: 440, y: 180, width: 640, height: 460 } });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(250);
}
// flash frames: __hc.flashHold parks the sprite on so a 60 ms event can be photographed
for (const id of ['ar15','hunting_rifle','revolver','shotgun','minigun']){
  await page.evaluate(i => { __hc.hold(i); __hc.flashHold(true); }, id);
  for (let k=0;k<3;k++){
    await page.evaluate(() => { __hc.flashHold(false); __hc.flashHold(true); });   // a fresh pick each time
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, 'flash-'+id+'-'+k+'.png'), clip: { x: 400, y: 140, width: 760, height: 520 } });
  }
  await page.evaluate(() => __hc.flashHold(false));
}
console.log(JSON.stringify(await page.evaluate(() => __hc.sight())));
await b.close(); server.kill();
console.log('shots in', OUT);
