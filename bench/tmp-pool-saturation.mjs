// IS THE 16-SLOT LIGHT POOL FULL BEFORE THE PLAYER PLACES ANYTHING, AND WHAT MOVES WHEN A LAMP IS BROKEN?
//
// The lead: bench/tmp-break-light-wash.mjs found 14 of the pool's 16 slots already lit with ONE lantern placed at spawn — worldgen
// emitters nearly fill it — so breaking any light frees a slot and PROMOTES a different lamp into it, changing delivered light on
// something else entirely, somewhere else on screen. That was written down as a possible second mechanism behind the white-wash
// report. The first mechanism is fixed and proved (66d2bc2, bakeLight's lazy clear), so this asks whether there is anything left.
//
// The pool is DYNAMIC and distance-sorted: every frame it takes the nearest emitters within 35 blocks and assigns the 16 slots.
// Nothing about it is wrong when it is full — that is what a fixed pool does — but two things are worth knowing and neither was
// measured: how often it is saturated in ordinary play, and whether a break re-shuffles lights that are nowhere near the break.
//
// `__hc.lightParams()` (added with the emitter table, 524e78f) reports every live slot with the level it serves, which is what makes
// this countable rather than a screenshot argument.
//
// RESULT, 2026-08-05: THE PREMISE IS FALSE IN THIS BUILD. Over sixteen stops on a widening ring out of spawn the pool is saturated at
// NONE of them — the histogram is 8 stops with zero lights, one each at 2/3/6/8/9 and three at 11 of 16. Worldgen emitters do not
// nearly fill it; the wood around spawn carries a handful of level-14 torches and long stretches carry none. The "14 of 16 with one
// lantern placed" reading that started this lead is not reproducible as a general statement about spawn.
// It DOES saturate on what a player builds: a ring of 20 torches fills all 16 slots, and breaking one still reads 16 — the promotion
// is real and instant, exactly as designed. So the pool is a fixed pool doing its job, the white-wash it was suspected of causing has
// a proven cause of its own (66d2bc2, bakeLight's lazy clear), and raising LIGHT_POOL would be paying shader lights on every fragment
// in the game for a saturation that only a torch ring produces. Not done, and this file is the reason why.
// Note when reading the output: `levels` can be LONGER than the lit-slot count. It lists the candidate emitters the pool considered,
// and a candidate at the far edge of the 34-block range is faded to zero intensity by `edge` — assigned a slot, contributing nothing.
//
//   node bench/tmp-pool-saturation.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:800,height:480},deviceScaleFactor:1});
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/'+String(process.env.HC_PAGE||'index.html')+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone(); __hc.freezeAnimals(true); __hc.setTime(0.75);`);
    const S=await page.evaluate(`__hc.st()`); const SX=Math.round(S.sx), SZ=Math.round(S.sz);
    const cap=await page.evaluate(`__hc.lightParams().pool.length`);
    // HOW OFTEN IS IT FULL IN ORDINARY PLAY — walked, not guessed, over a ring of stops around spawn.
    let full=0, tot=0, hist={};
    for(let i=0;i<16;i++){ const a=i*Math.PI/8, r=20+i*4;
      const x=Math.round(SX+Math.cos(a)*r), z=Math.round(SZ+Math.sin(a)*r);
      await page.evaluate(`(()=>{ const g=__hc.groundY(${x},${z}); __hc.tpAt(${x}+0.5,g+2,${z}+0.5); })()`);
      for(let k=0;k<10;k++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(300); }
      await sleep(500);
      const P=await page.evaluate(`__hc.lightParams()`);
      const n=P.pool.length; tot++; if(n>=16) full++; hist[n]=(hist[n]||0)+1;
      console.log(`  stop ${String(i).padStart(2)} @${x},${z}   ${String(n).padStart(2)} of 16 slots lit   levels ${JSON.stringify(P.poolLvl.filter(v=>v!=null))}`);
    }
    console.log(`\n  SATURATED (all 16 slots in use) at ${full} of ${tot} stops. Slot-count histogram ${JSON.stringify(hist)}`);
    // AND THE PROMOTION: place a cluster, then break the NEAREST lamp and see whether a light that was dark comes on.
    const gy=await page.evaluate(`(()=>{ const g=__hc.groundY(${SX},${SZ}); __hc.tpAt(${SX}+0.5,g+2,${SZ}+0.5); return g; })()`);
    for(let k=0;k<12;k++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(300); }
    const ring=[]; for(let i=0;i<20;i++){ const a=i*Math.PI/10; ring.push([Math.round(SX+Math.cos(a)*(6+i)), Math.round(SZ+Math.sin(a)*(6+i))]); }
    await page.evaluate(`(()=>{ ${ring.map(([x,z])=>`__hc.cmdRun('/setblock ${x} '+(__hc.groundY(${x},${z})+1)+' ${z} torch');`).join('')} })()`);
    for(let k=0;k<20;k++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1400);
    const before=await page.evaluate(`__hc.lightParams()`);
    console.log(`\n  with a ring of 20 torches placed: ${before.pool.length} of 16 slots lit, levels ${JSON.stringify(before.poolLvl.filter(v=>v!=null))}`);
    const near=ring[0];
    await page.evaluate(`__hc.cmdRun('/setblock ${near[0]} '+(__hc.groundY(${near[0]},${near[1]})+1)+' ${near[1]} air')`);
    for(let k=0;k<12;k++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(350); }
    await sleep(1200);
    const after=await page.evaluate(`__hc.lightParams()`);
    console.log(`  after breaking the nearest torch:  ${after.pool.length} of 16 slots lit, levels ${JSON.stringify(after.poolLvl.filter(v=>v!=null))}`);
    console.log(`\n  READ IT LIKE THIS: the pool being FULL is not a fault — it is a fixed pool doing its job. What would be a fault is`);
    console.log(`  the slot count being too small for what a player builds, and the histogram above is the number that says so. The`);
    console.log(`  promotion after a break is real and expected; it only matters if it is visible, and the wash it was suspected of`);
    console.log(`  causing has a proven cause of its own (66d2bc2).`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
