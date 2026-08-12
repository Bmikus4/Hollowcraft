// ASSERT: Z lies you down without turning you, and guns reach further than they did.
// Ben 2026-08-12: "z should lay the player down on the ground facing forward still" and "guns dont shoot far enough away".
//
// "Facing forward still" is the part a probe has to guard: going prone is a height and a speed, and if it ever becomes a
// rotation the player is looking somewhere else the moment they lie down. So the yaw is read before and after, to 4dp.
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
await page.waitForTimeout(3500);
await page.evaluate('__hc.lock(true)');

const r = await page.evaluate(async () => {
  const sleep = ms => new Promise(x => setTimeout(x, ms));
  // Everything through __hc.st(), which reports the posture flags, the camera height, the feet and the speed together —
  // read from separate probes they can be a frame apart, and a frame is the whole prone ease.
  const read = () => { const s = __hc.st(); return { prone: s.prone, sprint: s.sprint, speed: s.spd,
    camY: s.camY, feetY: s.feetY, yaw: +__hc.cam().yaw.toFixed(4), pitch: +__hc.cam().pitch.toFixed(4) }; };
  __hc.cam({ yaw: 1.2345, pitch: 0.1 }); await sleep(400);
  const up = read();
  __hc.key('KeyZ', true); await sleep(120); __hc.key('KeyZ', false); await sleep(900);
  const down = read();
  // Movement while prone, driven by the same keys the game reads.
  __hc.key('KeyW', true); __hc.key('ShiftLeft', true); await sleep(1200);
  const moving = read();
  __hc.key('KeyW', false); __hc.key('ShiftLeft', false); await sleep(400);
  // Space stands you up.
  __hc.key('Space', true); await sleep(150); __hc.key('Space', false); await sleep(900);
  const backUp = read();
  return { up, down, moving, backUp, ranges: __hc.st().gunRange };
});

let pass = 0, fail = 0;
const t = (name, ok, got) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '   ' + got); };
t('Z lies you down', r.down.prone === true, 'prone=' + r.down.prone);
t('the eye goes to the ground', (r.down.camY - r.down.feetY) < 0.6 && (r.up.camY - r.up.feetY) > 1.4,
  'eye above feet: standing ' + (r.up.camY - r.up.feetY).toFixed(2) + ' -> prone ' + (r.down.camY - r.down.feetY).toFixed(2));
// THE POINT OF THE INSTRUCTION: lying down is not a rotation.
t('and it does not turn you', r.down.yaw === r.up.yaw && r.down.pitch === r.up.pitch,
  'yaw ' + r.up.yaw + ' -> ' + r.down.yaw + '   pitch ' + r.up.pitch + ' -> ' + r.down.pitch);
t('prone crawls, and cannot sprint', r.moving.speed > 0.2 && r.moving.speed < 2.0 && r.moving.sprint === false,
  'speed=' + r.moving.speed + ' sprint=' + r.moving.sprint);
t('and crawling still does not turn you', r.moving.yaw === r.up.yaw, 'yaw ' + r.up.yaw + ' -> ' + r.moving.yaw);
t('Space stands you back up', r.backUp.prone === false && (r.backUp.camY - r.backUp.feetY) > 1.4,
  'prone=' + r.backUp.prone + ' eye above feet=' + (r.backUp.camY - r.backUp.feetY).toFixed(2));
// RANGE AND FALLOFF. Ben 08-12: the old maxima are where velocity starts to go, and the round flies well past them.
// The shape is what matters: flat to full range, then down to a floor, never to zero — a spent round still hurts.
const g = r.ranges, s2 = g && g.sample;
t('full power reaches at least 140 blocks', g && g.full.ar >= 140 && g.full.bolt >= 300,
  'full: ar=' + g.full.ar + ' revolver=' + g.full.revolver + ' bolt=' + g.full.bolt + ' shotgun=' + g.full.shotgun);
t('and the round flies well past that', g && g.mul >= 2, 'max = full x ' + g.mul + ' (ar ' + Math.round(g.full.ar * g.mul) + ' blocks)');
t('no loss at all inside full range', s2 && s2[0][1] === 1 && s2[2][1] === 1,
  s2 ? s2.slice(0, 3).map(x => x[0] + 'b:' + x[1]).join('  ') : '-');
t('then it falls off, and never to nothing', s2 && s2[3][1] < 1 && s2[3][1] > g.floor && s2[5][1] <= g.floor + 0.001 && g.floor > 0.2,
  s2 ? s2.slice(3).map(x => x[0] + 'b:' + x[1]).join('  ') + '  floor=' + g.floor : '-');
t('no page errors', errs.length === 0, errs.join(' | '));
console.log(pass + '/' + (pass + fail));
await b.close(); server.kill();
process.exit(fail ? 1 : 0);
