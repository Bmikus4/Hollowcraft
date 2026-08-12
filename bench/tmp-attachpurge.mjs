// The attachment items are gone: no ITEMS entry, no recipe, nothing left holding a reference.
//   node bench/tmp-attachpurge.mjs
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
const page = await b.newPage({ viewport: { width: 1024, height: 640 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()", null, { timeout: 420000 });
const DEAD = ['dot_sight','suppressor','ar15_dot','ar15_suppressed','ar15_suppressed_dot','minigun_dot',
  'minigun_suppressed','minigun_suppressed_dot','hunting_rifle_dot','hunting_rifle_suppressed',
  'hunting_rifle_suppressed_dot','revolver_suppressed','shotgun_suppressed'];
const r = await page.evaluate(dead => {
  const out = { stillItems: [], stillCraftable: [], recipesReferencing: [] };
  for (const id of dead){
    if (__hc.itemInfo(id)) out.stillItems.push(id);
    const c = __hc.canCraft(id); if (c && c.found) out.stillCraftable.push(id);
  }
  // a recipe that CONSUMES a deleted item is just as broken as one that makes it
  out.recipesReferencing = __hc.recipeRefs ? __hc.recipeRefs(dead) : 'no probe';
  out.dockGone = typeof __hc.dockInfo === 'undefined';
  out.baseGunsStillCraftable = ['ar15','revolver','shotgun','minigun'].filter(id => (__hc.canCraft(id)||{}).found);
  return out;
}, DEAD);
console.log(JSON.stringify(r, null, 1));
console.log('pageerrors:', errs.length ? errs : 'none');
await b.close(); server.kill();
