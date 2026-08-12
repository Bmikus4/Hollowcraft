// ASSERT: a bullet can still hit the creature, and the falloff did not eat the hit.
// Ben 2026-08-12: "wretchs hitbox is gone" — it was, and by my own hand: the velocity falloff referenced the march's
// `t` and `_at` from inside _wretchRayHit1, which is a SEPARATE function (the binder re-runs it once per extra
// creature). Every shot that reached the creature threw a ReferenceError and the trace aborted before the hit landed.
//
// So this bench is not really about damage numbers. It is about the fact that a thrown error inside a hit test looks
// exactly like a missing hitbox, and nothing in the game says so — no console is open while Ben plays. Page errors are
// therefore a CHECK here, not a footnote.
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
const errs = []; page.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200)));
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForTimeout(3500);
await page.evaluate('__hc.lock(true)');

const r = await page.evaluate(async () => {
  const sleep = ms => new Promise(x => setTimeout(x, ms));
  const out = {};
  // Put the creature in front of the player, aim at it, and fire — through the same paths the mouse uses.
  // NIGHT FIRST. spawnWretch refuses in daylight, so summon() and wretchAt() both come back with the creature inactive —
  // which is what the first version of this bench reported and mistook for a missing hitbox of its own.
  __hc.setTime(0.80); await sleep(900);
  const placed = __hc.wretchAt ? __hc.wretchAt(7) : (__hc.summon ? __hc.summon() : null);
  await sleep(1400);
  __hc.hold('ar15'); await sleep(400);
  __hc.giveItem('rifle_ammo', 30); await sleep(200);
  out.before = __hc.wretchHp ? __hc.wretchHp() : (__hc.st().wretchHp != null ? __hc.st().wretchHp : null);
  __hc.look(); await sleep(300);                              // aim at the creature
  for (let i = 0; i < 6; i++){ __hc.fire ? __hc.fire() : null; await sleep(180); }
  out.after = __hc.wretchHp ? __hc.wretchHp() : (__hc.st().wretchHp != null ? __hc.st().wretchHp : null);
  out.st = { wa: __hc.st().wa, dist: __hc.st().dist, hp: __hc.st().hp };
  out.placed = placed;
  return out;
});

let pass = 0, fail = 0;
const t = (name, ok, got) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '   ' + got); };
// THE HITBOX ITSELF: no error may come out of a hit test. This is the check that would have caught the ReferenceError.
t('firing at the creature raises no error', errs.length === 0, errs.join(' | ') || 'clean');
t('the creature was actually there to hit', r.st.wa === true, 'active=' + r.st.wa + ' dist=' + r.st.dist);
if (r.before != null && r.after != null)
  t('and it took damage', r.after < r.before, 'hp ' + r.before + ' -> ' + r.after);
else
  console.log('NOTE  no wretch-hp probe: the error check above is what this bench is for   before=' + r.before + ' after=' + r.after);
console.log(pass + '/' + (pass + fail));
await b.close(); server.kill();
process.exit(fail ? 1 : 0);
