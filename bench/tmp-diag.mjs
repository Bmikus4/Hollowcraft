// Scratch: boot the game headless and ask it questions. No screenshots — this is for the answers a picture cannot
// give (does the item exist, did its icon bake, did anything throw on the way up).
//   node bench/tmp-diag.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft';
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu','--use-angle=d3d11','--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[error]', m.text().slice(0, 200)); });
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForTimeout(9000);
const IDS = (process.env.IDS || 'avocado,pizza,radio,hunting_knife,bayonet,frying_pan,tent,wooden_torch,dock_long,water_bottle,apple,ar15').split(',');
console.log(JSON.stringify(await page.evaluate(ids => {
  const out = {};
  for (const id of ids){ try { out[id]={give:__hc.giveItem(id,1), box:__hc.heldBox(id)}; } catch (e){ out[id] = 'THREW ' + String(e.message).slice(0,60); } }
  out._dock = __hc.dockInfo();
  const mp=__hc.modelPack(); out._missing = (mp.missing||[]).length + ": " + (mp.missing||[]).slice(0,6).join(",");
  return out;
}, IDS), null, 1));

await b.close(); server.kill();
