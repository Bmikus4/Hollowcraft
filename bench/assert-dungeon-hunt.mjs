// THE DUNGEON HUNT: it comes after seven seconds, it follows you DOWN into the crypt, and it keeps making
// ground instead of sticking on a corner.
//
// Before this, the hunt armed the instant you stepped out of the hall into the labyrinth and never armed at all
// for the crypt; and the chase used a HORIZONTAL distance to decide when to beeline, so standing over the crypt
// it read two blocks while the player was eight blocks down through a solid floor.
//
// Every claim is sampled from the live creature, not inferred: _dunHunt, its own position over time, and the
// distance to the player. The timing check has both halves — it must NOT be hunting at 4 s and must BE hunting
// by 10 s — so a change that simply armed it always would fail.
//
//   node bench/assert-dungeon-hunt.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core'; import { HELPERS } from './perf-census.mjs';
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
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?perf=1&debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`window.__hcPERF.arm(); __hc.lock(true);`); await page.evaluate(HELPERS);
    await page.evaluate(`__hc.setTime(0.85);`);

    const stateOf = () => page.evaluate(`(()=>{ const L=__hc.lairInfo()||{}, p=__hc.pos(), s=__hc.st();
      return { hunt:!!(window.__wq=null)||null, lair:L, px:p.x, py:p.y, pz:p.z,
               wa:s.wa, ws:s.ws, wy:s.wy, dist:s.dist,
               d3:null }; })()`);
    // the creature's own numbers, read through the existing pose/st hooks
    const sample = () => page.evaluate(`(()=>{ const s=__hc.st(), p=__hc.pos(), po=__hc.pose()||{};
      return { active:!!s.wa, state:s.ws, wy:+s.wy, dist:+(po.dist||s.dist||999), px:p.x, py:p.y, pz:p.z }; })()`);

    // ---- LABYRINTH: the timer ----
    const L = await page.evaluate(`(()=>{ goDungeon('lab'); __hc.lock(true); return __hc.lairInfo(); })()`);
    console.log('  lair:', JSON.stringify(L));
    await sleep(2500);
    await page.evaluate(`(()=>{ __hc.set({active:false, _dunHunt:false, _dunT:0}); })()`);
    await page.evaluate(`goDungeon('lab'); __hc.lock(true);`);
    await sleep(4000);
    const at4 = await sample();
    check('not hunting yet at 4 s in the dungeon', !at4.active, `active ${at4.active}, state ${at4.state}`);
    await sleep(6500);
    const at10 = await sample();
    check('hunting by 10 s in the dungeon', at10.active, `active ${at10.active}, state ${at10.state}, dist ${at10.dist}`);

    // ---- it makes ground rather than sticking ----
    // THIRTY SECONDS, AND THE CLOSEST APPROACH. Fourteen was not enough to be a measurement: the hunt arms while the
    // creature is wherever the night left it — 68 to 79 blocks out in three consecutive runs — and it has to walk in
    // through the maze before any of that distance comes off. One run closed 74 to 23, the next 68 to 52, and a third went
    // 75 to 79 while circling the far side, which failed a check nothing was wrong with. What "it comes for you" means is
    // that it gets nearer at some point in the window, so the closest approach is what is judged, and the whole series is
    // printed because a number that moves this much run to run should never be reported as one figure.
    const track=[];
    for(let i=0;i<30;i++){ const s=await sample(); track.push(s); await sleep(1000); }
    let moved=0; for(let i=1;i<track.length;i++){ const a=track[i-1], b=track[i];
      moved += Math.hypot((b.dist-a.dist)); }
    const dists=track.map(t=>+t.dist.toFixed(1));
    const nearest = Math.min(...dists);
    const closed = track[0].dist - nearest;                 // closest approach, not the last sample: it circles once it is near
    console.log(`  distance to player over ${track.length} s: [${dists.join(', ')}]   nearest ${nearest}`);
    check('it closes on the player through the labyrinth', closed>3 || nearest<6,
      `from ${track[0].dist.toFixed(1)} blocks to ${nearest} at its closest, ${track[track.length-1].dist.toFixed(1)} at the end`);
    const stuck = dists.slice(-6).every(d=>Math.abs(d-dists[dists.length-1])<0.15) && dists[dists.length-1]>6;
    check('it is not stuck at a fixed distance', !stuck, `last six samples ${dists.slice(-6).join(', ')}`);
    // ON THE FLOOR, NOT THE CEILING. _dunSurf offers five wall/ceiling targets for every floor one, so a hunting
    // creature used to spend most of its time clung above the room. This has to be sampled while the creature is
    // actually INSIDE — the first version measured it walking overland to the entrance, where being 40 blocks
    // above the hall floor is simply correct, and called that a ceiling bug. __hc.yank puts it beside the player.
    // AGAINST THE FLOOR UNDER ITS OWN FEET, not against the hall's. fy is the MAIN HALL's floor and this dungeon has
    // storeys above it — measured, the player stands in the labyrinth at y=42 while fy is 32, so a creature standing
    // correctly beside them read as ten blocks "airborne" and this check called that a ceiling bug for weeks.
    // __hc.wretchFoot() reports the gap to the ground in its OWN column, which means the same thing on every storey, plus
    // the solid it would be hanging from if it really were on a ceiling.
    await page.evaluate(`__hc.yank();`);
    await sleep(1200);
    const gaps=[], roofs=[];
    for(let i=0;i<12;i++){ const f=await page.evaluate(`__hc.wretchFoot()`);
      gaps.push(f.gap==null?99:+(+f.gap).toFixed(2)); roofs.push(f.roofGap==null?null:+(+f.roofGap).toFixed(1)); await sleep(900); }
    console.log(`  gap to the floor under it:  [${gaps.join(', ')}]`);
    console.log(`  gap to the solid above it:  [${roofs.join(', ')}]`);
    const airborne = gaps.filter(h=>h>2.5).length;
    check('it hunts on the floor rather than the ceiling', airborne<=2,
      `${airborne} of ${gaps.length} samples more than 2.5 blocks off their own floor (max ${Math.max(...gaps)})`);
    // AND NOT SUNK INTO IT EITHER — the state the containment clamp used to force: held down to the hall floor while the
    // player walked a storey above, the body ended up 2.6 blocks INSIDE the structure and stopped moving entirely.
    const sunk = gaps.filter(h=>h<-0.5).length;
    check('and it is not sunk into the floor',            sunk===0,
      `${sunk} of ${gaps.length} samples over half a block below their own floor (min ${Math.min(...gaps)})`);

    // ---- CRYPT: it follows you down ----
    const crypt = await page.evaluate(`(()=>{ const L=__hc.lairInfo(); if(!L||L.fy==null) return null;
      __hc.tpAt(L.cx, L.fy-6+1.6, L.cz); __hc.lock(true); return { fy:L.fy, py:__hc.pos().y }; })()`);
    console.log('  crypt drop:', JSON.stringify(crypt));
    if(!crypt) check('the crypt is reachable for this test', false, 'no lair floor');
    else {
      await sleep(12000);
      const c = await sample();
      const below = c.wy < (crypt.fy-1);
      check('it comes DOWN into the crypt rather than standing over it', below,
        `creature y ${c.wy}, hall floor ${crypt.fy}, player y ${c.py.toFixed(1)}, dist ${c.dist.toFixed(1)}`);
    }
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
