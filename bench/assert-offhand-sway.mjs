// THE OFFHAND GUN IS LOCKED TO THE HAND THAT HOLDS IT (Ben 08-05: the offhand gun "rotates around fluidly when i walk, isnt
// locked to the arm"). Its sway is applied with +=, and its x and z POSITION and x ROTATION are rebased from a captured base every
// frame — but rotation.y and rotation.z were only ever added to, so every frame of sideways movement turned the gun a little
// further and it never came back. Drives 150 frames of constant strafe through __hc.offSway and reads the rotations.
//   node bench/assert-offhand-sway.mjs
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
const W=900,H=600;
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(W/2,H/2); await sleep(1200);
    await page.evaluate(`(()=>{ const p=__hc.probe(); __hc.tp(p.x,p.gyHere+2,p.z); __hc.giveItem('rifle_ammo',200); })()`); await sleep(500);
    for(const id of ['ar15','revolver','hunting_rifle','minigun']){
      const r=await page.evaluate(`__hc.offSway({id:'${id}', frames:150, lat:4})`);
      console.log('   ', id.padEnd(15), JSON.stringify({maxAbsY:r.maxAbsY, maxAbsZ:r.maxAbsZ, end:r.end, rest:r.rest, baseRY:r.baseRY, baseRZ:r.baseRZ, gunLat:r.gunLat}));
      console.log('       samples', JSON.stringify(r.samples));
      if(r.err){ ok(id+': the sway could be driven', false, r); continue; }
      // The lean is 0.05 of yaw and 0.055 of roll at full lateral velocity, so a REBASED pose cannot exceed those. Accumulated,
      // 150 frames of it reach 7.5 and 8.25 radians — the gun turns over and over, which is what "rotates around fluidly" is.
      ok(id+': the yaw lean stays a lean', r.maxAbsY<=0.06, {maxAbsY:r.maxAbsY, coefficient:0.05});
      ok(id+': …and so does the roll', r.maxAbsZ<=0.09, {maxAbsZ:r.maxAbsZ, coefficient:0.055});
      // And it comes home. An accumulated rotation stays wherever the movement left it, which is the "isnt locked" half.
      ok(id+': and it returns to rest when you stop', Math.abs(r.rest.y-(r.baseRY||0))<0.01 && Math.abs(r.rest.z-(r.baseRZ||0))<0.02, {rest:r.rest, baseRY:r.baseRY, baseRZ:r.baseRZ});
      // The signal was really applied — otherwise all three of the above pass on a gun that never swayed at all.
      // Not vacuous: the strafe signal reached the pose. Read while moving — it eases back to nothing the moment you stop, so a
      // reading taken after the settle says the strafe never happened, which is how the first run of this reported 0 on a gun
      // that had visibly leaned.
      ok(id+': the strafe really was being felt', Math.abs(r.gunLat)>0.3 && r.maxAbsY>0.005, {gunLat:r.gunLat, maxAbsY:r.maxAbsY});
    }
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
