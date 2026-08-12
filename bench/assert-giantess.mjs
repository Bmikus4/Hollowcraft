// THE GIANTESS IS IN THE WORLD, RIGGED, BAREFOOT, AND SHE STANDS ON YOU.
//
// Every claim here is one a screenshot cannot make. She is 13 blocks tall, so a 720p frame taken anywhere
// near her is full of thigh — it cannot show whether the shoes came off, whether the three PNG maps bound
// or she is a white mannequin, whether the walk is bone-driven or a sliding statue, or whether the foot that
// came down landed where the damage was applied. All of that is numbers, read off the rig itself.
//
//   node bench/assert-giantess.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
const waitHttp = (u, t = 20000) => new Promise((res, rej) => { const t0 = Date.now(); (function p(){ const r = http.get(u, x => { x.resume(); res(); }); r.on('error', () => Date.now() - t0 > t ? rej(new Error('down')) : setTimeout(p, 250)); })(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
function findBrowser(){ for (const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if (fs.existsSync(p)) return p; throw new Error('no browser'); }

const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), NO_OPEN: '1' }, stdio: 'ignore' });
let browser, checks = 0, fails = 0;
const check = (n, ok, d) => { checks++; if (!ok) fails++; console.log((ok ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); };
try {
  const base = 'http://127.0.0.1:' + port;
  await waitHttp(base + '/index.html');
  browser = await chromium.launch({ executablePath: findBrowser(), headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--mute-audio', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', e => { errs.push(String(e.message || e)); console.log('  PAGEERROR:', String(e.message || e).slice(0, 200)); });
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
  await page.goto(base + '/index.html?perf=1&debug=1', { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, { timeout: 120000 });
  await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, { timeout: 240000 });
  await page.evaluate(`__hc.lock(true); __hc.setTime(0.85); __hc.cmdRun('/gamemode survival'); __hc.cmdRun('/heal 20');`);

  // ---- 1. the asset arrives at all -----------------------------------------------------------------
  // It loads OUTSIDE the boot race (8 MB), so "is she here" is a poll, and how long it took is worth printing.
  const t0 = Date.now();
  await page.waitForFunction(`(()=>{try{return __hc.girlState().loaded===true;}catch(e){return false;}})()`, null, { timeout: 90000 });
  check('the 8 MB GLB loads without blocking the boot', true, ((Date.now() - t0) / 1000).toFixed(1) + ' s after the world was playable');

  // ---- 2. the rig ----------------------------------------------------------------------------------
  const R = await page.evaluate(`__hc.girl(40)`);
  console.log('  ' + JSON.stringify(R.probe));
  check('she builds and spawns', R.ok === true, 'state ' + R.state);
  const P = R.probe || {};
  check('the skeleton is the file\'s, all 115 bones', P.bones === 115, P.bones + ' bones');
  check('every mesh is textured, not a white mannequin', P.meshes > 0 && P.mapped === P.meshes, P.mapped + '/' + P.meshes + ' meshes carry a baseColour map');
  check('NO SHOES — the mules node is not built', !!P.names && !P.names.some(n => /mule|shoe/i.test(n)), (P.names || []).join(', '));
  check('the loose export Planes are not in the world', !!P.names && !P.names.some(n => /^Plane/.test(n)), (P.names || []).length + ' meshes');
  check('MASSIVE — she stands over 12 blocks tall', P.height > 12 && P.height < 16, P.height + ' blocks (player is 1.8)');

  // ---- 3. the bone axis the walk cycle is built on -------------------------------------------------
  const AX = await page.evaluate(`__hc.girlAxis(0.5)`);
  console.log('  thigh sign: ' + JSON.stringify(AX));
  check('+X on a thigh swings the foot backwards (so a stride is -X)', AX.forward < 0, 'foot moved ' + AX.forward + ' blocks along her facing');

  // ---- 4. she walks — and the walk is the legs, not a slide ---------------------------------------
  const sample = () => page.evaluate(`(()=>{ const s=__hc.girlState(), h=__hc.vitals();
    return { state:s.state, dist:s.dist, steps:s.steps, kills:s.kills, spd:s.spd, footL:s.probe.footL, footR:s.probe.footR, hp:h.health }; })()`);
  // FORTY BLOCKS OUT, because the walk has to be measurable. Spawned at sixteen she was inside stomp
  // range within three seconds — one footfall total — which failed a check that nothing was wrong with.
  const track = [];
  for (let i = 0; i < 30; i++){ track.push(await sample()); await sleep(500); }
  const dists = track.map(t => +t.dist.toFixed(1));
  console.log('  distance over ' + (track.length * 0.5) + ' s: [' + dists.join(', ') + ']');
  console.log('  states: [' + track.map(t => t.state).join(' ') + ']');
  const nearest = Math.min(...dists);
  check('she walks the player down', track[0].dist - nearest > 6, 'from ' + dists[0] + ' blocks to ' + nearest);
  const steps = track[track.length - 1].steps;
  const walkT = track.filter(t => t.state === 'walk').length * 0.5;
  check('the legs are stepping, not sliding', steps >= 4, steps + ' footfalls over ' + walkT + ' s of walking');
  const footSpread = Math.max(...track.map(t => Math.abs(t.footL[2] - t.footR[2]) + Math.abs(t.footL[0] - t.footR[0])));
  check('the feet separate as she strides (the pose is bone-driven)', footSpread > 1.5, 'feet up to ' + footSpread.toFixed(2) + ' blocks apart');

  // ---- 5. she stomps, and standing on you kills ---------------------------------------------------
  const stomped = track.some(t => t.state === 'stomp');
  check('within reach she raises a foot', stomped, 'states seen: ' + [...new Set(track.map(t => t.state))].join('/'));
  const hurt = track.some(t => t.hp < 20) || track[track.length - 1].kills > 0;
  check('the stomp reaches the player', hurt, 'lowest health ' + Math.min(...track.map(t => t.hp)) + ', kills ' + track[track.length - 1].kills);

  // A DIRECT stomp, aimed rather than waited for: the walking approach can land a foot beside the player and
  // that is a legitimate near miss, so the kill is measured by standing her on top of him deliberately.
  // The kill counter is cumulative, so the baseline is taken first: without it this check passes on the
  // kill the approach above already scored and measures nothing.
  const kills0 = (await sample()).kills;
  await page.evaluate(`__hc.girlOff(); __hc.cmdRun('/gamemode survival'); __hc.cmdRun('/heal 20'); __hc.girl(5);`);
  let killed = false, hp0 = 20;
  for (let i = 0; i < 24; i++){ const s = await sample(); hp0 = Math.min(hp0, s.hp); if (s.kills > kills0){ killed = true; break; } await sleep(400); }
  check('a foot aimed at the player kills him', killed, 'health floor ' + hp0 + ', kills ' + kills0 + ' -> ' + (await sample()).kills);

  // ---- 5b. THE WALK ITSELF, which is what "hyperrealistic" reduces to as a number ------------------
  // A sole on the ground does not move. Everything else people call realism is a layer on top of that, and
  // the layers are cheap; this is the one that is structural. Analytic, at four speeds, because the fault
  // it caught was a CONSTANT factor — sine-driven joints slid 0.52 blocks per block at every speed, so a
  // single-speed reading could not have told a wrong rate from a rough animation.
  const gait = [];
  for (const sp of [2.5, 4.2, 5.2, 6.5]) gait.push(await page.evaluate(`__hc.girlGait(${sp},4)`));
  console.log('  ' + gait.map(g => g.slipPerBlock).join(' / ') + ' blocks slipped per block walked at 2.5/4.2/5.2/6.5');
  check('the planted sole does not slide', Math.max(...gait.map(g => g.slipPerBlock)) < 0.10,
    'worst ' + Math.max(...gait.map(g => g.slipPerBlock)) + ' (was 0.65 with joint-driven curves)');
  check('the slip does not grow with speed', Math.max(...gait.map(g => g.slipPerBlock)) - Math.min(...gait.map(g => g.slipPerBlock)) < 0.03,
    'spread ' + (Math.max(...gait.map(g => g.slipPerBlock)) - Math.min(...gait.map(g => g.slipPerBlock))).toFixed(3));
  check('her hips rise and fall as the loaded leg straightens', gait[2].hipRise > 0.05 && gait[2].hipRise < 1.5, gait[2].hipRise + ' blocks');
  check('the swing foot clears the stance foot', gait[2].swingClear > 0.5, gait[2].swingClear + ' blocks of clearance');

  // ---- 6. COMMAND ONLY, NO EGG (Ben 08-12) ---------------------------------------------------------
  // She had a spawn egg and it is gone. Both halves are checked, because "removed" is the easy half to get
  // wrong: an item left defined but never listed is still obtainable by /give, and a creature whose only
  // door was the egg becomes unspawnable the moment the item goes.
  await page.evaluate(`__hc.girlOff(); __hc.cmdRun('/gamemode creative');`);
  const gone = await page.evaluate(`(()=>{ window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyC'}));
    const el=document.getElementById('creative'); const cells=el?[...el.querySelectorAll('div[title]')].map(d=>d.title):[];
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyC'}));
    return { n:cells.length, eggs:cells.filter(t=>/Spawn Egg/.test(t)).length, girl:cells.some(t=>/Giantess/i.test(t)),
             give:String(__hc.cmdRun('/give egg_giantess 1').out) }; })()`);
  check('no giantess egg in the creative menu', gone.girl === false, gone.eggs + ' spawn eggs among ' + gone.n + ' items');
  check('the egg item does not exist at all', /no such item/.test(gone.give), gone.give.slice(0, 60));
  const cmd = await page.evaluate(`__hc.cmdRun('/gamemode survival'); __hc.cmdRun('/spawn giantess')`);
  await sleep(400);
  const spawned = await page.evaluate(`__hc.girlState()`);
  check('/spawn is her only door, and it works', /spawned/.test(String(cmd.out)) && spawned.active === true,
    String(cmd.out).slice(0, 48) + ' -> ' + spawned.state);
  // The hotbar-first fill stays pinned here with an ordinary item: it was found through her egg, it applies
  // to every item in the game, and nothing else in bench/ covers it.
  const bar = await page.evaluate(`(()=>{ __hc.cmdRun('/give torch 1'); return __hc.bar(); })()`);
  check('a given item lands in the hotbar, not the bag', !!(bar.slots || []).find(s => s && s.id === 'torch'), JSON.stringify(bar.slots));

  // ---- 7. SHE CAN BE KILLED (Ben 08-11) ------------------------------------------------------------
  // Through the real bullet door (girlRayHit), aimed at bone world positions, so this exercises the cylinder
  // reject, the eleven-sphere skeleton test and the damage table exactly as a rifle does.
  // CREATIVE FOR THIS SECTION. She had already killed the bench player by here, and the whole entity tick is
  // gated on `!player.dead` (the Wretch included), so her fall froze at pitch 0 and the check read as a
  // broken death animation. damage() ignores a creative player, so she can still be killed but not kill.
  await page.evaluate(`__hc.cmdRun('/gamemode creative'); __hc.cmdRun('/heal 20'); __hc.girlOff(); __hc.girl(18);`);
  await sleep(400);
  const miss = await page.evaluate(`__hc.girlShootMiss(9)`);
  check('a shot beside her does not register', miss.hit === false && miss.hpUnchanged === true, JSON.stringify(miss));
  const shots = {};
  for (const part of ['Head', 'spine.003', 'thigh.L', 'foot.R']){
    const before = (await page.evaluate(`__hc.girlState()`)).hp;
    await page.evaluate(`__hc.girlShoot('${part}',1)`);
    shots[part] = before - (await page.evaluate(`__hc.girlState()`)).hp;
  }
  console.log('  damage per shot: ' + JSON.stringify(shots));
  check('every part of her can be hit', Object.values(shots).every(v => v > 0), JSON.stringify(shots));
  check('a head shot is worth double a body shot', shots.Head === shots['spine.003'] * 2, shots.Head + ' vs ' + shots['spine.003']);
  // ---- the squat -----------------------------------------------------------------------------------
  // A squat is only a squat if she gets SHORTER. Her bounding box is measured off the posed meshes, so it is
  // the one number that cannot be satisfied by bending a knee and leaving the body where it was.
  const tall = (await page.evaluate(`__hc.girlState()`)).headY;
  await page.evaluate(`__hc.girlIdle(30)`);
  await sleep(2500);
  const sq = await page.evaluate(`__hc.girlState()`);
  console.log('  squat: head ' + tall + ' -> ' + sq.headY + ' blocks, depth ' + sq.sq);
  check('idle is a squat, and it takes her down', sq.state === 'idle' && sq.sq > 0.95 && sq.headY < tall - 1.5,
    'her head drops to ' + sq.headY + ' blocks from ' + tall);
  // Heels DOWN: a squat on the toes is the failure mode of solving a two-link leg without holding the sole,
  // and the tell is one foot ending up higher than the other or both leaving the floor.
  check('her heels stay on the ground in the squat', Math.abs(sq.probe.footL[1] - sq.probe.footR[1]) < 0.2,
    'feet at ' + sq.probe.footL[1] + ' / ' + sq.probe.footR[1]);

  const kill = await page.evaluate(`__hc.girlShoot('spine.003',60)`);
  check('enough rifle rounds kill her', kill.state === 'die', kill.hits + ' rounds landed of 60 fired (the rest hit a corpse), hp ' + kill.hp);
  const corpseShot = await page.evaluate(`__hc.girlShoot('spine.003',1)`);
  check('a corpse cannot be shot', corpseShot.hits === 0, JSON.stringify(corpseShot));
  let fell = null;
  for (let i = 0; i < 12; i++){ fell = await page.evaluate(`__hc.girlState()`); if (fell.state === 'dead') break; await sleep(350); }
  // BACKWARDS, hence the negative pitch: she is shot from the front and goes over the way she was hit.
  check('she falls BACKWARDS and lies there', fell.state === 'dead' && Math.abs(fell.pitch + Math.PI / 2) < 0.02 && fell.ttl > 60,
    'pitch ' + fell.pitch + ' rad, lying for ' + fell.ttl + ' s');
  // …and lies ON the floor. Everything rotates about her feet plane, so a body that is not lifted by its own
  // half-thickness ends up with its back through the ground — invisible from most angles and obvious from one.
  check('the corpse is on the floor, not inside it', fell.bodyY > 0.3 && fell.bodyY < 3,
    'her chest sits ' + fell.bodyY + ' blocks above the ground');

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'clean');
} catch (e){ console.log('  HARNESS ERROR: ' + (e && e.stack || e)); fails++; }
finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
  console.log('\n  ' + (checks - fails) + '/' + checks + ' checks pass');
  process.exit(fails ? 1 : 0);
}
