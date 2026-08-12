// What size the worn models actually come out, against the torso they are fitted to, plus a shot of each.
// Ben 08-12: "backpacks are wayy to tiny on the back" and "iron and leather chestpieces are rotated the wrong way,
// and also they need to make sure the body doesnt clip through them".
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft', OUT = path.join(ROOT, 'bench', 'results');
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const waitHttp = u => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > 20000 ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port; await waitHttp(base + '/index.html');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio'] });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForTimeout(3000);
await page.evaluate('__hc.eqUI("inv")'); await page.waitForTimeout(600);

const shots = [];
// The slung gun is not an armour slot: it is the primary you are NOT holding, so it is set up by putting a rifle in
// primary 2 and selecting primary 1. Driven through the same probe so the shot and the numbers come from one place.
const slungShots = [];
for (const gun of ['ar15', 'hunting_rifle']) {
  await page.evaluate(async g => { __hc.eqPut(5, null); __hc.eqPut(1, null);
    __hc.qSet('inv', 1, g, 1); __hc.sel(0); await new Promise(r => setTimeout(r, 700)); }, gun);
  for (const yaw of [Math.PI, Math.PI / 2]) {
    await page.evaluate(y => __hc.pview(y, 620), yaw);
    const box = await page.evaluate(() => { const r = document.getElementById('pview').getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height }; });
    const nm = 'worn-slung-' + gun + '-' + Math.round(yaw * 57) + '.png';
    await page.screenshot({ path: path.join(OUT, nm), clip: box }); slungShots.push(nm);
  }
  console.log(('slung ' + gun).padEnd(19) + JSON.stringify(await page.evaluate(() => { const p = __hc.pview(Math.PI, 620); return { slung: p.slung || null }; })));
}
await page.evaluate(() => { __hc.qSet('inv', 1, null); });
for (const [slot, id] of [[5, 'backpack'], [5, 'field_pack'], [5, 'alice_pack'], [1, 'leather_chestplate'], [1, 'iron_chestplate']]) {
  const st = await page.evaluate(async ([slot, id]) => {
    __hc.eqPut(5, null); __hc.eqPut(1, null);
    __hc.eqPut(slot, id); await new Promise(r => setTimeout(r, 700));
    return __hc.pview(slot === 5 ? Math.PI : 0, 620);          // packs from behind, chest pieces from the front
  }, [slot, id]);
  const m = st.wornPack || st.shell;
  console.log(id.padEnd(19) + (m ? ('w=' + m.w + ' h=' + m.h + ' d=' + m.d + '  top=' + m.top + ' bot=' + m.bot + ' cz=' + m.cz
    + (st.shell ? ('  rot=' + JSON.stringify(st.shell.rot)) : '')) : 'NO MODEL (procedural fallback)'));
  for (const yaw of (slot === 5 ? [Math.PI, Math.PI / 2] : [0, Math.PI / 2])) {
    await page.evaluate(y => __hc.pview(y, 620), yaw);
    const box = await page.evaluate(() => { const r = document.getElementById('pview').getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height }; });
    const nm = 'worn-' + id + '-' + Math.round(yaw * 57) + '.png';
    await page.screenshot({ path: path.join(OUT, nm), clip: box }); shots.push(nm);
  }
}
console.log('torso ' + JSON.stringify(await page.evaluate(() => __hc.pview(0, 620).torso)));
console.log(slungShots.concat(shots).join(' '));
await b.close(); server.kill();
