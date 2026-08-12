// ASSERT: the head has weight. Ben 08-12: "there needs to be turning resistance too, the player should not be able to
// spin/turn around immediatley".
//
// Driven through _lookDX (the same field the pointer-lock handler fills), never by writing player.yaw: the ease and the
// rate cap both live between the two, so a probe that sets the angle measures nothing.
//
// Three things have to hold at once, and any one alone is a bad camera:
//   1. a huge flick cannot exceed the cap  — otherwise you can spin
//   2. it still DELIVERS its full angle    — otherwise fast aim silently loses travel, which is worse than heavy aim
//   3. a small flick still lands fast      — otherwise the camera is sludge
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
const big = unwrap(await trace(-30000, 1400));      // an absurd swipe: many turns' worth of input in one event
const small = unwrap(await trace(-260, 700));       // a normal flick
const pend = await page.evaluate('__hc.lookInject(0,0)');   // whatever of it has not arrived yet

let pass = 0, fail = 0;
const t = (name, ok, got) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '   ' + got); };
const bigPeak = peakRate(big), bigTotal = Math.abs(big[big.length - 1][1]);
const step = rows => { let m = 0; for (let i = 1; i < rows.length; i++) m = Math.max(m, Math.abs(rows[i][1] - rows[i - 1][1])); return m; };
// WALL-CLOCK THRESHOLDS DO NOT SURVIVE THIS HARNESS. Headless runs at 15-30fps and the loop clamps dt, so sim time and
// real time diverge and "180 degrees in 500ms" measures the frame rate, not the camera. These four hold at ANY frame
// rate, because each is a property of one step or of the total.
const smallTotal = Math.abs(small[small.length - 1][1]);
const asked = Math.abs(-260 * caps.sens);
// One rAF sample per frame, so this is a real per-frame bound: the thing it forbids is a flick arriving in one step.
t('no frame turns you more than the frame ceiling', step(big) <= caps.capFrame * 1.05,
  'worst sample=' + (step(big) * 57.3).toFixed(1) + ' degrees, ceiling ' + (caps.capFrame * 57.3).toFixed(1) + ' per frame');
t('the sustained sweep is under the rad/s cap', bigPeak <= caps.capHip * 1.15,
  'sustained=' + bigPeak.toFixed(2) + ' rad/s vs cap ' + caps.capHip);
t('a huge flick keeps sweeping instead of snapping', bigTotal > Math.PI && step(big) * 12 < bigTotal,
  'delivered=' + bigTotal.toFixed(2) + ' rad over ' + big.length + ' samples, worst step ' + step(big).toFixed(3));
// CONSERVATION, not elapsed time. The ease is asymptotic, so at the moment the trace stops some of the flick is still
// pending -- and that is exactly what makes this the honest check: turned + still-owed must equal what was asked, or the
// cap is eating travel and fast aim is quietly inconsistent.
const owed = Math.abs(pend.dx * caps.sens);
t('a flick loses nothing: turned + owed = asked', Math.abs(smallTotal + owed - asked) < asked * 0.03,
  'asked=' + (asked * 57.3).toFixed(1) + ' turned=' + (smallTotal * 57.3).toFixed(1) + ' owed=' + (owed * 57.3).toFixed(1) + ' degrees');
t('and it eases rather than jumping', step(small) < smallTotal * 0.5,
  'first step ' + (step(small) * 57.3).toFixed(1) + ' of ' + (smallTotal * 57.3).toFixed(1) + ' degrees');
t('no page errors', errs.length === 0, errs.join(' | '));
console.log(pass + '/' + (pass + fail));
await b.close(); server.kill();
process.exit(fail ? 1 : 0);
