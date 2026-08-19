// Each pine is the image and its mirror on ONE arc: same u at both outer edges, mirrored at the join, and a
// single parabola with the join furthest from the player.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
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
const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,160)));
page.on('console',m=>{const t=m.text(); if(/\[loop\] exception|not defined|not a function/i.test(t)) errs.push(t.slice(0,160));});
await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
await page.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.setTime(0.25); localStorage.removeItem('hollowcraft_pines_v2'); __hc.cmdRun('/pines clear');");
const B=await page.evaluate('__hc.islandCentres().mass');
const P=await page.evaluate(`(()=>{ const th=150*Math.PI/180, sea=__hc.island().sea;
  for(let d=300; d>60; d-=4){ const x=Math.round(${B.x}+Math.cos(th)*d), z=Math.round(${B.z}+Math.sin(th)*d);
    if(__hc.groundY(x,z)>sea+1) return {x,z,g:__hc.groundY(x,z)}; } return null; })()`);
await page.evaluate(`__hc.tpAt(${P.x}+0.5, ${P.g}+3, ${P.z}+0.5);`);
for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
await sleep(2500);
await page.evaluate("__hc.cmdRun('/waypoint island center mass'); __hc.cmdRun('/waypoint shore'); __hc.cmdRun('/waypoint radius'); __hc.cmdRun('/pines at 180');");
await sleep(1500);
const U=await page.evaluate('__hc.pinesMeshUV()');
for(const m of U){
  console.log(`  pine dial ${m.dial}  total width ${m.w}`);
  console.log(`    left  x ${String(m.left.x).padStart(7)}  u ${m.left.u}  z ${m.left.z}`);
  console.log(`    join  x ${String(m.join.x).padStart(7)}  u ${m.join.u}  z ${m.join.z}`);
  console.log(`    right x ${String(m.right.x).padStart(7)}  u ${m.right.u}  z ${m.right.z}`);
  const mirrored = Math.abs(m.left.u-m.right.u)<0.02 && Math.abs(m.join.u-(1-m.left.u))<0.02;
  const oneArc   = m.join.z < m.left.z-0.5 && m.join.z < m.right.z-0.5 && Math.abs(m.left.z-m.right.z)<0.5;
  console.log(`    mirrored about the join: ${mirrored}   one arc, join furthest: ${oneArc}`);
}
const az=180*Math.PI/180;
await page.evaluate('__hc.cam({yaw:'+Math.atan2(-Math.cos(az),-Math.sin(az))+', pitch:0.03});'); await sleep(1200);
await page.screenshot({path:path.join(ROOT,'bench','results','pines-mirrored.png')});
console.log(errs.length?('  ERRORS: '+errs.slice(0,3).join(' | ')):'  no page errors');
await browser.close(); server.kill();
