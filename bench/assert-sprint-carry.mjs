// ASSERT: sprinting FOLDS the weapon into the chest, and lets it go the moment you aim.
// Ben 08-12 asked first for a cross-chest carry, then replaced it: "the weapon and arm should fold into the chest for the
// sprinting animation" — the cross-body sweep "is NOt a good animation for sprinting" and has gone to the attachment
// system as an inspect pose. So the shape under test is a FOLD: back and down, muzzle steeply lowered, and NOT a yaw
// across the body. Those two are easy to confuse in code and impossible to confuse in these numbers.
//
// The pose, not the latch: a boolean says the trigger fired, only the transform says the gun moved. And the aim case is
// the one that matters — a sprint-aim that keeps the cant is an aim that does not point where the sight says.
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
await page.evaluate("__hc.hold('ar15')");
await page.waitForTimeout(400);

// Sprinting is a key state plus real velocity, so it is driven by holding the keys the game listens to, not by poking
// player.sprint: the pose refuses to latch without onGround and >3 m/s, which is the guard that stops it flickering.
const run = async (ms, keys) => page.evaluate(async ([ms, keys]) => {
  for (const k of keys) __hc.key(k, true);
  await new Promise(r => setTimeout(r, ms));
  const s = __hc.swayMag();
  return s;
}, [ms, keys]);
const release = () => page.evaluate(() => { for (const k of ['KeyW', 'ShiftLeft']) __hc.key(k, false); });

const still = await page.evaluate('__hc.swayMag()');
const sprint = await run(1400, ['KeyW', 'ShiftLeft']);
const sprintAim = await page.evaluate(async () => { __hc.aim(true); await new Promise(r => setTimeout(r, 900)); const s = __hc.swayMag(); __hc.aim(false); return s; });
await release(); await page.waitForTimeout(900);
const after = await page.evaluate('__hc.swayMag()');

let pass = 0, fail = 0;
const t = (name, ok, got) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '   ' + got); };
t('the hand gains are the raised ones', still.hands.kick >= 0.36 && still.hands.lagX >= 0.12,
  'kick=' + still.hands.kick + ' lagY=' + still.hands.lagY + ' lagX=' + still.hands.lagX);
t('sprinting latches the carry', sprint.sprintT > 0.8, 'sprintT=' + sprint.sprintT + ' sprint=' + sprint.sprint + ' onGround=' + sprint.onGround);
// THE DROP, NOT THE Z. nearPlaneClear pushes the gun forward whenever its rear corner enters camera.near, so a fold that
// pulls it toward the chest is answered by the guard shoving it out — z is the guard's to own, and testing it here would
// be testing the near plane. A folded arm drops its elbow anyway; it does not pull straight back.
t('the gun drops into the chest', sprint.pose.y < still.pose.y - 0.10,
  'y ' + still.pose.y + ' -> ' + sprint.pose.y + '   (z ' + still.pose.z + ' -> ' + sprint.pose.z + ', near-plane guard owns z)');
t('the muzzle drops steeply', sprint.pose.rx < still.pose.rx - 0.35,
  'rx ' + still.pose.rx + ' -> ' + sprint.pose.rx);
// A FOLD, NOT A SWEEP: the old cross-chest pose was mostly yaw (0.60) with a big roll. If either grows past the pitch
// again, someone has put the inspect animation back on the sprint.
t('it is a fold and not a cross-body sweep', Math.abs(sprint.pose.ry - still.pose.ry) < Math.abs(sprint.pose.rx - still.pose.rx) * 0.6
  && Math.abs(sprint.pose.rz - still.pose.rz) < 0.25,
  'dry=' + (sprint.pose.ry - still.pose.ry).toFixed(2) + ' drz=' + (sprint.pose.rz - still.pose.rz).toFixed(2) + ' drx=' + (sprint.pose.rx - still.pose.rx).toFixed(2));
// CENTRED, not "further right": an aimed gun sits on the eye line, so its x is ~0 — the hip pose is the one out at
// +0.17. What this proves is that the cant is released, which is the part that would ruin an aim.
t('aiming gives it back even while sprinting', Math.abs(sprintAim.pose.rx) < 0.2 && Math.abs(sprintAim.pose.rz) < 0.15
  && Math.abs(sprintAim.pose.x) < 0.06,
  'aimed rx=' + sprintAim.pose.rx + ' rz=' + sprintAim.pose.rz + ' x=' + sprintAim.pose.x + ' (sprint x was ' + sprint.pose.x + ')');
t('and letting go of sprint returns the pose', after.sprintT < 0.1 && Math.abs(after.pose.rx - still.pose.rx) < 0.12,
  'sprintT=' + after.sprintT + ' rx ' + still.pose.rx + ' -> ' + after.pose.rx);
t('no page errors', errs.length === 0, errs.join(' | '));
console.log(pass + '/' + (pass + fail));
await b.close(); server.kill();
process.exit(fail ? 1 : 0);
