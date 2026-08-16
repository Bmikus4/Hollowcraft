// THE TOOLS IN HAND, FULL FRAME. tmp-packshots crops to a 640x460 window on the item, which is exactly the wrong
// view for judging whether a hand is on the haft and where the arm runs. One shot per id, whole screen.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT,'bench','results','tools');
const IDS = process.argv.slice(2).length ? process.argv.slice(2) : ['iron_axe','iron_pickaxe','iron_shovel','iron_sword'];
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
    const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,120)));
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await p.evaluate("__hc.lock(true); __hc.pinScene(); __hc.freeze(true,false); __hc.setTime(0.27)");
    await sleep(1500);
    for(const id of IDS){ await p.evaluate(i=>__hc.hold(i), id); await sleep(700);
      await p.screenshot({ path: path.join(OUT,id+'.png') }); }
    console.log('errs:',errs.length?errs:'none','->',OUT);
    await b.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(String(e.message).slice(0,200)); process.exit(1); });
