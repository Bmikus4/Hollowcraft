// YOUR OWN THROWN SPEAR CAN KILL YOU (Ben's backlog item 23, first half: "own ricochets and thrown spears kill you").
//
// The flight tested the Wretch, the animals and the terrain and never the thrower, so a spear hurled straight up fell back through the
// player's head and did nothing. What is measured is HEALTH: throw one almost vertically, let it arc, and require a wound.
//
// The grace period is the thing most likely to be wrong in either direction, so both directions are checked: a spear thrown LEVEL must
// not hurt you at all (it leaves from inside your own capsule — throwSpear spawns it 0.6 forward of the eye), and a spear thrown UP must.
//
//   node bench/assert-spear-self-hit.mjs
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

    // ---- STRAIGHT UP ----
    const up=await page.evaluate(`__hc.spearSelf(1.2,true)`);   // straight: the probe zeroes the horizontal velocity — see the note there
    console.log('    thrown up', JSON.stringify(up));
    ok('a spear is in the air', up.spears>=1, up);
    // WALKED UNDER IT, because a straight-up throw is not reachable: player.pitch is clamped at 1.2 rad, so even a maximum-elevation
    // throw carries 10 m/s of horizontal speed and lands ten blocks away. The claim is "a spear in flight wounds the player it touches",
    // and standing under a descending spear is the honest way to stage that — it is also what will happen in play, since the spear is in
    // the air for a second and a half and the thrower is running.
    // THE PLAYER DOES NOT MOVE. With the horizontal component removed the spear must return to the column it left, so this is a plain
    // wait — no chasing, no teleporting into its path, nothing racy. The earlier version intercepted a moving spear and passed on one run
    // and failed the next, which is worse than no bench at all.
    let last=null;
    for(let i=0;i<60;i++){ await sleep(120); last=await page.evaluate(`__hc.spearFlight()`); if(last.health<20 || last.spears===0) break; }
    console.log('    after the arc', JSON.stringify(last));
    ok('a spear in flight wounds the thrower it touches', last.health<20, {health:last.health, spears:last.spears, stuck:last.stuck});

    // ---- LEVEL: it leaves from inside your own capsule and must NOT hurt you ----
    await page.evaluate(`__hc.heal&&__hc.heal()`);
    const lvl=await page.evaluate(`__hc.spearSelf(0)`);
    console.log('    thrown level', JSON.stringify(lvl));
    let l2=null;
    for(let i=0;i<8;i++){ await sleep(250); l2=await page.evaluate(`__hc.spearFlight()`); }
    console.log('    after a level throw', JSON.stringify(l2));
    ok('a level throw never hurts you', l2.health>=20, {health:l2.health});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
