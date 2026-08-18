// Blood: does a shot on a creature leave a wound that RIDES it, and spatter on the blocks behind?
//   node bench/tmp-blood.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft', OUT = path.join(ROOT, 'bench/results/blood');
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
fs.mkdirSync(OUT, { recursive: true });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu','--use-angle=d3d11','--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()", null, { timeout: 420000 });
await page.evaluate(() => { for (const id of ['bgvid','menufx']){ const e = document.getElementById(id); if (e) e.style.display = 'none'; } });
await page.evaluate("__hc.lock(true); __hc.setTime(0.27);");
await page.waitForTimeout(2000);
await page.evaluate(() => { __hc.hold('ar15'); __hc.giveItem('rifle_ammo', 60); __hc.freezeAnimals(true); });
await page.waitForTimeout(600);
console.log("shot ", JSON.stringify(await page.evaluate(() => __hc.bloodShootAnimal())));
await page.waitForTimeout(900);
await page.waitForTimeout(1200);
// THE REAL SHOT PATH, on something a ray cannot miss: shootWretch summons it at arm's length and empties rounds into
// it. bloodShootAnimal above can legitimately miss — the small-animal capsule is 0.5 wide and a snail is a needle to
// thread — and a miss says nothing about whether the hook fires.
console.log("wretch", JSON.stringify(await page.evaluate(() => {
  const before = __hc.bloodState().live; const r = __hc.shootWretch(3);
  return { fired: r && r.fired, hp0: r && r.hp0, before, after: __hc.bloodState().live };
})));
await page.waitForTimeout(800);
console.log("place", JSON.stringify(await page.evaluate(() => __hc.bloodPlace())));
await page.waitForTimeout(900);
const st = await page.evaluate(() => __hc.bloodState());
console.log('meta ', JSON.stringify(st.meta));
console.log('live ', st.live, 'ready', st.ready, 'dead', st.dead);
console.log('snap ', JSON.stringify(st.lastSnap));
for (const d of st.decals) console.log('  ', JSON.stringify(d));
// THE TEST THAT MATTERS runs inside the page: `animals` is closed over by the game body and unreachable here.
const ride = await page.evaluate(() => __hc.bloodRide(3,2));
console.log('ride ', JSON.stringify(ride));
// THE GIANTESS is skinned, so her wound hangs on a BONE. Two things to prove: that a shot on her makes blood at all,
// and that it rides the bone rather than staying where she was standing.
const girl = await page.evaluate(async () => {
  __hc.girl(12);                                                     // spawn her ahead of the player
  for (let i = 0; i < 120 && !(__hc.girlState && __hc.girlState().loaded); i++) await new Promise(r => setTimeout(r, 250));
  const before = __hc.bloodState().live;
  const shot = __hc.girlShoot('spine.003', 2);
  const after = __hc.bloodState().live;
  const mine = __hc.bloodState().decals.filter(d => d.kind !== 'splatter');
  return { shot, before, after, wounds: mine.length, depth: mine.map(d => d.parentDepth), onScene: mine.map(d => d.onScene) };
});
console.log('girl  ', JSON.stringify(girl));
console.log('gsnap ', JSON.stringify(await page.evaluate(() => __hc.bloodState().lastSnap)));
// Her picture BEFORE the bone-ride test: that test turns all 115 of her bones a third of a radian, so anything shot
// after it is a photograph of a pretzel. Aim the camera at her chest, where the rounds went.
// NO TELEPORT. __hc.girl(12) spawns her twelve blocks along the player's own look direction, so the camera is
// already pointed at her - and placing it from the wound's world point put it inside a hillside twice.
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, 'girl-blood.png') });
console.log('gride ', JSON.stringify(await page.evaluate(() => __hc.bloodBoneRide())));
await page.screenshot({ path: path.join(OUT, 'after-shot.png') });
console.log('pageerrors:', errs.length ? errs : 'none');
await b.close(); server.kill();
