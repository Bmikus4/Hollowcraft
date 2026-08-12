// ASSERT: turning is the head first and the body after — Tarkov's rule, which Ben asked for verbatim:
// "when turning the head initially, it should be fine, but eventually it should start to show resistance to turn
// further... the goal is to get tarkov movement virbatim here".
//
// So the shape under test is not a limit, it is a CHANGE in limit. Inside the neck's arc the camera must be free; past
// it the shoulders have to come round and the rate falls to a body's. Four things have to hold at once:
//   1. inside the arc a flick is unresisted   — otherwise every small correction feels like sludge
//   2. past it the sweep slows to the body     — otherwise you can still spin
//   3. nothing is lost either way              — otherwise fast aim is silently inconsistent
//   4. the arc comes back when you stop        — otherwise the resistance is permanent, not positional
//
// Driven through _lookDX (the field the pointer-lock handler fills), never by writing player.yaw: the ease, the cap and
// the body-follow all live between the two.
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
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
await page.goto(base + '/index.html?debug=1', { waitUntil: 'load' });
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()", null, { timeout: 300000 });
await page.waitForTimeout(3000);
await page.evaluate('__hc.lock(true)');

// A trace of yaw against the wall clock, sampled off the running frame loop.
const trace = async (dx, ms) => page.evaluate(async ([dx, ms]) => {
  // ZERO THE PENDING DELTA FIRST. A capped flick leaves the rest of its input queued -- that is the momentum -- so a
  // second trace run on top of it measures the first one's tail. lookInject reports the pending pair; injecting its
  // negation cancels it exactly.
  const p = __hc.lookInject(0, 0); __hc.lookInject(-p.dx, -p.dy);
  __hc.cam({ yaw: 0, pitch: 0 }); await new Promise(r => setTimeout(r, 200));
  // THE BASELINE IS TAKEN BEFORE THE INJECTION. Sampling starts one interval later, so a baseline read from the first
  // sample silently drops whatever the first frame already turned -- which is the largest step of the whole flick, and
  // made an exactly-conserved flick look 11 degrees short.
  const out = [[0, __hc.cam().yaw]];
  const t0 = performance.now();
  __hc.lookInject(dx, 0);
  // ONE SAMPLE PER FRAME, via rAF. setInterval(16) drifts under load: three frames can pass between two samples, and
  // then one sample's delta is three frames of turning and no per-frame bound can be checked from outside at all.
  return await new Promise(res => {
    const tick = () => { out.push([+(performance.now() - t0).toFixed(1), __hc.cam().yaw]);
      if (performance.now() - t0 > ms) res(out); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}, [dx, ms]);

const unwrap = rows => { let last = rows[0][1], acc = 0; const out = [];
  for (const [t, y] of rows) { let d = y - last; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; acc += d; last = y; out.push([t, acc]); }
  return out; };
// OVER A WINDOW, NOT BETWEEN SAMPLES. The cap is per frame, and a headless frame can take 150ms, so one legitimate
// step read across a 16ms sample looks like 70 rad/s. 150ms is long enough to span a slow frame and short enough that a
// real spin cannot hide inside it.
const peakRate = (rows, win = 150) => { let p = 0;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const dt = (rows[j][0] - rows[i][0]) / 1000; if (dt < win / 1000) continue;
    p = Math.max(p, Math.abs(rows[j][1] - rows[i][1]) / dt); break; }
  return p; };
const timeTo = (rows, target) => { for (const [t, a] of rows) if (Math.abs(a) >= target) return t; return Infinity; };

const caps = await page.evaluate('__hc.lookInject(0,0)');
const c0 = (await page.evaluate('__hc.lookInject(0,0)')).clamped;
const big = unwrap(await trace(-30000, 1600));      // an absurd swipe: many turns' worth of input in one event
const cBig = (await page.evaluate('__hc.lookInject(0,0)')).clamped - c0;
const bigLead = await page.evaluate('__hc.lookInject(0,0)');
// CANCEL THE LEFTOVER INPUT before asking whether the shoulders catch up. A capped flick keeps its remainder pending --
// that is the momentum -- so with 300 radians still queued the head keeps turning at the body's rate and the lead stays
// pinned open forever. The first version of this check read that and called the follow broken.
await page.evaluate(() => { const p = __hc.lookInject(0, 0); __hc.lookInject(-p.dx, -p.dy); });
await page.waitForTimeout(1400);                    // let the shoulders catch up
const settled = await page.evaluate('__hc.lookInject(0,0)');
const c1 = settled.clamped;
const small = unwrap(await trace(-260, 700));       // a flick inside the neck's arc (33 degrees of a 36 degree neck)
const cSmall = (await page.evaluate('__hc.lookInject(0,0)')).clamped - c1;
const pend = await page.evaluate('__hc.lookInject(0,0)');

let pass = 0, fail = 0;
const t = (name, ok, got) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '   ' + got); };
const step = rows => { let m = 0; for (let i = 1; i < rows.length; i++) m = Math.max(m, Math.abs(rows[i][1] - rows[i - 1][1])); return m; };
const rateOver = (rows, fromMs) => { const a = rows.find(r => r[0] >= fromMs), b = rows[rows.length - 1];
  return a && b && b[0] > a[0] ? Math.abs(b[1] - a[1]) / ((b[0] - a[0]) / 1000) : 0; };
