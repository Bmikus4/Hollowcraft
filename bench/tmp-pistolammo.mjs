// Does the pistol round exist, craft, and get eaten by the guns that are supposed to eat it?
//   node bench/tmp-pistolammo.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft';
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()", null, { timeout: 420000 });

const r = await page.evaluate(() => {
  const p = __hc.itemInfo('pistol_ammo'), rf = __hc.itemInfo('rifle_ammo');
  return {
    item: p && { name: p.name, max: p.max, size: p.size, gridMax: p.gridMax },
    craft: __hc.canCraft('pistol_ammo'),
    craftRifle: __hc.canCraft('rifle_ammo'),              // the recipe it could have shadowed
    // the two ammo icons must not be the same picture: buckshot's split was caught by exactly this test
    iconSameAsRifle: !!(p && rf && p.icon === rf.icon),
    feed: __hc.ammoOf(),
  };
});
console.log(JSON.stringify(r, null, 1));

// The icons, blown up 8x with smoothing off and laid side by side. "They are different pictures" is a hash
// comparison; whether a pistol round READS as a pistol round at 16px is only answerable by looking at it.
const sheet = await page.evaluate(async () => {
  const ids = ['rifle_ammo', 'pistol_ammo', 'buckshot'], S = 8, cv = document.createElement('canvas');
  cv.width = 16 * S * ids.length + 20 * (ids.length + 1); cv.height = 16 * S + 40;
  const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false;
  cx.fillStyle = '#2b2b30'; cx.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < ids.length; i++){
    const im = new Image(); im.src = __hc.itemInfo(ids[i]).icon;
    await im.decode();
    const x = 20 + i * (16 * S + 20);
    cx.drawImage(im, x, 20, 16 * S, 16 * S);
    cx.fillStyle = '#ddd'; cx.font = '14px monospace'; cx.fillText(ids[i], x, 14);
  }
  return cv.toDataURL('image/png');
});
fs.writeFileSync(path.join(ROOT, 'bench/results/ammo-icons.png'), Buffer.from(sheet.split(',')[1], 'base64'));
console.log('icons in bench/results/ammo-icons.png');
console.log('pageerrors:', errs.length ? errs : 'none');
await b.close(); server.kill();
