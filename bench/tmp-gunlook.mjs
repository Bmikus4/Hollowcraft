// Scratch: photograph ONE weapon at fixed frames, on open ground, at a NOON and a NIGHT sky.
//   node bench/tmp-gunlook.mjs ar15
//   IDS=ar15,revolver node bench/tmp-gunlook.mjs        (several, same frames)
//
// THE FRAMES ARE FIXED AND THE PLACE IS FIXED, which is the whole point: two runs differ only by the change
// between them. Six frames per weapon — hip and aimed, each at noon and night, plus a muzzle flash and a
// third-person — written as look-<id>-<frame>.png so a diff by eye is a diff of two files with the same name.
//
// WHY IT TELEPORTS: the world's spawn is not a photographic studio and does not stay one. It has had a cabin
// dropped next to it and, while this was being written, an entity large enough to fill the frame. __hc.tp puts
// the camera on open ground away from all of it, facing out to sea, so the subject of the photograph is the gun.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft', OUT = path.join(ROOT, 'bench/results/models');
const IDS = (process.env.IDS || process.argv[2] || 'ar15').split(',');
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
fs.mkdirSync(OUT, { recursive: true });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning'){ const t = m.text(); if (!/getImageData|X3595|404/.test(t)) console.log('[' + m.type() + ']', t.slice(0, 160)); } });
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.evaluate(() => { for (const id of ['bgvid','menufx']){ const e = document.getElementById(id); if (e) e.style.display = 'none'; } });
await page.evaluate("__hc.lock(true); __hc.freezeAnimals(true);");
await page.waitForTimeout(2500);
// A clear stretch of beach well clear of spawn, looking along the shore. Chunks have to stream in after the jump,
// so the wait is after the teleport and not before it.
// FIND THE GROUND RATHER THAN NAME IT. The first version stood on a hand-picked coordinate and photographed the
// inside of the sea: at (220,60) the surface is seabed, well under the water line. The spot is searched for
// instead — dry, a few blocks above the sea so it is not tidal, not so high it is a cliff face, and a ring's
// distance from spawn so nothing built at spawn is in the shot.
console.log('at', JSON.stringify(await page.evaluate(() => {
  const s = __hc.st(), SEA = 40;
  for (let r = 70; r <= 200; r += 10){
    for (let a = 0; a < 12; a++){
      const th = a * Math.PI / 6, x = Math.round(s.sx + Math.cos(th) * r), z = Math.round(s.sz + Math.sin(th) * r);
      const g = __hc.groundY(x, z);
      if (typeof g !== 'number' || g < SEA + 3 || g > SEA + 12) continue;
      // and flat around it, so the muzzle is not buried in a hillside
      let ok = true;
      for (const [dx, dz] of [[4,0],[-4,0],[0,4],[0,-4]]) if (Math.abs(__hc.groundY(x+dx, z+dz) - g) > 2) { ok = false; break; }
      // THE EXACT ARITY, NOT THE GROUND-SNAPPING ONE. __hc.tp(x,z) snaps with groundYAt, which reads the loaded
      // block column — and immediately after a jump those chunks do not exist yet, so it clamps to sea level and
      // the camera ends up in the water. surfaceH (what __hc.groundY reports) is the generator's height and is
      // right before anything has streamed, so the height found here is the height passed in.
      if (ok) return __hc.tp(x, g + 2, z, th + Math.PI, 0.02);
    }
  }
  return { err: 'no open ground found' };
})));
// WAIT FOR THE WORLD TO EXIST, NOT FOR A TIMER. After a jump the chunks around the new spot have never been
// generated, and a fixed sleep photographs whatever has arrived by then — which, the first time this ran, was
// nothing at all: a black frame with the HUD drawn over it. __hc.fill() reports meshed against wanted.
for (let i = 0; i < 60; i++){
  const f = await page.evaluate(() => __hc.fill());
  if (f && f.meshed >= f.want * 0.9){ console.log('streamed', JSON.stringify(f)); break; }
  if (i === 59) console.log('STILL STREAMING', JSON.stringify(f));
  await page.waitForTimeout(500);
}
console.log("where", JSON.stringify(await page.evaluate(()=>{const p=__hc.pos();const o={p};o.at=__hc.blockAt(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z));o.head=__hc.blockAt(Math.floor(p.x),Math.floor(p.y)+1,Math.floor(p.z));o.below=__hc.blockAt(Math.floor(p.x),Math.floor(p.y)-1,Math.floor(p.z));o.ground=__hc.groundY(Math.floor(p.x),Math.floor(p.z));o.day=__hc.st().day;return o;})));await page.evaluate("__hc.pinScene(); __hc.freeze(true,false);");
const shot = (id, frame, clip) => page.screenshot({ path: path.join(OUT, `look-${id}-${frame}.png`), clip });
const HIP = { x: 300, y: 130, width: 900, height: 560 }, ADS = { x: 440, y: 180, width: 640, height: 460 };
for (const id of IDS){
  // 0.25 IS NOON AND 0.75 IS MIDNIGHT, which is the day fraction __hc.time documents. 0.50 is sunset: the earlier
  // frames in this file labelled it "noon" and were photographing a dusk sky, which is the worst possible light to
  // judge whether a sight is black or navy in.
  for (const [label, t] of [['noon', 0.25], ['night', 0.78]]){
    await page.evaluate(v => __hc.setTime(v), t); await page.waitForTimeout(700);
    await page.evaluate(i => __hc.hold(i), id); await page.waitForTimeout(500);
    await shot(id, label, HIP);
    await page.mouse.move(640, 360); await page.mouse.down({ button: 'right' }); await page.waitForTimeout(1400);
    await shot(id, label + '-ads', ADS);
    console.log(' ', id, label, JSON.stringify(await page.evaluate(() => __hc.sight())));
    await page.mouse.up({ button: 'right' }); await page.waitForTimeout(300);
  }
  await page.evaluate(v => __hc.setTime(v), 0.50); await page.waitForTimeout(500);
  await page.evaluate(i => { __hc.hold(i); __hc.flashHold(true); }, id); await page.waitForTimeout(400);
  await shot(id, 'flash', HIP);
  await page.evaluate(() => __hc.flashHold(false));
}
console.log('shots in', OUT);
await b.close(); server.kill();
