// The dock: is it over water, is it standing higher than the beach, is it SOLID, and are the planks gone?
//   node bench/tmp-dock.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft', OUT = path.join(ROOT, 'bench/results');
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()", null, { timeout: 420000 });
await page.evaluate(() => { for (const id of ['bgvid','menufx']){ const e = document.getElementById(id); if (e) e.style.display = 'none'; } });
// the dock is built lazily once spawn's chunks are ready
await page.waitForFunction("(()=>{try{return __hc.dockInfo().built===true;}catch(e){return false;}})()", null, { timeout: 120000 });
const info = await page.evaluate(() => __hc.dockInfo());
console.log(JSON.stringify(info, null, 1));

// SOLID IS A CLAIM ABOUT PHYSICS, so it is asked of physics: hitAt just above the deck must be clear, just below
// the deck's top must be blocked, and standing on it must not be standing in it.
const c = info.collider;
const mid = c && { x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2 };
if (mid){
  const probe = await page.evaluate(([x, z, top]) => ({
    onDeck:    __hc.hits(x, top + 0.05, z),        // feet on the surface: clear
    inDeck:    __hc.hits(x, top - 0.25, z),        // feet inside the deck: blocked
    underDeck: __hc.hits(x, top - 1.60, z),        // swimming beneath it: clear
    planksAt:  __hc.blockAt ? __hc.blockAt(Math.floor(x), top - 1, Math.floor(z)) : 'no blockAt',
  }), [mid.x, mid.z, c.y1]);
  console.log('physics', JSON.stringify(probe));
  // walk out along it: teleport to the landward end, run seaward, and see whether the feet stay at deck height
  await page.evaluate(([x, y, z]) => { __hc.lock(true); __hc.tp(x, y, z, 0, 0); }, [mid.x, c.y1 + 0.2, mid.z]);
  await page.waitForTimeout(1200);
  console.log('stood', JSON.stringify(await page.evaluate(() => { const s = __hc.fallProbe(); return { y: s.y, onGround: s.onGround, vy: s.vy }; })));
}
// A PICTURE OF IT, AND THE CAMERA HAS TO BE HELD. Teleporting to a point in the air over the sea and then waiting
// three seconds for chunks means three seconds of gravity: the first attempt photographed the seabed through the
// underwater fog and read as "the dock is not there".
await page.evaluate(() => { __hc.freeze(true, false); __hc.pinScene(); __hc.freezeAnimals(true); });
await page.evaluate(() => __hc.setTime(0.28)); await page.waitForTimeout(1200);
if (c){
  const eye = await page.evaluate(([x0, z0, x1, z1, top]) => {
    // stand back on the land end, off to one side, looking down the run
    const ax = (x1 - x0) > (z1 - z0);
    const px = ax ? x0 - 14 : (x0 + x1) / 2 + 13, pz = ax ? (z0 + z1) / 2 + 13 : z0 - 14;
    // FORWARD IS (-sin yaw, -cos yaw) in this engine — physics builds movement from it that way. Aiming with
    // atan2(target - eye) points the camera exactly backwards, which is what photographed an empty beach twice.
    const yaw = Math.atan2(px - (x0 + x1) / 2, pz - (z0 + z1) / 2);
    __hc.tp(px, top + 5, pz, yaw, -0.16); return [px, pz];
  }, [c.x0, c.z0, c.x1, c.z1, c.y1]);
  // __qaFreeze does not stop gravity, so the three seconds spent waiting for chunks is three seconds of falling:
  // the camera was landing on the seabed at y 39 and photographing it through the underwater fog. Chunks first,
  // then put the camera where it belongs, then shoot at once.
  await page.evaluate(() => __hc.fill && __hc.fill()); await page.waitForTimeout(3500);
  await page.evaluate(([x, z, top, yaw]) => __hc.tp(x, top + 5, z, yaw, -0.16),
    [eye[0], eye[1], c.y1, Math.atan2(eye[0] - (c.x0 + c.x1) / 2, eye[1] - (c.z0 + c.z1) / 2)]);
  await page.waitForTimeout(120);
  console.log('camera at', JSON.stringify(eye), 'player', JSON.stringify(await page.evaluate(() => {
    const s = __hc.st(); return { pos: s.pos || null, inWater: s.inWater, y: (__hc.fallProbe() || {}).y };
  })));
  await page.screenshot({ path: path.join(OUT, 'dock-side.png') });
}
console.log('pageerrors:', errs.length ? errs : 'none');
await b.close(); server.kill();
