// ASSERT: there is no offhand, and the second primary is worn on the back.
// Ben 2026-08-12: "i want to remove the offhand completely" / "deleting it does not delete the second gun slot, it deletes
// just off hand mechanics. secondary guns should be worn on the back".
//
// This replaces seven benches that existed only to test the mechanic (assert-offhand-{state,use,items,recoil,sway},
// assert-ads-offhand, assert-akimbo-feel, assert-dual-guns, assert-shield-kind-sway, assert-tps-shield — all retired in
// the same commit, recoverable from git). A removal needs a test as much as a feature does: the mechanic reached the
// viewmodel, the click routing, the crosshair, the sway, the equip rules and the HUD, and any one of those coming back
// alone would be a half-restored second hand nobody asked for.
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
  const out = {};
  // 1. The old way in: put a gun in hand and press F. That used to move the stack to the left hand and arm a use mode.
  __hc.hold('ar15'); await sleep(400);
  const heldBefore = __hc.offhandUse();
  __hc.key('KeyF', true); await sleep(250); __hc.key('KeyF', false); await sleep(400);
  out.afterF = __hc.offhandUse();
  out.heldStillThere = heldBefore.held === out.afterF.held;
  // 2. The slot refuses hand items and takes an instrument. eqAsk is eqAccepts, the rule the cursor and shift-click share.
  // eqAsk reports BOTH rules: `accepts` is what the cursor allows into the slot, `target` is where shift-click sends the
  // item. They have to agree — a target of 4 with accepts:false is an item shift-clicked into a slot that refuses it.
  const ask = id => { const a = __hc.eqAsk(4, id); return { accepts: a.accepts, target: a.target }; };
  out.asks = { gun: ask('ar15'), shield: ask('shield'), torch: ask('torch'), compass: ask('compass_item') };
  // 3. Force one in anyway, the way a save from before this change would: nothing may reach the left hand.
  __hc.eqPut(4, 'ar15'); await sleep(500);
  out.forced = __hc.offhandUse();
  __hc.key('KeyF', true); await sleep(200); __hc.key('KeyF', false); await sleep(400);
  out.forcedAfterF = __hc.offhandUse();
  out.ring = __hc.xh ? __hc.xh() : null;
  __hc.eqPut(4, null); await sleep(300);
  // 4. The second primary rides the back: hold slot 0, put a rifle in slot 1, and read the worn models.
  __hc.qSet('inv', 0, 'revolver', 1); __hc.qSet('inv', 1, 'ar15', 1); __hc.sel(0); await sleep(700);
  out.slung = (__hc.pview(Math.PI, 240) || {}).slung || null;
  __hc.sel(1); await sleep(700);
  out.slungWhileHolding = (__hc.pview(Math.PI, 240) || {}).slung || null;
  return out;
});

let pass = 0, fail = 0;
const t = (name, ok, got) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '   ' + got); };
t('F does not move the held gun anywhere', r.heldStillThere && r.afterF.off === null,
  'held=' + r.afterF.held + ' slot=' + r.afterF.off);
t('F arms no use mode', r.afterF.acting === false && r.afterF.inHand === false, 'acting=' + r.afterF.acting + ' inHand=' + r.afterF.inHand);
t('the slot refuses a gun, a shield and a torch', !r.asks.gun.accepts && !r.asks.shield.accepts && !r.asks.torch.accepts, JSON.stringify(r.asks));
t('and nothing is shift-clicked into it either', r.asks.gun.target !== 4 && r.asks.shield.target !== 4 && r.asks.torch.target !== 4,
  'targets gun=' + r.asks.gun.target + ' shield=' + r.asks.shield.target + ' torch=' + r.asks.torch.target);
t('and it accepts an instrument', r.asks.compass.accepts === true, 'compass accepts=' + r.asks.compass.accepts);
t('a gun forced into the slot reaches no hand', r.forced.offViewId == null && r.forced.inHand === false && r.forced.hudCell === false,
  'offViewId=' + r.forced.offViewId + ' inHand=' + r.forced.inHand + ' hudCell=' + r.forced.hudCell);
t('and F cannot wake it', r.forcedAfterF.acting === false, 'acting=' + r.forcedAfterF.acting);
t('the unheld primary is slung on the back', !!r.slung && r.slung.id === 'ar15' && r.slung.cz > 0.12,
  r.slung ? (r.slung.id + ' at z=' + r.slung.cz + ', ' + r.slung.h + ' tall') : 'nothing slung');
t('and the one in your hands is not', !r.slungWhileHolding || r.slungWhileHolding.id === 'revolver',
  r.slungWhileHolding ? r.slungWhileHolding.id : 'nothing slung (both primaries accounted for)');
t('no page errors', errs.length === 0, errs.join(' | '));
console.log(pass + '/' + (pass + fail));
await b.close(); server.kill();
process.exit(fail ? 1 : 0);
