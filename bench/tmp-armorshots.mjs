// Scratch: measure and photograph the WORN chestplate on all three bodies — the inventory paperdoll, the
// third-person body, and a peer avatar driven through the real 'p' receive path.
//   node bench/tmp-armorshots.mjs
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
await page.evaluate(() => { for (const id of ['bgvid','menufx']){ const e = document.getElementById(id); if (e) e.style.display = 'none'; } });
await page.evaluate("__hc.lock(true); __hc.pinScene(); __hc.freezeAnimals(true); __hc.freeze(true,false);");
await page.evaluate("__hc.setTime(0.30)"); await page.waitForTimeout(1200); await page.evaluate("__hc.setTime(0.30)");
await page.waitForTimeout(600);

const IDS = (process.argv[2] || 'leather_chestplate,iron_chestplate').split(',');

// 1. THE PAPERDOLL. Open the inventory so the pview canvas exists and renders, and lock its yaw so front
//    and back are the same shot every run.
for (const id of IDS){
  console.log('paperdoll', id, JSON.stringify(await page.evaluate(i => __hc.wornArmor(i), id)));
  await page.evaluate(() => __hc.eqUI('inv'));
  await page.waitForTimeout(500);
  for (const [nm, yaw] of [['front', 0], ['side', Math.PI/2], ['back', Math.PI]]){
    await page.evaluate(y => __hc.pview(y, 820), yaw);
    await page.waitForTimeout(260);
    const el = await page.$('#pview');
    if (el) await el.screenshot({ path: path.join(OUT, 'worn-' + id + '-' + nm + '.png') });
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
}

// 2. THIRD PERSON, the same shell on the body that walks around the world.
for (const id of IDS){
  const r = await page.evaluate(i => { __hc.wornArmor(i); return __hc.tpsProbe(true); }, id);
  console.log('tps', id, JSON.stringify(r));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'worn-tps-' + id + '.png'), clip: { x: 380, y: 60, width: 520, height: 600 } });
}
await page.evaluate(() => __hc.tpsProbe(false));

// 3. A PEER, through the receive path: fakePeer stands one in front of the camera, wornArmor's peer arg
//    drives setAvatarChest the way an arriving 'p' packet does.
for (const id of IDS){
  await page.evaluate(() => __hc.fakePeer(false, 1.9));   // close enough that the chest fills the frame — a shell is 40 cm of geometry and reads as noise at 3 m
  console.log('peer', id, JSON.stringify(await page.evaluate(i => __hc.wornArmor(undefined, i), id)));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'worn-peer-' + id + '.png'), clip: { x: 380, y: 60, width: 520, height: 600 } });
}
await b.close(); server.kill();
console.log('shots in', OUT);
