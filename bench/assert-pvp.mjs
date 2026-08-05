// A ROUND CAN WOUND ANOTHER PLAYER — AND ONLY WHEN THE SESSION ASKED FOR IT (Ben's item 23, PVP half).
//
// _traceBullet already walked a segmented ray past the shooter's own capsule (the ricochet self-hit). PVP is that same walk tested
// against NET.peers: whoever is first along the line takes the round, straight shot or ricochet alike. The damage travels on the 'dmg'
// packet the seraph's eye beam already uses, so the victim's page applies its own damage() — owner-authoritative, no host arbitration.
//
// TWO ASSERTIONS, AND THE SECOND IS THE POINT. Friendly fire is off unless the page is opened with ?pvp, so a hit count that does not
// fall to zero with PVP off would mean every co-op session is a killbox. The probe reports the packet the trace built rather than a
// boolean, because netSend drops silently without a socket and a flag is not a hit.
//
//   node bench/assert-pvp.mjs
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

    // ---- PVP ON: a peer standing in the lane is hit, and the packet says so ----
    // Several ranges, because the trace steps in 0.35 m and the round carries the hip spread: one distance that happened to fall between
    // two samples of a 0.6 m capsule would read as "PVP does not work".
    let hit=null;
    for(const d of [2,3,5,8,12]){
      const r=await page.evaluate(`__hc.pvpTest({d:${d}, shots:6, on:true})`);
      console.log('    d='+d+' → '+JSON.stringify(r));
      if((r.hits||0)>0 && !hit) hit=r;
    }
    ok('a round finds another player', !!hit, hit||{no:'no range hit'});
    ok('the damage rides the peer dmg packet', !!(hit&&hit.pkt&&hit.pkt.t==='dmg'&&hit.pkt.to===7&&hit.pkt.v>0), hit&&hit.pkt);
    ok('it is bullet-kind, so a shield answers it', !!(hit&&hit.pkt&&hit.pkt.k==='bullet'), hit&&hit.pkt);
    ok('the shooter is unhurt by his own straight shot', !!(hit&&hit.myHealth===20), hit&&{h:hit.myHealth});

    // ---- PVP OFF (the default): the same shot at the same peer does nothing ----
    const off=await page.evaluate(`(()=>{ const out=[]; for(const d of [2,3,5,8,12]) out.push(__hc.pvpTest({d, shots:6, on:false})); return out; })()`);
    const offHits=off.reduce((a,r)=>a+(r.hits||0),0);
    console.log('    pvp off, all ranges → hits '+offHits);
    ok('friendly fire is off unless the page asked for it', offHits===0, off.map(r=>r.hits));
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
