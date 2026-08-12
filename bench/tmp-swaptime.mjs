// How long does it take to switch guns? Ben 08-12: "guns in a a secondary slot take a second to switch between".
// setViewItem rebuilds the view model from scratch on every id change, so this times the REAL call the number keys and
// the wheel make, first build and repeat, per gun.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft';
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForTimeout(4000);

const rows = await page.evaluate(async () => {
  const guns = ['ar15', 'revolver', 'shotgun', 'hunting_rifle', 'minigun'];
  const out = [];
  const time = id => { const t = performance.now(); __hc.hold(id); return performance.now() - t; };
  // WHAT THE WARM PATH IS WORTH: put each gun in primary slot 0 the way a player would, let warmPrimaries' timer run,
  // and then time the first switch to it. Without that step this column is the cold build.
  for (const id of guns) { __hc.qSet('inv', 0, id, 1); }
  await new Promise(r => setTimeout(r, 1500));
  for (const id of guns) {
    __hc.hold('stick'); await new Promise(r => setTimeout(r, 120));
    const first = time(id);
    __hc.hold('stick'); await new Promise(r => setTimeout(r, 120));
    const again = time(id);
    // The swap Ben describes: two guns in the two primaries, pressing 1 and 2.
    let swap = 0; for (let i = 0; i < 4; i++){ __hc.hold(i % 2 ? 'ar15' : id); swap += 0; }
    const t0 = performance.now();
    for (let i = 0; i < 4; i++) __hc.hold(i % 2 ? 'ar15' : id);
    swap = (performance.now() - t0) / 4;
    out.push({ id, first: +first.toFixed(1), again: +again.toFixed(1), swap: +swap.toFixed(1) });
  }
  return out;
});
console.log('gun'.padEnd(16) + 'first(ms)'.padStart(10) + 'repeat(ms)'.padStart(11) + 'per swap(ms)'.padStart(13));
for (const r of rows) console.log(r.id.padEnd(16) + String(r.first).padStart(10) + String(r.again).padStart(11) + String(r.swap).padStart(13));
// 5ms is a third of a frame. Cold builds were 14-82ms before warmPrimaries; if this line fails, the warm path stopped
// running (it hangs off refreshHotbar) and the stall is back on the number keys.
const worst = Math.max(...rows.map(r => r.first));
console.log((worst <= 5 ? 'PASS' : 'FAIL') + '  no cold build on a primary swap: worst first switch ' + worst + 'ms');
process.exit(worst <= 5 ? 0 : 1);
await b.close(); server.kill();
