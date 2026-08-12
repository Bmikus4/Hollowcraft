// How far a one-second burst walks the aim, per gun. Recoil is a claim about where the crosshair ends up.
//   node bench/tmp-recoil.mjs
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
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()", null, { timeout: 420000 });
await page.evaluate("__hc.lock(true); __hc.freezeAnimals(true);");
// rounds a one-second burst puts out, from each gun's own rate of fire, so the comparison is per SECOND and not per shot
const GUNS = [['ar15',10],['ak',10],['smg',15],['machine_pistol',17],['bullpup',12],['minigun',38],['shotgun',1],['hunting_rifle',1]];
for (const [id, n] of GUNS){
  const r = await page.evaluate(async ([id, n]) => {
    __hc.hold(id); __hc.giveItem('rifle_ammo', 200); __hc.giveItem('pistol_ammo', 200); __hc.giveItem('buckshot', 60);
    // PITCH BACK TO LEVEL FIRST. Without this the climb accumulates across the whole run and the aim hits the look
    // clamp near 90 degrees: every gun after the third measured 0 degrees of recoil, which reads as no recoil at all.
    const st = __hc.st(); __hc.tp(st.pos ? st.pos[0] : 0, st.pos ? st.pos[1] : 70, st.pos ? st.pos[2] : 0, 0, 0);
    await new Promise(r2 => setTimeout(r2, 400));
    const p0 = __hc.sight().pitch;
    let fired = 0;
    for (let i = 0; i < n; i++){ if (__hc.shoot() === true) fired++; await new Promise(r2 => setTimeout(r2, 1000 / n)); }
    return { fired, climbDeg: +((__hc.sight().pitch - p0) * 57.2958).toFixed(2) };
  }, [id, n]);
  console.log(`${id.padEnd(16)} ${String(r.fired).padStart(3)} rounds in 1s -> aim climbed ${r.climbDeg} deg`);
}
console.log('pageerrors:', errs.length ? errs : 'none');
await b.close(); server.kill();
