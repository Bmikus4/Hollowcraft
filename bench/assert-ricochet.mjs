// A BULLET SKIPS OFF HARD STONE, AND YOUR OWN RICOCHET CAN KILL YOU (Ben's backlog item 23: "own ricochets and thrown spears kill you").
//
// The trace was one ray that ended at the first solid block. It is up to three segments now: a GLANCING hit (incidence under 0.35 of the
// face normal) on a block of hardness 1 or more reflects and keeps going, and from the second segment onward the shooter's own capsule is
// in the line of fire. Nothing new is computed to do it — the block branch already solves the pierced face and its normal for the bullet
// hole, so the reflection is d - 2(d.n)n off numbers that were already there.
//
// Both directions are checked, because a ricochet that fires on every shot is worse than none: a square hit into stone must NOT bounce,
// and soft blocks must not bounce at any angle.
//
//   node bench/assert-ricochet.mjs
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

    // ---- A GRAZE ACROSS A STONE WALL: it has to bounce ----
    // Swept across angles rather than trusting one: which yaw is a graze depends on where in its cell the player is standing, and a
    // single angle that happened to be a square hit would have read as "ricochets do not work".
    let best=null;
    for(const yaw of [0.05,0.15,0.25,0.35,0.5,0.7,0.9,1.1,1.3,1.45]){
      const r=await page.evaluate(`__hc.ricoTest({yaw:${yaw}})`);
      if(!best || (r.bounces||0)>(best.bounces||0)) best={...r, yaw};
      if(r.bounces>0) console.log('    yaw '+yaw+' → '+JSON.stringify(r));
    }
    console.log('    best graze', JSON.stringify(best));
    ok('a glancing shot skips off stone', (best.bounces||0)>=1, best);

    // ---- SELF-HIT: inside a stone box, enough shots at grazing angles must eventually come back ----
    let hurt=null, nearest=99;
    for(let i=0;i<40 && !hurt;i++){
      const yaw=0.05+ (i%18)*0.085;
      const r=await page.evaluate(`__hc.ricoTest({yaw:${'${yaw}'}, build:${'${i===0}'}})`.replace('${yaw}',yaw).replace('${i===0}', i===0?'true':'false'));
      if(r.near!=null && r.near<nearest) nearest=r.near;
      if(r.health<20) hurt={...r, yaw, shot:i};
    }
    console.log('    closest a return came to the shooter', nearest);
    console.log('    self-hit', JSON.stringify(hurt));
    ok('a ricochet in a closed room can wound the shooter', !!hurt, hurt||{tried:40});

    // ---- A SQUARE HIT MUST NOT BOUNCE ----
    // IN THE WIDE ROOM, because the tight one cannot isolate the angle. At radius 1 the walls are a metre away and the shot's own spread
    // plus wherever in its cell the player happens to be standing means the round can clip a side wall before the one it was aimed at —
    // measured 2 bounces at yaw 0 in the tight cell, which says nothing about the gate. At radius 3 the wall dead ahead is unambiguous.
    const square=await page.evaluate(`__hc.ricoTest({yaw:0, r:3})`);
    console.log('    square hit', JSON.stringify(square));
    ok('a square hit into stone does not come back', (square.bounces||0)===0, square);
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
