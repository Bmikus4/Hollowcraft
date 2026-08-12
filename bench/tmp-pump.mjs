// The 12 gauge cycles between shots: does the rack gate the trigger, and does the forend move?
//   node bench/tmp-pump.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft', OUT = path.join(ROOT, 'bench/results/pump');
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
await page.evaluate("__hc.lock(true); __hc.pinScene(); __hc.freezeAnimals(true);");
await page.evaluate("__hc.setTime(0.27)"); await page.waitForTimeout(1800);
await page.evaluate(() => { __hc.hold('shotgun'); __hc.giveItem('buckshot', 32); });
await page.waitForTimeout(700);

// RATE OF FIRE: pull the trigger as fast as a loop can and count what actually goes off. Before the cycle existed
// this returned one shot per call and emptied the tube instantly.
const burst = await page.evaluate(() => { let fired = 0; for (let i = 0; i < 8; i++) if (__hc.shoot() === true) fired++; return fired; });
console.log('shots from 8 immediate trigger pulls:', burst, '(1 = the rack is gating it)');

// THE STROKE, sampled through one cycle. pumpZ is the forend's own z, so a still animation reads as one number.
await page.evaluate(() => { __hc.shoot(); });
const track = [];
for (let i = 0; i < 12; i++){
  track.push(await page.evaluate(() => ({ t: +(__hc.sight().boltT), z: __hc.pumpZ(), p: +(__hc.pumpState ? __hc.pumpState() : 0) })));
  await page.screenshot({ path: path.join(OUT, 'stroke-' + String(i).padStart(2, '0') + '.png'), clip: { x: 420, y: 180, width: 620, height: 460 } });
  await page.waitForTimeout(60);
}
console.log('forend z through the cycle:', JSON.stringify(track.map(t => t.z)));
console.log('pumpT through the cycle:   ', JSON.stringify(track.map(t => t.p)));
console.log('pageerrors:', errs.length ? errs : 'none');
await b.close(); server.kill();
