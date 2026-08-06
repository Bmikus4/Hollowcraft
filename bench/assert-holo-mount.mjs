// A HOLOSIGHT STANDS ON THE GUN, IT IS NOT SUNK INTO IT (Ben 08-05: "holosights are centered, but they are now pushed inside the guns
// (pushed down), which absolutley should not happen. fix it for all guns").
//
// ea298df read his earlier "holosight adjustment WENT THE WRONG WAY" as an instruction to invert the sign and took 0.035 off every dot
// gun's mount: minigun 0.115 -> 0.080, AR 0.116 -> 0.081, hunting rifle 0.0775 -> 0.0425. But the mount height is what stands the optic
// on the rail — subtracting from it does not lower the gun, it buries the sight in the receiver. The mounts are back on the rail, and
// "the gun rides lower" comes from where it always came from: the aimed pose pins the rear GLASS to the camera axis, so a taller mount
// necessarily hangs the weapon further below the eye.
//
// THE MEASUREMENT IS NOT THE MOUNT NUMBER. 0.08 is proud of one receiver and inside another, so this compares the sight's own lowest
// point against the highest point of the gun beneath it, restricted to the meshes that actually sit under the sight's footprint — or the
// magazine and the stock decide "the top of the gun" and every optic looks fine.
//
//   node bench/assert-holo-mount.mjs
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

    const r=await page.evaluate(`__hc.holoMounts()`);
    if(r.err){ console.log('  probe failed', JSON.stringify(r)); process.exit(1); }
    const dots=Object.entries(r).filter(([k,v])=>v && v.dot===true);
    const irons=Object.entries(r).filter(([k,v])=>v && v.dot===false);
    for(const [id,v] of dots) console.log('    '+id.padEnd(34), JSON.stringify(v));
    for(const [id,v] of irons) console.log('    '+id.padEnd(34), JSON.stringify(v));

    ok('every dot gun in the game is measured', dots.length>=6, {found:dots.length, ids:dots.map(d=>d[0])});
    ok('the irons guns are here as a control, with no sight subtree', irons.length>=1, irons.map(i=>i[0]));

    // THE CLAIM IS aboveFrac, AND clear IS NOT IT. A rail clamp wraps the rail, so a correctly mounted optic's lowest point sits a few
    // millimetres BELOW the top of the receiver — the AR measures clear -0.0023 mounted properly. Asserting clear >= 0 would demand the
    // sight levitate. What separates a clamp from a burial is how much of the sight stands above the body: 0.86-0.97 with the mounts on
    // the rail, against 0.45-0.56 at ea298df's lowered mounts, where half the optic was inside the gun.
    const sunk=dots.filter(([id,v])=>v.aboveFrac!=null && v.aboveFrac < 0.8);
    ok('no holosight is sunk into its gun', sunk.length===0, sunk.map(([id,v])=>({id, aboveFrac:v.aboveFrac, clear:v.clear, bodyAt:v.bodyAt})));
    console.log('    aboveFrac', JSON.stringify(dots.map(([id,v])=>[id,v.aboveFrac])));
    // Not floating either: the clamp still has to touch the rail it grips.
    const floaty=dots.filter(([id,v])=>v.clear!=null && v.clear > 0.02);
    ok('and none is floating off the rail', floaty.length===0, floaty.map(([id,v])=>({id, clear:v.clear})));
    // The optical axis must clear the body outright — a dot you cannot see over is the failure Ben is describing at its worst.
    const blocked=dots.filter(([id,v])=>v.dotY!=null && v.bodyTop!=null && v.dotY <= v.bodyTop);
    ok('every optical axis sits above the gun body', blocked.length===0, blocked.map(([id,v])=>({id, dotY:v.dotY, bodyTop:v.bodyTop})));

    // The three mount heights are back on the rail. Named per family because the three receivers are different heights.
    const mount=id=>{ const e=dots.find(([k])=>k===id); return e?e[1].mountY:null; };
    ok('the AR mount is back to 0.116, not 0.081', Math.abs(mount('ar15_dot')-0.116)<0.0005, {mountY:mount('ar15_dot')});
    ok('the minigun mount is back to 0.115, not 0.080', Math.abs(mount('minigun_dot')-0.115)<0.0005, {mountY:mount('minigun_dot')});
    ok('the hunting rifle mount is back to 0.0775, not 0.0425', Math.abs(mount('hunting_rifle_dot')-0.0775)<0.0005, {mountY:mount('hunting_rifle_dot')});
    // The suppressed builds share the same mount lines, so they must agree exactly with their unsuppressed twins.
    const pairs=[['ar15_dot','ar15_suppressed_dot'],['minigun_dot','minigun_suppressed_dot'],['hunting_rifle_dot','hunting_rifle_suppressed_dot']];
    const drift=pairs.filter(([a,c])=>mount(a)!=null && mount(c)!=null && Math.abs(mount(a)-mount(c))>0.0005);
    ok('a suppressor does not move the optic', drift.length===0, drift.map(([a,c])=>({a, av:mount(a), c, cv:mount(c)})));

    // dotY is what the aimed pose centres, and it has to track the mount or the reticle and the glass disagree.
    const badDot=dots.filter(([id,v])=>v.dotY==null || Math.abs(v.dotY-(v.mountY+0.017))>0.0005);
    ok('every dotY is its own mount plus the optical axis', badDot.length===0, badDot.map(([id,v])=>({id, mountY:v.mountY, dotY:v.dotY})));
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
