// How deep is the water, and how far out, in each direction from spawn. The dock siting needs this fact and
// nothing else: "put it out over the ocean" is unanswerable without knowing where the ocean starts.
//   node bench/tmp-seaprofile.mjs
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
const page = await b.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()", null, { timeout: 420000 });
await page.waitForFunction("(()=>{try{return __hc.dockInfo().built!==undefined;}catch(e){return false;}})()", null, { timeout: 120000 });
const r = await page.evaluate(() => __hc.seaProfile());
for (const row of r.dirs){
  console.log(`dir ${row.dir}  firstWater ${row.first}  profile(depth every 4 blocks out to 200):`);
  console.log('   ' + row.depths);
}
console.log('spawn', r.spawn, 'sea', r.sea);
await b.close(); server.kill();
