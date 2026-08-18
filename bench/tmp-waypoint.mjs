// THE ISLAND'S TWO CENTRES, and the axis through the player.
// Checks the inscribed centre is ON LAND and further from water than the centroid is, prints both, then walks the
// player and confirms the axis actually follows him.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
page.on('console',m=>{const t=m.text(); if(/\[loop\] exception|not defined|not a function/i.test(t)) errs.push(t.slice(0,200));});
await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
await page.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.setTime(0.25);");
for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
await sleep(2500);
const t0=Date.now();
const insc=await page.evaluate("__hc.cmdRun('/waypoint island center')");
console.log('inscribed  ('+(Date.now()-t0)+'ms first call, includes the grid + transform)');
(insc.out||[]).forEach(l=>String(l).split('\n').forEach(x=>console.log('   '+x)));
const mass=await page.evaluate("__hc.cmdRun('/waypoint island center mass')");
console.log('mass');
(mass.out||[]).forEach(l=>String(l).split('\n').forEach(x=>console.log('   '+x)));
// THE TEST THAT MATTERS: the inscribed point must be on land and no nearer the sea than the centroid.
const C=await page.evaluate("(()=>{const C=__hc.islandCentres(); const d=(x,z)=>{let best=1e9; for(let a=0;a<64;a++){const th=a/64*6.2831853; for(let r=4;r<900;r+=4){ if(__hc.groundY(Math.round(x+Math.cos(th)*r),Math.round(z+Math.sin(th)*r))<=__hc.island().sea){ if(r<best)best=r; break; } }} return best;};"
 +"return {C, inscOnLand:__hc.groundY(Math.round(C.inscribed.x),Math.round(C.inscribed.z))>__hc.island().sea,"
 +" massOnLand:__hc.groundY(Math.round(C.mass.x),Math.round(C.mass.z))>__hc.island().sea,"
 +" inscClear:+d(C.inscribed.x,C.inscribed.z).toFixed(1), massClear:+d(C.mass.x,C.mass.z).toFixed(1)};})()");
console.log(`  inscribed on land ${C.inscOnLand}   nearest water ${C.inscClear} blocks`);
console.log(`  mass      on land ${C.massOnLand}   nearest water ${C.massClear} blocks`);
console.log(`  VERDICT: inscribed is ${C.inscClear>=C.massClear?'further from the sea — correct':'NEARER the sea — wrong'}`);
// And the axis follows the player.
await page.evaluate("__hc.cmdRun('/waypoint island center')");
const rd=async()=>await page.evaluate("(()=>{const a=__hc.wpAxis(); return a;})()");
const p1=await page.evaluate('__hc.pos()'); const a1=await rd();
await page.evaluate(`__hc.tpAt(${p1.x}+140, ${p1.y}+30, ${p1.z}-90);`); await sleep(1200);
const a2=await rd();
console.log('  axis bearing before', a1&&a1.bearingDeg, ' after moving 140,-90:', a2&&a2.bearingDeg,
            (a1&&a2&&Math.abs(a1.bearingDeg-a2.bearingDeg)>1)?' — it followed him':' — IT DID NOT MOVE');
// LOOK AT IT. Stand back from the waypoint and aim along the axis so the ticks and their labels are in frame.
const C2=await page.evaluate('__hc.islandCentres()');
const I=C2.inscribed;
// A vantage ON LAND about 150 blocks out from the centre — the first bearing that is dry the whole way.
const V=await page.evaluate(`(()=>{ const sea=__hc.island().sea;
  for(let a=0;a<32;a++){ const th=a/32*6.2831853;
    const x=Math.round(${I.x}+Math.cos(th)*150), z=Math.round(${I.z}+Math.sin(th)*150);
    const g=__hc.groundY(x,z); if(g>sea+2) return {x,z,g}; } return null; })()`);
await page.evaluate(`__hc.tpAt(${'${V.x}'}+0.5, ${'${V.g}'}+2, ${'${V.z}'}+0.5);`.replace('${V.x}',V.x).replace('${V.g}',V.g).replace('${V.z}',V.z));
await sleep(1500);
const ax=await page.evaluate('__hc.wpAxis()');
// face back down the axis toward the waypoint
{ const b=(await page.evaluate('__hc.wpAxis()')).bearingDeg*Math.PI/180;
  // bearing is waypoint->player, so looking BACK down the axis is the opposite direction
  await page.evaluate('__hc.cam({yaw:'+Math.atan2(-Math.cos(b+Math.PI), -Math.sin(b+Math.PI))+', pitch:0.02});'); }
await sleep(1200);
console.log('  ticks in frame at', JSON.stringify(await page.evaluate('__hc.wpAxis()')));
await page.screenshot({path:path.join(ROOT,'bench','results','waypoint.png')});
console.log(errs.length?('ERRORS: '+errs.slice(0,4).join(' | ')):'no errors');
await browser.close(); server.kill();