const smallTotal = Math.abs(small[small.length - 1][1]), asked = Math.abs(-260 * caps.sens);
const bigTotal = Math.abs(big[big.length - 1][1]);
t('the model is head-then-body', caps.capFree > caps.capBody * 3 && caps.freeArc > 0.3 && caps.follow > 0,
  'free=' + caps.capFree + ' rad/s inside ' + (caps.freeArc * 57.3).toFixed(0) + ' degrees, body=' + caps.capBody + ', follow=' + caps.follow);
// INSIDE THE ARC: the only thing shaping the motion is the ease, so it must move faster than a body ever could.
// CLAMP COUNT, not rate: a 33 degree flick is too small to ever reach the body's rad/s, so comparing rates could only
// ever fail. What "unresisted" means exactly is that the limit never bound — and the game counts that itself.
t('inside the neck, nothing is clamped at all', cSmall === 0, 'clamped frames=' + cSmall + ' over a ' + (asked * 57.3).toFixed(0) + ' degree flick');
t('past the neck, the limit does bind', cBig > 10, 'clamped frames=' + cBig);
// PAST IT: measured LATE in the sweep, once the lead has opened past the arc — early frames are legitimately free.
t('past the neck, it slows to the shoulders', rateOver(big, 700) <= caps.capBody * 1.35,
  'late sweep ' + rateOver(big, 700).toFixed(2) + ' rad/s vs body ' + caps.capBody);
t('and it never jumps a frame', step(big) <= caps.capFrame * 1.05,
  'worst frame ' + (step(big) * 57.3).toFixed(1) + ' degrees, ceiling ' + (caps.capFrame * 57.3).toFixed(1));
t('a huge flick keeps sweeping instead of snapping', bigTotal > Math.PI && step(big) * 12 < bigTotal,
  'delivered=' + bigTotal.toFixed(2) + ' rad, worst step ' + step(big).toFixed(3));
const owed = Math.abs(pend.dx * caps.sens);
t('a flick loses nothing: turned + owed = asked', Math.abs(smallTotal + owed - asked) < asked * 0.05,
  'asked=' + (asked * 57.3).toFixed(1) + ' turned=' + (smallTotal * 57.3).toFixed(1) + ' owed=' + (owed * 57.3).toFixed(1) + ' degrees');
t('the shoulders open a lead, then close it', Math.abs(bigLead.lead) > caps.freeArc * 0.8 && Math.abs(settled.lead) < 0.06,
  'lead during=' + (bigLead.lead * 57.3).toFixed(1) + ' after=' + (settled.lead * 57.3).toFixed(1) + ' degrees');
t('no page errors', errs.length === 0, errs.join(' | '));
console.log(pass + '/' + (pass + fail));
await b.close(); server.kill();
process.exit(fail ? 1 : 0);
