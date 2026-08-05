// #70 — WATER PHYSICS + BUBBLES.
//
// The item is one sentence: hold Space and rise steadily, then HOLD at the surface without pogoing. Everything here
// measures that hold, because the rise already worked and the hold is where the bug lived — the old code fired a flat
// 2.6 m/s impulse the moment the torso probe came up dry, at exactly the height where holding Space stops qualifying
// as "submerged". That is a bounce with a two-frame period. So a harness that only asks "did it reach the surface"
// passes on the broken build; the tests that matter are 3, 4 and 6.
//
//   1 the rise itself: from four blocks down, Space carries you up
//   2 it arrives at the surface and not through it — the eye clears the waterline, the body does not fly out
//   3 IT HOLDS: peak-to-peak y over 2.5 s of held Space, at the surface, in open water
//   4 no impulse survives the hold — a pogo shows as vel.y flicking positive again and again
//   5 the swim branch stays LATCHED at the float point (p.inWater still true) — this is the mechanism of 3 and 4
//   6 chest-deep behaves too: the shelf means two blocks of water is the common case, not an edge case
//   7 letting go sinks — floating is work in this game (Ben 07-20), the hold must not become buoyancy
//   8 bubbles exist while submerged, rise, and none of them lives above the water's own top face
//   9 bubbles are a submerged-only cost: dry, the system drains to zero slots
// usage: node bench/assert-water.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let pass=0, fail=0;
const chk=(c,n,d)=>{ if(c){pass++;console.log('  PASS  '+n+(d?'   '+d:''));} else {fail++;console.log('  FAIL  '+n+(d?'   '+d:''));} };

