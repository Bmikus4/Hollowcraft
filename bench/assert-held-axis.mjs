// "SOME GUNS ARE SIDEWAYS" (Ben 08-12), with no gun named. There are two places that can mean and they belong to
// different people: sideways in the inventory TILE is the icon bake's orientation, sideways in the HAND is a model
// axis or a pose. This asks the second question of every gun at once so the report can be narrowed without Ben
// having to go through 22 weapons and find the one.
//
// The measurement is the held mesh's extents in CAMERA space. A gun points down the camera's -z, so its longest
// axis must be z; a gun lying across the view has its longest axis in x, and that is a fact a picture cannot state
// in a way a bench can act on.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const p=await (await b.newContext({viewport:{width:960,height:540}})).newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,140)));
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await p.evaluate("__hc.lock(true); __hc.pinScene(); __hc.freeze(true,false); __hc.setTime(0.27)");
    await sleep(1200);
    await p.evaluate("__hc.hold('ar15')"); await sleep(400);
    const ids=await p.evaluate("__hc.attProbe().guns")||[];
    const rows=[];
    for(const id of ids){
      const r=await p.evaluate(g=>__hc.heldAxis(g), id); await sleep(120);
      rows.push(Object.assign({id},r));
    }
    for(const r of rows) console.log(r.id.padEnd(16), r.axis, JSON.stringify(r.size), 'ratio', r.ratio);
    const sideways=rows.filter(r=>r.axis!=='z');
    T('no gun lies across the view', sideways.length===0, sideways.map(r=>[r.id,r.axis,r.size]));
    // A gun whose length barely beats its width is not sideways but is still not being held like a gun — a stubby
    // ratio is how a sawn-off and a mis-rotated rifle look the same in a screenshot.
    const stubby=rows.filter(r=>r.ratio<1.2);
    T('every gun is longer than it is wide, in the hand', stubby.length===0, stubby.map(r=>[r.id,r.ratio]));
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)':'ALL PASS');
    await b.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(String(e.message).slice(0,300)); process.exit(1); });
