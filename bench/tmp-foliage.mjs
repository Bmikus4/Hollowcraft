import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
let fails=0,checks=0; const ok=(n,c,d)=>{ checks++; if(!c)fails++; console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?('   '+JSON.stringify(d)):'')); };
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
const page=await (await browser.newContext({viewport:{width:900,height:600}})).newPage();
const errs=[]; page.on('pageerror',e=>{errs.push(String(e.message||e));console.log('PAGEERROR:',String(e.message||e).slice(0,200));});
await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
const ev=js=>page.evaluate(js);
await ev('(()=>{ __hc.lock(true); __hc.setTime(0.42); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
await sleep(2500);
for(const id of ['tallgrass','meadow_grass','fern','foxglove','sapling','stone']){
  await ev(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${id} 1")`); await ev(`__hc.hold("${id}")`); await sleep(500);
  const s=await ev('__hc.heldSig()'), m=await ev('__hc.heldMats()');
  console.log('  '+id.padEnd(15)+JSON.stringify({meshes:s.meshes,tris:s.tris,sprite:s.sprite,mats:s.mats}));
  if(id==='stone'){ ok('a SOLID block is still a cube', s.sprite===false && s.tris<=12, {tris:s.tris,sprite:s.sprite}); }
  else {
    ok(id+' is an extruded card, not a cube', s.sprite===true, {sprite:s.sprite});
    // A CUBE IS 12 TRIANGLES. A pixel-walked blade is hundreds — and if the tile's alpha were lost in the atlas copy every
    // pixel would be opaque, giving a full 16x16 slab: 512 front+back plus the whole rim. So the count proves alpha survived.
    ok(id+': its pixels were cut by alpha, not a full slab', s.tris>40 && s.tris<900, {tris:s.tris});
  }
}
ok('no page errors', errs.length===0, errs.slice(0,2));
console.log(`\n${checks-fails}/${checks} checks pass`);
await browser.close(); server.kill(); process.exit(fails?1:0);
