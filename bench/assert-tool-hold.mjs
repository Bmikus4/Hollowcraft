// IS EVERY TOOL IN THE HAND AND IN THE FRAME? (Ben 08-12: "none of the tool items are held in the players hand".)
// The pose was authored by orbiting the whole tool group, which moved the grip as well as the angle, so there was no
// fixed point for an arm to be solved to. Now the rotation is on the tool and the grip is a stated point — which
// makes both halves measurable: the fist's palm must land on that grip, and the tool must actually be on screen.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const IDS = process.argv.slice(2).length ? process.argv.slice(2) : ['iron_axe','iron_pickaxe','iron_shovel','iron_sword','wood_axe','diamond_pickaxe'];
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
    const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,120)));
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await p.evaluate("__hc.lock(true); __hc.pinScene(); __hc.freeze(true,false); __hc.setTime(0.27)");
    await sleep(1200);
    for(const id of IDS){
      await p.evaluate(i=>__hc.hold(i), id); await sleep(500);
      const r=await p.evaluate("__hc.heldBox()");
      console.log(id, JSON.stringify(r));
      T(id+': a hand is on it', r.hand===true, r);
      T(id+': the palm is on the grip', r.palmToGrip!=null && r.palmToGrip<0.10, {palmToGrip:r.palmToGrip});
      // 1.5% of the viewport is about a 120x60 px object: smaller than that and it is off the edge, not held.
      T(id+': it is in frame', r.onScreen>=0.015, {onScreen:r.onScreen, ndc:r.ndc});
      // …and not swallowing it. A held tool over a third of the screen is the "beam across the frame" failure.
      // EVERY CORNER IN FRONT OF THE CAMERA. A tool whose far end is behind the eye is the one that reads as a
      // beam across the screen, and it is the only version of "too big" that a bounding box can state plainly.
      T(id+': the whole tool is in front of the eye', r.front===8, {front:r.front, ndc:r.ndc});
      T(id+': it is not filling the screen', r.onScreen<=0.60, {onScreen:r.onScreen});
    }
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)':'ALL PASS');
    await b.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(String(e.message).slice(0,200)); process.exit(1); });
