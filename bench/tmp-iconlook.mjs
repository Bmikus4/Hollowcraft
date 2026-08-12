// Scratch: photograph the HOTBAR, which is where an item's baked icon can be looked at without the world.
//   IDS=ar15,revolver,iron_axe node bench/tmp-iconlook.mjs
//
// WHY NOT A WORLD SHOT: the icon is rendered by icon3DURL into its own target with its own lights, through the
// same materials the held model uses — so "is this gun black" is answerable here. It is also answerable when the
// world will not draw, which in this working copy it currently will not (headless; the game itself is fine).
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft', OUT = path.join(ROOT, 'bench/results/models');
const IDS = (process.env.IDS || process.argv[2] || 'ar15,revolver,shotgun,hunting_rifle,iron_axe,iron_pickaxe,hunting_knife,bayonet,backpack,field_pack').split(',');
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
await page.waitForTimeout(2500);
// One item per hotbar slot, then one photograph of the strip: nine icons side by side is the comparison, and a
// gun that is "a black square" is obvious next to an axe that is not.
await page.evaluate(ids => { ids.slice(0, 9).forEach(id => __hc.giveItem(id, 1)); }, IDS);
await page.waitForTimeout(1200);
// A clipped page shot, not an element shot: #hotbar is inside a pointer-events:none HUD layer that Playwright
// judges "not visible" and waits thirty seconds for.
const box = await page.evaluate(() => { const e = document.getElementById('hotbar'); if (!e) return null;
  const r = e.getBoundingClientRect(); return { x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: Math.min(1280, r.width + 16), height: Math.min(720, r.height + 16) }; });
if (box && box.width > 8) await page.screenshot({ path: path.join(OUT, 'icons-hotbar.png'), clip: box });
else console.log('no hotbar box', JSON.stringify(box));
// And the numbers behind the picture: mean luminance of each icon, so "dark" is a value and not an impression.
// Mean luminance per icon, so "dark" is a number and not an impression: each icon is drawn to a canvas and its
// non-transparent pixels averaged. A black square scores near 0; the axe beside it is the control.
console.log(JSON.stringify(await page.evaluate(async () => {
  const out = {};
  const imgs = [...document.querySelectorAll('#hotbar img')];
  for (let i = 0; i < imgs.length; i++){
    const im = imgs[i];
    if (!im.src || !im.naturalWidth) { out['slot' + i] = 'no image'; continue; }
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, n = 0;
    for (let p = 0; p < d.length; p += 4){ if (d[p+3] < 24) continue; sum += (d[p]*0.299 + d[p+1]*0.587 + d[p+2]*0.114); n++; }
    out['slot' + i] = { lum: n ? +(sum / n).toFixed(1) : null, px: n };
  }
  return out;
}), null, 1));
await b.close(); server.kill();