// Sample the swim state at ~20 Hz from the node side. It has to be sampled, not read once: a pogo and a hold have the
// SAME mean height and differ only in the variance, so one reading after the fact cannot tell them apart.
async function track(page, ms){
  const ys=[], vys=[]; const t0=Date.now();
  while(Date.now()-t0 < ms){ const w=await page.evaluate('__hc.water()'); ys.push(w.y); vys.push(w.vy); await sleep(50); }
  return { ys, vys, n:ys.length, min:Math.min(...ys), max:Math.max(...ys), p2p:+(Math.max(...ys)-Math.min(...ys)).toFixed(3),
           vyMax:+Math.max(...vys).toFixed(3), vyMin:+Math.min(...vys).toFixed(3),
           kicks:vys.filter(v=>v>0.6).length };   // an impulse-driven bounce spends most of its cycle with a large positive vy
}

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,760']) });
      ctx=await browser.newContext({ viewport:{width:1280,height:720} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:180000});
    await page.evaluate('__hc.setTime(0.30)');
    await sleep(2500);

    const dw = await page.evaluate('__hc.deepWater()');
    console.log('  deep water ' + JSON.stringify(dw));
    if(!dw){ chk(false,'found deep sea to test in'); }
    else{
      const SEA = dw.sea;
      // ---- 1  THE RISE ----
      console.log('\n--- 1  hold Space at depth and rise ---');
      await page.evaluate(`__hc.tpExact(${dw.x}, ${dw.z}, ${SEA-4})`);
      await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:60000}).catch(()=>{});
      await sleep(600);
      const start = await page.evaluate(`__hc.tpExact(${dw.x}, ${dw.z}, ${SEA-4})`);
      await page.evaluate('__hc.lock(true)');           // physics() only runs pointer-locked; headless can never acquire the real lock
      const sub0 = await page.evaluate('__hc.water()');
      chk(sub0.inWater===true, 'the probe agrees we are in water before anything else', 'inWater '+sub0.inWater+' at y '+sub0.y);
      await page.evaluate("__hc.key('Space',true)");
      await sleep(2200);
      const risen = await page.evaluate('__hc.water()');
      console.log('  risen ' + JSON.stringify(risen));
      chk(risen.y > start.y + 1.5, 'Space carried the body up from depth', start.y+' -> '+risen.y);

      // ---- 2  ARRIVAL ----
      console.log('\n--- 2  it stops AT the surface, head out, body in ---');
      chk(risen.eye > risen.surf, 'the eye is clear of the waterline', 'eye '+risen.eye+' against surface '+risen.surf);
      chk(risen.y < risen.surf, 'the body did not fly out of the water', 'feet '+risen.y+' against surface '+risen.surf);
      chk(Math.abs(risen.y - risen.float) < 0.12, 'it settled on the float point, not somewhere near it',
        'y '+risen.y+' target '+risen.float);

      // ---- 3+4  THE HOLD — the whole item ----
      console.log('\n--- 3  hold Space for 2.5 s at the surface and measure the bounce ---');
      const hold = await track(page, 2500);
      console.log('  hold ' + JSON.stringify({p2p:hold.p2p, vyMax:hold.vyMax, vyMin:hold.vyMin, kicks:hold.kicks, n:hold.n}));
      chk(hold.p2p < 0.06, 'the body holds still at the surface', 'peak-to-peak '+hold.p2p+' blocks over '+hold.n+' samples');
      chk(hold.vyMax < 0.15 && hold.vyMin > -0.15, 'and nothing is still pushing it', 'vy in ['+hold.vyMin+','+hold.vyMax+']');
      chk(hold.kicks===0, 'no upward impulse fires during the hold — this is the pogo, asserted absent', hold.kicks+' kicks over 2.5 s');

      // ---- 5  THE MECHANISM ----
      console.log('\n--- 5  the swim branch stays latched at the float point ---');
      const latched = await page.evaluate('__hc.water()');
      chk(latched.inWater===true, 'p.inWater is STILL true while treading', 'if this goes false the ground path takes a frame and the bounce comes back');
      chk(latched.sub===false, 'but the camera is NOT submerged — the head really is out', 'sub '+latched.sub);
      fs.writeFileSync(path.join(ROOT,'bench','results','water-tread.png'), await page.screenshot());

      // ---- 7  RELEASE ----
      console.log('\n--- 7  let go and sink: floating is work, not the default ---');
      await page.evaluate("__hc.key('Space',false)");
      await sleep(1200);
      const sunk = await page.evaluate('__hc.water()');
      chk(sunk.y < latched.y - 0.5, 'releasing Space sinks you', latched.y+' -> '+sunk.y);

      // ---- 8  BUBBLES ----
      console.log('\n--- 8  bubbles while the head is under ---');
      await page.evaluate(`__hc.tpExact(${dw.x}, ${dw.z}, ${SEA-4})`);
      await sleep(1600);
      const bub = await page.evaluate('__hc.bubbles()');
      const wsub = await page.evaluate('__hc.water()');
      console.log('  bubbles ' + JSON.stringify(bub) + '  ' + JSON.stringify({sub:wsub.sub, surf:wsub.surf}));
      chk(wsub.sub===true, 'the camera is submerged for this test', 'sub '+wsub.sub);
      chk(bub.n>0, 'bubbles are being spawned', bub.n+' live of '+bub.cap);
      chk(bub.n<=bub.cap, 'and the pool is capped', bub.n+'/'+bub.cap);
      chk(bub.aboveSurface===0, 'none of them lives above the water it is in', bub.aboveSurface+' above surface, '+bub.belowSurface+' below');
      chk(bub.rising===bub.n, 'every one of them is going up', bub.rising+' of '+bub.n);
      chk(bub.drawn===bub.n, 'the instanced draw count matches the live slots', 'drawn '+bub.drawn);
      // The judging frame is taken looking UP, because that is where a swimmer's eyes are when they are holding Space,
      // and a bubble rising out of the top of a level view is not a bubble anyone sees.
      await page.evaluate('__hc.pitch(0.45)'); await sleep(1400);
      fs.writeFileSync(path.join(ROOT,'bench','results','water-bubbles.png'), await page.screenshot());
      await page.evaluate('__hc.pitch(0)');

      // ---- 9  DRY ----
      console.log('\n--- 9  out of the water, the system costs nothing ---');
      await page.evaluate("__hc.key('Space',false); __hc.tp(__hc.probe().spawnX, __hc.probe().spawnZ)");
      await sleep(3000);
      const dryw = await page.evaluate('__hc.water()');
      chk(dryw.sub===false, 'we are dry on land', 'sub '+dryw.sub+' y '+dryw.y);
      // The ones already in the sea keep rising after you leave — they are not yours any more and popping them on
      // teleport would be the wrong physics. What must be true is that no NEW ones appear and the pool empties.
      let dry=await page.evaluate('__hc.bubbles()'); const dry0=dry.n; let grew=false;
      for(let i=0;i<20 && dry.n>0;i++){ await sleep(500); const nx=await page.evaluate('__hc.bubbles()'); if(nx.n>dry.n) grew=true; dry=nx; }
      chk(!grew, 'no bubble is spawned while the head is in air', 'started at '+dry0);
      chk(dry.n===0 && dry.drawn===0, 'the bubble pool drained to nothing', dry.n+' live, '+dry.drawn+' drawn');

      // ---- 6  CHEST-DEEP ----
      console.log('\n--- 6  chest-deep, which the shelf makes the common case ---');
      const sh = await page.evaluate('__hc.shallowWater(2)');
      console.log('  shallow ' + JSON.stringify(sh));
      if(!sh) chk(false,'found two blocks of water on the shelf');
      else{
        await page.evaluate(`__hc.tpExact(${sh.x}, ${sh.z}, ${sh.h+1})`);
        await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:60000}).catch(()=>{});
        await sleep(1200);
        await page.evaluate("__hc.key('Space',true)");
        await sleep(1500);
        const shallow = await track(page, 2000);
        const sw = await page.evaluate('__hc.water()');
        await page.evaluate("__hc.key('Space',false); __hc.lock(false)");
        console.log('  shallow hold ' + JSON.stringify({p2p:shallow.p2p, kicks:shallow.kicks, vyMax:shallow.vyMax}) + ' ' + JSON.stringify(sw));
        chk(shallow.p2p < 0.10, 'holding Space in two blocks of water does not bounce either', 'peak-to-peak '+shallow.p2p);
        chk(sw.y < sw.surf, 'and it does not launch you out of the shallows', 'y '+sw.y+' surface '+sw.surf);
        chk(shallow.kicks===0, 'the shore does not fire the breach hop at a player who is only treading', shallow.kicks+' kicks');
        fs.writeFileSync(path.join(ROOT,'bench','results','water-shallow.png'), await page.screenshot());

        // ---- and the way OUT still exists: face the bank, hold W and Space ----
        if(sh.lx==null) chk(false,'found dry land next to the shallow spot to climb onto');
        else{
          await page.evaluate(`__hc.tpExact(${sh.x}, ${sh.z}, ${sh.h+1})`); await sleep(900);
          await page.evaluate(`__hc.look(${sh.lx}, ${sh.ly}, ${sh.lz}); __hc.pitch(0)`);
          await page.evaluate("__hc.lock(true); __hc.key('KeyW',true); __hc.key('Space',true)");
          const climb = await track(page, 2600);
          const out = await page.evaluate('__hc.water()');
          await page.evaluate("__hc.key('KeyW',false); __hc.key('Space',false); __hc.lock(false)");
          console.log('  climb-out ' + JSON.stringify({vyMax:climb.vyMax, yMax:+climb.max.toFixed(2), kicks:climb.kicks}) + ' ' + JSON.stringify(out));
          chk(climb.vyMax > 4, 'swimming into a bank still fires the breach climb', 'peak vy '+climb.vyMax);
          chk(out.y >= sh.sea+1, 'and it carries you out of the water onto the bank', 'y '+out.y+' against sea '+sh.sea);
          chk(out.inWater===false, 'the swim state has released you', 'inWater '+out.inWater+' onGround '+out.onGround);
        }
      }
    }

    console.log('\n'+pass+'/'+(pass+fail)+' passed');
    await browser.close();
    process.exit(fail?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
