// IS THE WRETCH IN HIS ANIMATION WHEN HE RUNS AT YOU? Ben, twice, the second time with "this needs to be fixed once
// and for all" — which is a demand for an assertion, not another visual pass. It has been fixed by eye before and
// come back, because nothing in the build could state the fault as a number.
//
// THE FAULT, STATED: the state machine commits to closing the distance (HUNT/CHASE, committed) and the RIG is left
// in whatever pose it held, so a body travelling at a charge's speed stands upright with its arms down. crawl IS the
// charge pose on this rig — the all-fours gallop, the forward torso pitch (leanT = claw*1.15) and the hunch all hang
// off it — so `speed high && crawl low` is the bug with no inference in between.
//
// It samples over a real approach rather than one frame: a charge is a second and a half of travel, and a single
// frame can catch the one tick where a pose is easing in. What fails the run is a SUSTAINED disagreement.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const p=await (await b.newContext({viewport:{width:900,height:500}})).newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,140)));
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await p.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/heal 20')");
    await sleep(1000);

    // A REAL CHARGE, not a synthesised one: summon him and let the brain choose to come. Under 16 blocks
    // chooseSummonAction commits to HUNT outright, which is the case Ben is describing.
    // SUMMON RETURNS WHETHER HE IS ACTUALLY THERE, and spawnWretch can decline (it needs a spot). Retry rather than
    // sampling 70 frames of an empty world and calling the result a pass.
    let up=false;
    for(let i=0;i<10 && !up;i++){ up=await p.evaluate("__hc.summon()"); await sleep(900); }
    console.log('summoned:', up, JSON.stringify(await p.evaluate("__hc.wretchPose()")));
    const samples=[];
    for(let i=0;i<70;i++){
      const r=await p.evaluate("__hc.wretchPose()");
      if(r && r.active) samples.push(r);
      await sleep(100);
    }
    const moving=samples.filter(s=>s.charging);
    const bad=moving.filter(s=>!s.posed);
    const states={}; for(const s of samples) states[s.state]=(states[s.state]|0)+1;
    console.log('states seen', JSON.stringify(states));
    console.log('samples', samples.length, 'moving fast', moving.length, 'of those unposed', bad.length);
    if(moving.length) console.log('worst', JSON.stringify(moving.slice(0,3).map(s=>({st:s.state,spd:s.speed,crawl:s.crawl}))));

    T('he actually came for the player', moving.length>=5, {moving:moving.length, states});
    // THE RULE. A body travelling at a charge's speed is in the charge's pose. One or two frames of easing in are
    // allowed — the pose ramps at dt*4, so a quarter second of it is legitimate — a sustained disagreement is not.
    T('he is never running at the player out of his animation', bad.length<=Math.max(2,Math.round(moving.length*0.15)),
      {unposed:bad.length, ofMoving:moving.length, worst:bad.slice(0,3)});
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)':'ALL PASS');
    await b.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(String(e.message).slice(0,300)); process.exit(1); });
