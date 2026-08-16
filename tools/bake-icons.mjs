// BAKE EVERY ITEM ICON TO A FILE, ONCE, OFFLINE (Ben's ask: icons pre-baked to disk).
//
// icon3DURL renders an item into a 100x100 render target, reads it back and encodes a PNG — about 4 ms — the first
// time that item is ever drawn. Paid at run time that is a stutter the first time the inventory is opened and again
// in the creative menu, on a machine that is also drawing the world. Paid here it is nothing.
//
// It renders through the GAME, not through a headless copy of the icon code: the models, the lights, the camera and
// the diagonal-fit rule for long items all live in index.html, and a second implementation of them would be a second
// set of icons that drift from the ones the game draws.
//
// Writes assets/icons/<id>.png and assets/icons/manifest.json. The game fetches that manifest at boot and uses the
// files for anything listed; anything not listed still bakes at run time, so this step is an optimisation and never
// a dependency.
//
// Run: node tools/bake-icons.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT, 'assets', 'icons');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const p=await (await b.newContext({viewport:{width:960,height:540}})).newPage();
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await sleep(1500);
    const ids=await p.evaluate("__hc.iconList()");
    console.log(ids.length,'items');
    const done=[]; let failed=0;
    // In batches, because a data URL for a 100x100 PNG is ~10 KB and all of them at once is a single CDP message
    // of several megabytes — which is slower than the bake it is carrying.
    for(let i=0;i<ids.length;i+=25){
      const batch=ids.slice(i,i+25);
      const urls=await p.evaluate(b=>b.map(id=>[id,__hc.iconBake(id)]), batch);
      for(const [id,u] of urls){
        if(!u){ failed++; continue; }
        fs.writeFileSync(path.join(OUT,id+'.png'), Buffer.from(u.split(',')[1],'base64'));
        done.push(id);
      }
      process.stdout.write('.');
    }
    fs.writeFileSync(path.join(OUT,'manifest.json'), JSON.stringify({icons:done.sort()},null,1));
    console.log('\nwrote',done.length,'icons,',failed,'items had no 3D icon (drawn ones — they cost nothing)');
    await b.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(String(e.message).slice(0,300)); process.exit(1); });
