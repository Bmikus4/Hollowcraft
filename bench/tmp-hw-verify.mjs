// THE HORRIFIC WRETCH, end to end. Four claims, each asserted on state the check set itself rather than on a world-wide
// global (see bench/README.md), and each polled to a deadline rather than slept at:
//
//   1. it spawns from the egg's own code path and the AI instance runs — active, a live state, a closing distance;
//   2. it is a SEPARATE entity — the primary Wretch is untouched, the `wretch` binding is back on the primary after the
//      update, and no error was swallowed by the per-instance catch;
//   3. its rig is NOT in the world scene (that is what makes the image the drift loop's output and not the model), and
//      the loop is actually stepping;
//   4. losing line of sight FLUSHES it: the flush counter rises and the tint changes. Photographed either side, so the
//      claim can be judged by eye and not only by a counter.
//
// usage: node bench/tmp-hw-verify.mjs [tag]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const OUT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/f17fe305-bd3b-4b89-81c6-34ea30e4177c/scratchpad';
const TAG = process.argv[2] || 'hw';
fs.mkdirSync(OUT, { recursive:true });

function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, timeoutMs=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>timeoutMs)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

const fails = [];
const check = (name, ok, detail)=>{ console.log((ok?'PASS  ':'FAIL  ')+name+(detail!=null?'   '+JSON.stringify(detail):'')); if(!ok) fails.push(name); };

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base = 'http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    let browser = await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx = await browser.newContext({ viewport:{width:1280,height:720} });
    let page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e=>{ errs.push(String(e.message||e)); console.log('PAGEERROR:', String(e.message||e).slice(0,400)); });
    page.on('console', m=>{ const t=m.text(); if(/shader|GLSL|WebGL|ERROR|horrific/i.test(t)) console.log('CONSOLE:', t.slice(0,400)); });
    await page.goto('about:blank');
    const glProbe = `(()=>{try{const c=document.createElement('canvas');const gl=c.getContext('webgl2')||c.getContext('webgl');if(!gl)return 'NO';const e=gl.getExtension('WEBGL_debug_renderer_info');return e?String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)):'?';}catch(e){return 'E';}})()`;
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(glProbe))){
      await browser.close();
      browser = await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,780']) });
      ctx = await browser.newContext({ viewport:{width:1280,height:720} });
      page = await ctx.newPage();
      page.on('pageerror', e=>{ errs.push(String(e.message||e)); console.log('PAGEERROR:', String(e.message||e).slice(0,400)); });
    }
    await page.goto(base+'/index.html?debug=1&perf=1&rd=6', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`, { timeout:120000 });
    await page.waitForFunction(`(()=>{try{return __hc.probe?__hc.probe().chunkHere===true:__hc.fill().meshed>0;}catch(e){return false;}})()`, { timeout:120000 });
    console.log('pinScene', JSON.stringify(await page.evaluate(`__hc.pinScene()`)));
    await page.evaluate(`__hc.vitals(20,20,true)`);              // creative: it must not be able to kill the harness mid-run
    await page.evaluate(`__hc.setTime(0.72)`);                    // night — the Wretch AI's own hours
    await sleep(1200);

    const primeBefore = await page.evaluate(`__hc.hwPrime()`);
    console.log('prime before', JSON.stringify(primeBefore));

    // ---- 1. SPAWN through the same function the spawn egg calls.
    // Held immediately: spawned inside hunting range at night this thing captures the player in about three seconds (it
    // did, on the first run of this check), and the grab cutscene owns the camera — so the image claims below could never
    // be measured. The AI is released again at the end and its behaviour asserted there.
    await page.evaluate(`__hc.hwHold(true)`);
    const spawned = await page.evaluate(`__hc.hw(9)`);
    console.log('spawn', JSON.stringify(spawned));
    check('spawn returned one instance', Array.isArray(spawned) && spawned.length===1, Array.isArray(spawned)?spawned.length:spawned);
    if(!Array.isArray(spawned)) throw new Error('spawn failed: '+JSON.stringify(spawned));

    // Poll for the loop to be running rather than sleeping a guessed interval — and PRINT each sample, so a stall says
    // why (parked because the AI went inactive, parked because the grab cutscene owns the camera, or genuinely stuck).
    let s1 = null;
    for(let k=0;k<20;k++){
      s1 = (await page.evaluate(`__hc.hwState()`))[0];
      const pr = await page.evaluate(`__hc.hwPrime()`);
      console.log('  poll '+k, JSON.stringify({ active:s1&&s1.active, state:s1&&s1.state, dist:s1&&s1.dist,
        steps:s1&&s1.drift&&s1.drift.steps, grabbed:pr.grabbed, day:pr.day }));
      if(s1 && s1.drift && s1.drift.steps>25) break;
      await sleep(1000);
    }
    console.log('state', JSON.stringify(s1));

    check('AI instance is active', s1.active===true, s1.active);
    check('AI instance has a live state', typeof s1.state==='string' && s1.state!=='DORMANT', s1.state);
    check('rig is OUT of the world scene', s1.inWorldScene===false, s1.inWorldScene);
    check('drift loop attached and stepping', s1.drift.attached===true && s1.drift.steps>25, s1.drift.steps);

    // ---- 2. SEPARATE from the primary
    const prime = await page.evaluate(`__hc.hwPrime()`);
    console.log('prime after', JSON.stringify(prime));
    check('binding restored to the primary', prime.bound===true, prime.bound);
    check('no swallowed error in the extra update', prime.err===null, prime.err);
    check('one extra instance tracked', prime.extras===1, prime.extras);

    // ---- 4. THE FLUSH. Face it, shoot, then turn away long enough to lose it, then face it again.
    // lookDir() is (-sin yaw, _, -cos yaw), so facing a delta means yaw = atan2(-dx, -dz). Solved in-page in one round
    // trip so the aim cannot be taken from a position the entity has already walked away from.
    const look = ()=>page.evaluate(`(()=>{ const w=__hc.hwState()[0], p=__hc.pos();
      const yaw=Math.atan2(-(w.x-p.x), -(w.z-p.z)); __hc.cam({yaw, pitch:-0.05}); return {yaw:+yaw.toFixed(3), wx:w.x, wz:w.z}; })()`);
    await look();
    await sleep(1400);
    const seen = (await page.evaluate(`__hc.hwState()`))[0];
    check('it is seen when faced', seen.drift.seen===true, seen.drift.seen);
    await page.screenshot({ path: path.join(OUT, TAG+'-1-before.png') });

    // Is there anything IN the frame? A dark screenshot cannot answer that, so read the two stages back off the GPU:
    // fresh.maxAlpha proves the rig rendered into the anchor at all, out.maxAlpha proves the loop is passing it through,
    // and the lumas say whether what got through is bright enough for a player to see.
    const probeNight = (await page.evaluate(`__hc.hwProbe()`))[0];
    console.log('probe (night)', JSON.stringify(probeNight));
    check('the rig renders into the clean anchor', probeNight.fresh.maxAlpha > 200, probeNight.fresh);
    check('the loop passes it through', probeNight.out.maxAlpha > 120, probeNight.out);

    // And a daylight frame, because "correct but invisible at night" is the failure the night shot cannot distinguish.
    await page.evaluate(`__hc.setTime(0.5)`); await sleep(1600);
    const probeDay = (await page.evaluate(`__hc.hwProbe()`))[0];
    console.log('probe (noon)', JSON.stringify(probeDay));
    await page.screenshot({ path: path.join(OUT, TAG+'-0-noon.png') });
    check('it is visible in daylight', probeDay.out.luma > 8, {night:probeNight.out.luma, noon:probeDay.out.luma});
    await page.evaluate(`__hc.setTime(0.72)`); await sleep(1200);

    const beforeFlushes = seen.drift.flushes, beforeTint = seen.drift.tint;
    await page.evaluate(`__hc.cam({yaw:${(await page.evaluate(`__hc.pos()`)).yaw + Math.PI}, pitch:0})`);   // look away
    // POLL for the unseen timer to pass the flush threshold, do not sleep a guessed interval. Setting player.yaw does not
    // move the eye instantly — the look is smoothed — so a 180 takes about half a second to actually leave the frustum,
    // and a fixed 900ms wait measured unseen=0.22s against a 0.28s threshold and reported "no flush" for the wrong reason.
    let away = null;
    for(let k=0;k<20;k++){ away = (await page.evaluate(`__hc.hwState()`))[0];
      if(away && away.drift.seen===false && away.drift.unseen > 0.45) break; await sleep(200); }
    check('looking away marks it unseen past the flush threshold', away.drift.seen===false && away.drift.unseen>0.45,
      {seen:away.drift.seen, unseen:away.drift.unseen});
    await look();
    await sleep(1000);
    const after = (await page.evaluate(`__hc.hwState()`))[0];
    console.log('after reacquire', JSON.stringify(after.drift));
    check('losing sight flushed the context window', after.drift.flushes > beforeFlushes, {before:beforeFlushes, after:after.drift.flushes});
    check('it came back a different colour', after.drift.tint !== beforeTint, {before:beforeTint, after:after.drift.tint});
    await page.screenshot({ path: path.join(OUT, TAG+'-2-after-flush.png') });

    // ---- 2b. RELEASE THE AI and require it to behave like the Wretch: from a held SCOUT/HUNT at ~10 blocks it must
    // close and commit. Asserted on the instance's own state, never on a world-wide global.
    await page.evaluate(`__hc.hwHold(false)`);
    let committed = null;
    for(let k=0;k<25;k++){
      const w = (await page.evaluate(`__hc.hwState()`))[0];
      if(!w) break;
      if(k%5===0) console.log('  ai '+k, JSON.stringify({state:w.state, dist:w.dist, form:w.form, dragging:w.dragging}));
      if(/CHASE|HUNT|DRAG/.test(w.state) && w.dist < 8){ committed = w; break; }
      await sleep(700);
    }
    check('released AI closes and commits like the Wretch', !!committed, committed && {state:committed.state, dist:committed.dist});
    await page.evaluate(`__hc.hwHold(true)`);                     // hold again so the cost sample is not a grab cutscene

    // ---- COST. The whole point of doing this offline is that it must not show up in the frame budget.
    await sleep(2500);
    const prof = await page.evaluate(`__hc.frameProf(150)`);
    console.log('frameProf', JSON.stringify({ avgFrameMs:prof.avgFrameMs, drift:prof.ms&&prof.ms.drift, wretch:prof.ms&&prof.ms.wretch, draw:prof.ms&&prof.ms.draw }));
    check('drift step costs under 1ms/frame', !prof.ms || !prof.ms.drift || prof.ms.drift < 1.0, prof.ms&&prof.ms.drift);

    // ---- and it can be removed cleanly, which is what makes it a spike and not a commitment
    const killed = await page.evaluate(`__hc.hwKill()`);
    await sleep(600);
    const gone = await page.evaluate(`__hc.hwPrime()`);
    check('removes cleanly', killed===1 && gone.extras===0, {killed, extras:gone.extras});
    check('no page errors at all', errs.length===0, errs.slice(0,3));

    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log(fails.length ? ('FAILED: '+fails.join(', ')) : 'ALL PASS');
  process.exit(fails.length?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
