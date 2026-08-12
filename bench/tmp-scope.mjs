// The bolt rifle's scope: the whole gun at the hip, and the aimed frame at full ADS where the PiP shows.
//   node bench/tmp-scope.mjs [id]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft', OUT = path.join(ROOT, 'bench/results/scope');
const IDS = (process.argv[2] || 'hunting_rifle,marksman_rifle,forest_rifle,chassis_rifle').split(',');
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
fs.mkdirSync(OUT, { recursive: true });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu','--use-angle=d3d11','--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()", null, { timeout: 420000 });
await page.evaluate(() => { for (const id of ['bgvid','menufx']){ const e = document.getElementById(id); if (e) e.style.display = 'none'; } });
await page.evaluate("__hc.lock(true); __hc.pinScene(); __hc.freezeAnimals(true); __hc.freeze(true,false);");
await page.evaluate("__hc.setTime(0.27)"); await page.waitForTimeout(2200);
for (const id of IDS){
  await page.evaluate(i => __hc.hold(i), id);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, id + '-hip.png'), clip: { x: 500, y: 200, width: 1050, height: 680 } });
  await page.mouse.move(800, 450); await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(1800);
  // THE PICTURE FIRST. scopeState() drives updateView itself with rmbHeld from its own argument, so calling it
  // with no argument un-aims the rifle — the first run of this harness photographed a hip pose and reported
  // adsT 1 from sight() in the same breath.
  await page.screenshot({ path: path.join(OUT, id + '-ads.png'), clip: { x: 400, y: 100, width: 800, height: 700 } });
  const s = await page.evaluate(() => ({ sight: __hc.sight(), pip: __hc.scopeState(null, true) }));
  console.log(id, JSON.stringify(s));
  const rt = await page.evaluate(() => __hc.scopeShot());
  if (rt && rt.png){ fs.writeFileSync(path.join(OUT, id + '-rt.png'), Buffer.from(rt.png.split(',')[1], 'base64'));
    delete rt.png; }
  console.log('  RT', JSON.stringify(rt));
  console.log('  align', JSON.stringify(await page.evaluate(() => __hc.holoAlign())));
  const parts = await page.evaluate(() => __hc.viewParts());
  for (const p2 of parts) console.log('  part', JSON.stringify(p2));
  await page.mouse.up({ button: 'right' }); await page.waitForTimeout(300);
}
console.log('pageerrors:', errs.length ? errs : 'none');
await b.close(); server.kill();
