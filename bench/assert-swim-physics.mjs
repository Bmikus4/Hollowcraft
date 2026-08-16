// WATER HAS MOMENTUM AND DRAG, AND SPRINT IS THE SWIM INPUT.
//
// Ben, 08-16: "redo water physics and make it hyperreealistic", "momentum, swimming animation through the water for
// all players, sprint starts the animation, and speeds the player up underwater."
//
// "HYPERREALISTIC" IS A FEEL WORD AND THE ONLY WAY TO ARGUE ABOUT IT IS WITH SPEEDS. Three properties separate
// thrust-against-drag from the slower walk it replaced, and all three are numbers:
//   1. ENTERING FAST IS DIFFERENT FROM ENTERING SLOW. Under a clamp, both are the same speed within two frames.
//      Under drag, the fast entry is still faster a moment later. This is the check the old code cannot pass.
//   2. TOP SPEED IS EMERGENT. It is sqrt(thrust/drag) and appears nowhere in the source, so it is measured by
//      pushing until the speed stops rising — which is also how a player experiences it.
//   3. SPRINT IS FASTER UNDERWATER, by a real margin rather than a token one.
//
//   node bench/assert-swim-physics.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:900,height:520}})).newPage();
    page.on('pageerror',e=>{ console.log('  PAGEERROR:',String(e.message||e).slice(0,160)); fails++; checks++; });
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    // SURVIVAL, AND FLIGHT EXPLICITLY OFF. In creative the player flies, and the flight branch ASSIGNS velocity from
    // the keys every frame — so with no key held a body carrying 9 m/s reads exactly 0 on the next frame. The first
    // three runs of this bench were measuring that, not the water.
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode survival'); __hc.cmdRun('/fly off'); __hc.freezeAnimals(true);`);
    // FIND REAL WATER BY STANDING IN IT, not by reading a height off the terrain. Sea level is a number the game
    // knows and the shoreline is not: a column whose ground is below sea level can still be a cave, an overhang or
    // a beach the generator raised after the fact. Teleporting in and asking inWater is the ground truth, and it is
    // the same predicate the physics itself branches on.
    const SEA=(await page.evaluate(`__hc.swimProbe()`)).sea;
    const sea=await page.evaluate(`(()=>{ const S=__hc.st(), sea=__hc.swimProbe().sea;
      const sx=Math.round(S.sx), sz=Math.round(S.sz);
      for(let r=8;r<=300;r+=8) for(let a=0;a<24;a++){
        const x=Math.round(sx+Math.cos(a*Math.PI/12)*r), z=Math.round(sz+Math.sin(a*Math.PI/12)*r);
        // DEEP water, not merely wet. The first working run of this bench stood in three blocks of it: the probe
        // read onGround true on the seabed, so the swimmer was a person standing in a pond and every measurement
        // was of the ground movement code. sea-12 is enough to be a swimmer at any point in the test.
        const g=__hc.groundY(x,z); if(g>0 && g<sea-12) return {x,z,g}; }
      return null; })()`).catch(()=>null);
    check('open water was found to swim in', !!sea, JSON.stringify({sea,SEA}));
    if(!sea) throw new Error('no water near spawn');
    const dive=async()=>{ await page.evaluate(`__hc.swimStop(); __hc.tpAt(${sea.x}.5, ${SEA-5}, ${sea.z}.5)`); await sleep(700);
      return await page.evaluate(`__hc.swimProbe()`); };
    let P=await dive();
    check('the player is actually in the water', P.inWater===true, JSON.stringify({inWater:P.inWater,y:P.y}));

    // ---- 1. TOP SPEED IS EMERGENT: push until it stops rising ----
    const settle=async(sprint)=>{
      await dive();
      await page.evaluate(`__hc.cam({yaw:0,pitch:0}); __hc.swimPush(0,1,${sprint?'true':'false'})`);
      let last=0, v=0;
      for(let i=0;i<14;i++){ await sleep(320); const q=await page.evaluate(`__hc.swimProbe()`); last=v; v=q.speed; }
      await page.evaluate(`__hc.swimStop()`);
      return { v, rise:v-last }; };
    const slow=await settle(false), fast=await settle(true);
    console.log(`  swim  terminal ${slow.v} m/s (still rising ${slow.rise.toFixed(4)})`);
    console.log(`  sprint terminal ${fast.v} m/s (still rising ${fast.rise.toFixed(4)})`);
    check('a swim settles at a terminal speed rather than climbing forever', Math.abs(slow.rise)<0.05, `still rising ${slow.rise.toFixed(4)}`);
    check('swimming settles near sqrt(1.58/1.10) = 1.20 m/s', Math.abs(slow.v-1.20)<0.35, `${slow.v}`);
    check('SPRINT SPEEDS YOU UP UNDERWATER, and by a real margin', fast.v>slow.v*1.4, `${fast.v} against ${slow.v}`);
    check('sprint settles near sqrt(5.32/1.10) = 2.20 m/s', Math.abs(fast.v-2.20)<0.5, `${fast.v}`);

    // ---- 1b. THE POSTURE AND ITS HITBOX ----
    // The pose is only half of it. A horizontal body that keeps a standing capsule is a body you can shoot in the
    // head while it lies flat, so the hitbox is asserted next to the flag rather than trusted to follow it.
    await dive();
    const still=await page.evaluate(`__hc.swimProbe()`);
    check('floating without pushing is NOT swimming', still.swimming===false, `swimming ${still.swimming}`);
    check('and it keeps the standing hitbox', still.bodyH>1.4, `bodyH ${still.bodyH}`);
    await page.evaluate(`__hc.cam({yaw:0,pitch:0}); __hc.swimPush(0,1,false)`); await sleep(700);
    const mv=await page.evaluate(`__hc.swimProbe()`);
    console.log(`  swimming ${mv.swimming}  phase ${mv.swimPh}  bodyH ${mv.bodyH}`);
    check('pushing through the water IS swimming', mv.swimming===true, `swimming ${mv.swimming}`);
    check('THE HITBOX FOLLOWS THE POSTURE', mv.bodyH<0.9, `bodyH ${mv.bodyH} against a standing ${still.bodyH}`);
    await sleep(500);
    const mv2=await page.evaluate(`__hc.swimProbe()`);
    check('the stroke phase advances while swimming', mv2.swimPh>mv.swimPh, `${mv.swimPh} -> ${mv2.swimPh}`);
    await page.evaluate(`__hc.swimStop()`); await sleep(600);
    const after=await page.evaluate(`__hc.swimProbe()`);
    check('and stopping puts the standing hitbox back', after.swimming===false && after.bodyH>1.4, `swimming ${after.swimming} bodyH ${after.bodyH}`);

    // ---- 2. MOMENTUM: entering fast is different from entering slow ----
    // THE CHECK THE OLD CODE CANNOT PASS. Under the clamp both entries read the same speed within two frames;
    // under drag the fast one is still faster a moment later. Both start from the same place with no input held,
    // so the only difference between the rows is the speed carried in.
    const carry=async(v0)=>{
      await page.evaluate(`__hc.swimStop(); __hc.tpAt(${sea.x}.5, ${SEA-5}, ${sea.z}.5)`); await sleep(600);
      await page.evaluate(`__hc.setVel&&__hc.setVel(${v0},0,0)`).catch(()=>{});
      const got=await page.evaluate(`(()=>{ __hc.setVel(${v0},0,0); return __hc.swimProbe(); })()`).catch(()=>null);
      await sleep(250);
      const a=await page.evaluate(`__hc.swimProbe()`);
      // THE STATE IS PRINTED, not just the speed. The first run of this row read 0 from both entries and there was
      // no way to tell whether the velocity had been refused, drained by the ground branch because the swimmer had
      // reached the seabed, or zeroed by the no-input guard.
      return { set:got&&got.speed, after:a.speed, probe:a }; };
    const fastIn=await carry(9), slowIn=await carry(1.5);
    if(fastIn.set==null){ console.log('  (momentum rows skipped — no __hc.setVel to inject an entry speed)'); }
    else {
      console.log(`  entered at 9.0 -> ${fastIn.after} after 0.25 s   ${JSON.stringify(fastIn.probe)}`);
      console.log(`  entered at 1.5 -> ${slowIn.after} after 0.25 s   fly ${slowIn.probe.fly} inWater ${slowIn.probe.inWater}`);
      check('MOMENTUM CARRIES IN: a fast entry is still faster a quarter-second later', fastIn.after>slowIn.after+0.3, `${fastIn.after} against ${slowIn.after}`);
      check('and it is bleeding off rather than holding', fastIn.after<9, `${fastIn.after} from 9.0`);
    }
  }catch(e){ console.log('  HARNESS ERROR: '+(e&&e.message||e)); fails++; checks++; }
  finally{ try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks pass`);
  process.exit(fails?1:0);
})();
