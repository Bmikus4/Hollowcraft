// The iron-sight pass's camera. For each gun: a hip frame, an aimed frame at NOON and the same aimed frame
// at NIGHT, plus the two sight roots projected to screen pixels.
//
//   node bench/tmp-sightshots.mjs pistol,revolver_snub
//
// WHY THE NIGHT FRAME IS NOT OPTIONAL. Ben's "the iron sights are not coloured correctly" was navy sights:
// the posts were taking the sky's colour through a specular term. A noon frame alone cannot tell a matte
// black post from one that is merely dark because the light is dim, so every gun is photographed under both
// and the pair is what proves the material (G6 in the handoff).
//
// WHY THE PIXELS AND NOT JUST THE PICTURE. `dotY` is one number and says nothing about whether the front
// element sits inside the rear one — that is an angle from the eye. `sightPts`, projected through the live
// camera, gives the two elements' screen positions: aligned sights put both within a pixel or two of each
// other, and both near the crosshair. A picture that looks right and pixels that disagree means the aim
// pose, not the sight block.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft', OUT = path.join(ROOT, 'bench/results/sights');
const IDS = (process.argv[2] || 'ar15').split(',').filter(Boolean);
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
fs.mkdirSync(OUT, { recursive: true });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()", null, { timeout: 420000 });
// The menu's key art sits over the canvas at z-index 19 and survives start in this working copy (the UI session
// is mid-change there). Hidden rather than worked around: this harness photographs the hands, not the menu.
await page.evaluate(() => { for (const id of ['bgvid','menufx']){ const e = document.getElementById(id); if (e) e.style.display = 'none'; } });
await page.evaluate("__hc.lock(true); __hc.pinScene(); __hc.freezeAnimals(true); __hc.freeze(true,false);");

// `view` and `camera` are not global bindings — the whole game body is closed over — so the projection has to
// run inside the page as a probe. That is __hc.sightPix(), added with this harness.
async function shoot(id, tag, clip){ await page.screenshot({ path: path.join(OUT, `${id}-${tag}.png`), clip }); }
const HIP = { x: 480, y: 180, width: 1360, height: 860 };
// 200x150 CSS px at deviceScaleFactor 2 is a 400x300 image of the sight picture alone. A wider crop is a
// picture of the countryside with a sight in it, and at 1x the post is four pixels tall — neither can be
// compared against anything.
const ADS = { x: 860, y: 465, width: 200, height: 150 };   // centred on the crosshair at 960,540

for (const time of [0.25, 0.78]){                       // 0.25 is noon, 0.78 is night (0.5 is sunset)
  const night = time > 0.5;
  await page.evaluate(t => __hc.setTime(t), time); await page.waitForTimeout(1400);
  await page.evaluate(t => __hc.setTime(t), time); await page.waitForTimeout(600);
  for (const id of IDS){
    await page.evaluate(i => { __hc.hold(i); }, id);
    await page.waitForTimeout(500);
    if (!night) await shoot(id, 'hip', HIP);
    await page.mouse.move(960, 540); await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(1500);
    const px = await page.evaluate(() => __hc.sightPix());
    console.log(`${night ? 'night' : 'noon '} ${id.padEnd(16)} ${JSON.stringify(px)}`);
    await shoot(id, night ? 'ads-night' : 'ads', ADS);
    if (!night){   // the same frame with the sight elements painted through the gun: post magenta, wings orange,
                   // ears green, notch/ring cyan, base yellow. Which shape is which stops being a guess.
      await page.evaluate(() => __hc.sightHi(true)); await page.waitForTimeout(200);
      await shoot(id, 'ads-hi', ADS);
      await page.evaluate(() => __hc.sightHi(false)); await page.waitForTimeout(150);
    }
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(250);
  }
}
await b.close(); server.kill();
console.log('shots in', OUT);
