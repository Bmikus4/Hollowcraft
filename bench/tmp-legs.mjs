// EIGHT LEGS, EVENLY SPREAD, NONE CROSSING THE BODY.
//   HC_PAGE=index.qa.html HC_TAG=before node bench/tmp-legs.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const PAGE=process.env.HC_PAGE||'index.html', TAG=process.env.HC_TAG||'now';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
let fails=0,checks=0; const ok=(n,c,d)=>{ checks++; if(!c)fails++; console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?('   '+JSON.stringify(d)):'')); };
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
const page=await (await browser.newContext({viewport:{width:900,height:600}})).newPage();
const errs=[]; page.on('pageerror',e=>{errs.push(String(e.message||e));console.log('  PAGEERROR:',String(e.message||e).slice(0,200));});
await page.goto(base+'/'+PAGE+'?debug=1',{waitUntil:'load',timeout:120000});
await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
const ev=js=>page.evaluate(js);
await ev('(()=>{ __hc.lock(true); __hc.setTime(0.42); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
await sleep(2500);
for(const type of ['spider','daddy']){
  await ev(`__hc.cmdRun("/spawn ${type} 1 4")`); await sleep(2000);
  const r=await ev(`__hc.legRig("${type}")`);
  if(!r || r.none || r.err){ console.log('  '+type+': '+JSON.stringify(r)); ok(type+': a rig could be read', false, r); continue; }
  // UNWRAP THE LEFT SIDE'S ANGLES. Its bearings straddle +-180 (142.5, 167.3, -167.3, -142.5 are one continuous fan around
  // 180), so sorting them raw reported a 285-degree "gap" and called an even fan uneven. The rig was right; the arithmetic was not.
  const un=f=>({...f, b:(f.side<0 && f.bearing<0) ? f.bearing+360 : f.bearing});
  const R=r.feet.filter(f=>f.side>0).map(un).sort((a,b)=>a.b-b.b);
  const L=r.feet.filter(f=>f.side<0).map(un).sort((a,b)=>a.b-b.b);
  console.log('  '+TAG+' '+type+'  right bearings '+JSON.stringify(R.map(f=>f.b))+'  x '+JSON.stringify(R.map(f=>f.x)));
  console.log('  '+TAG+' '+type+'  left  bearings '+JSON.stringify(L.map(f=>f.b))+'  x '+JSON.stringify(L.map(f=>f.x)));
  ok(type+': eight legs', r.n===8, r.n);
  // NO LEG CROSSES THE BODY. This is the fault in one line: a left foot at positive x has reached under the animal to the right.
  ok(type+': every RIGHT foot is on the right', R.length===4 && R.every(f=>f.x>0), R.map(f=>f.x));
  ok(type+': every LEFT foot is on the left', L.length===4 && L.every(f=>f.x<0), L.map(f=>f.x));
  // EVENLY SPREAD: the three gaps between four consecutive bearings, on each side, equal to within a few degrees.
  const gaps=a=>a.slice(1).map((f,k)=>+(f.b-a[k].b).toFixed(1));
  const gR=gaps(R), gL=gaps(L);
  const even=g=>g.length===3 && (Math.max(...g)-Math.min(...g))<6;
  console.log('  '+TAG+' '+type+'  gaps right '+JSON.stringify(gR)+'  left '+JSON.stringify(gL));
  ok(type+': the right fan is evenly spaced', even(gR), gR);
  ok(type+': the left fan is evenly spaced', even(gL), gL);
  // AND THE TWO SIDES MIRROR. |x| and z of the matched pairs agree, which is what "not skewed to one side" means.
  // PAIRED BY THE FAN INDEX, not by sort order: a right leg at bearing t mirrors the left leg at 180-t, and after unwrapping that
  // is L sorted descending against R ascending. Compared on |x| and z, which is what "mirrored" means for a rig facing forward.
  const Ld=[...L].sort((a,b)=>b.b-a.b);
  const mirror=R.every((f,k)=>{ const m=Ld[k]; return m && Math.abs(Math.abs(f.x)-Math.abs(m.x))<0.02 && Math.abs(f.z-m.z)<0.02; });
  ok(type+': the left side mirrors the right', mirror, {R:R.map(f=>[f.x,f.z]), L:L.map(f=>[f.x,f.z])});
}
ok('no page errors', errs.length===0, errs.slice(0,2));
console.log(`\n${checks-fails}/${checks} checks pass`);
await browser.close(); server.kill(); process.exit(fails?1:0);
