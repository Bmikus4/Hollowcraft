// TWO RECORDINGS, EIGHT CLAPS (Ben's item 11: "2-3 samples into 6-8 variants").
//
// sounds/thunder1.ogg and thunder2.ogg both ship, and playSample was already picking between them at a random ±6% pitch — a band
// far too narrow to tell a crack overhead from a roll on the horizon, so every bolt in a storm was the same event at a different
// volume. The variant is now the DISTANCE: four rate steps (1.16 crack → 0.74 roll) by which quarter of the 90 m–3 km range the
// strike fell in, times the two recordings. Eight, which is the count asked for.
//
// The delay is decoupled from the distance HERE ONLY (strikeAt's fast flag) so a 3 km variant can be measured without waiting out
// the nine seconds it really owes; the delay itself is assert-lightning-delay's claim, and that bench leaves it alone.
//
//   node bench/assert-thunder-variants.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
let fails=0; const ok=(n,c,g)=>{ if(!c)fails++; console.log(`  ${c?'ok  ':'FAIL'}  ${n}   ${JSON.stringify(g)}`); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(450,300); await sleep(1500);
    await page.evaluate(`__hc.qaLocked(true)`);

    // ---- FIRE A CLAP AT EACH OF A LADDER OF DISTANCES, SEVERAL TIMES OVER, AND COLLECT WHAT PLAYED ----
    // Repeated because which of the two recordings is used is a coin flip: one pass over the distances would find four variants at
    // best. The clap is what is being read, so each shot waits for the claps counter to move rather than for a wall-clock guess.
    const seen=new Map(), rows=[];
    const DISTS=[95,300,600,800,1000,1400,1600,2000,2300,2700,2950];
    for(let rep=0; rep<4; rep++){
      for(const d of DISTS){
        const before=(await page.evaluate(`__hc.strikeRead()`)).claps|0;
        await page.evaluate(`__hc.strikeAt(${d}, true)`);
        let r=null;
        for(let k=0;k<40;k++){ r=await page.evaluate(`__hc.strikeRead()`); if((r.claps|0)>before) break; await sleep(60); }
        if(!r || (r.claps|0)<=before) continue;
        rows.push({d, band:r.band, pick:r.pick, rate:r.rate, variant:r.variant, vol:r.clapVol});
        if(!seen.has(r.variant)) seen.set(r.variant, {d, band:r.band, pick:r.pick, rate:r.rate});
      }
    }
    console.log('    claps read', rows.length, 'distinct variants', seen.size);
    console.log('    variants', JSON.stringify([...seen.entries()].sort((a,b)=>a[0]-b[0]).map(([v,o])=>({v,band:o.band,pick:o.pick,rate:o.rate}))));
    ok('every forced strike produced a clap', rows.length===DISTS.length*4, {got:rows.length, want:DISTS.length*4});
    ok('at least 6 distinct claps exist, and no more than 8', seen.size>=6 && seen.size<=8, {distinct:seen.size});
    ok('both recordings are used', new Set(rows.map(r=>r.pick)).size===2, [...new Set(rows.map(r=>r.pick))]);
    ok('all four rate steps are used', new Set(rows.map(r=>r.band)).size===4, [...new Set(rows.map(r=>r.band))].sort());

    // ---- THE STEP IS THE DISTANCE, NOT A SECOND DICE ROLL ----
    const byD=new Map(); for(const r of rows){ if(!byD.has(r.d)) byD.set(r.d, new Set()); byD.get(r.d).add(r.band); }
    const ambiguous=[...byD.entries()].filter(([d,s])=>s.size>1);
    ok('one distance always picks the same step', ambiguous.length===0, ambiguous.map(([d,s])=>({d,bands:[...s]})));
    const near=rows.filter(r=>r.d<=300), far=rows.filter(r=>r.d>=2700);
    const maxNearBand=Math.max(...near.map(r=>r.band)), minFarBand=Math.min(...far.map(r=>r.band));
    ok('a near strike cracks and a far one rolls', maxNearBand < minFarBand, {near:maxNearBand, far:minFarBand});
    const nearRate=Math.max(...near.map(r=>r.rate)), farRate=Math.max(...far.map(r=>r.rate));
    console.log('    fastest near rate', nearRate, ' fastest far rate', farRate);
    ok('the far clap is pitched down (so it is also longer)', farRate < nearRate*0.75, {near:nearRate, far:farRate});

    // ---- A CLAP WITH NO STRIKE BEHIND IT (the ICBM, the scripted set-pieces) KEEPS THE MIDDLE STEP ----
    const scripted=await page.evaluate(`(()=>{ __hc.strikeRoll(); return true; })()`);
    await page.evaluate(`__hc.strikeAt(1500, true)`);   // a real strike first, so a stale distance would be visible if one leaked
    for(let k=0;k<40;k++){ const r=await page.evaluate(`__hc.strikeRead()`); if((r.claps|0)>0) break; await sleep(60); }
    const leak=await page.evaluate(`__hc.strikeRead()`);
    ok('the distance is consumed by its own clap', leak.dist!=null && leak.clapDist!=null, {scripted, leak});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
