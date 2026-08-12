// Scratch: WHAT does pulling out a gun put on the screen? Ben: "when I pull one out a big black square appears
// in the viewport." A frame is captured with an empty hand and again holding each gun, and the two are differenced
// pixel by pixel — the bounding box of what changed IS the thing, and its mean colour says whether it is black.
//
// This works when the frame itself cannot be judged by eye: it does not ask what the picture looks like, only what
// the gun added to it.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import zlib from 'node:zlib';
const ROOT = 'D:/Code/Minecraft', OUT = path.join(ROOT, 'bench/results/models');
const IDS = (process.env.IDS || 'ar15,revolver,shotgun,hunting_rifle').split(',');
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
fs.mkdirSync(OUT, { recursive: true });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu','--use-angle=d3d11','--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)));
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.evaluate("__hc.lock(true); __hc.freezeAnimals(true);");
await page.waitForTimeout(4000);

// Pixels are read inside the page from a canvas drawn off the screenshot, so no PNG decoder is needed here.
const grab = () => page.evaluate(async () => {
  const c = document.getElementById('c');
  return await new Promise(res => {
    const cv = document.createElement('canvas'); cv.width = c.width; cv.height = c.height;
    cv.getContext('2d').drawImage(c, 0, 0);
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    res({ w: cv.width, h: cv.height, data: Array.from(d.data.filter((_, i) => i % 4 !== 3)) });
  });
});
const diff = (a, bb) => {
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1, n = 0, sum = 0;
  const W = a.w, px = W * 3;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < W; x++){
    const i = y * px + x * 3;
    const d0 = Math.abs(a.data[i] - bb.data[i]) + Math.abs(a.data[i+1] - bb.data[i+1]) + Math.abs(a.data[i+2] - bb.data[i+2]);
    if (d0 < 18) continue;
    n++; sum += (bb.data[i] * 0.299 + bb.data[i+1] * 0.587 + bb.data[i+2] * 0.114);
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  return n ? { changed: n, box: [minx, miny, maxx - minx + 1, maxy - miny + 1], meanLum: +(sum / n).toFixed(1),
               coverage: +(100 * n / (a.w * a.h)).toFixed(1) } : { changed: 0 };
};
await page.evaluate(() => __hc.hold(null)); await page.waitForTimeout(600);
const empty = await grab();
console.log('empty hand: frame', empty.w + 'x' + empty.h);
for (const id of IDS){
  await page.evaluate(i => __hc.hold(i), id); await page.waitForTimeout(700);
  const held = await grab();
  console.log(' ', id.padEnd(16), JSON.stringify(diff(empty, held)));
  await page.screenshot({ path: path.join(OUT, 'bs-' + id + '.png') });
}
await b.close(); server.kill();
