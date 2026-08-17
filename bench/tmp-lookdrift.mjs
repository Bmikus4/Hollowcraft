// DOES THE VIEW MOVE WITH THE HAND STILL? Flick, stop, then watch the yaw for two seconds.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net'; import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft'; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
(async()=>{ const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  let b; try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await p.evaluate("__hc.lock(true)"); await sleep(800);
    const yaw=async()=>+(await p.evaluate("__hc.sight().yaw"));
    // A HARD FLICK: real mousemove events with real movementX, the same ones the look handler reads.
    for(let i=0;i<12;i++){ await p.mouse.move(300+i*40, 360); await sleep(8); }
    const atStop=await yaw();
    const rows=[];
    for(const w of [100,250,500,1000,2000]){ await sleep(w===100?100:(w-rows.reduce((a,r)=>0,0))); rows.push([w, +(await yaw()).toFixed(6)]); }
    console.log('yaw at stop', atStop.toFixed(6));
    console.log('after stop  ', JSON.stringify(rows));
    const drift=Math.abs(rows[rows.length-1][1]-rows[1][1]);
    console.log('DRIFT between 250ms and 2000ms after the hand stopped:', drift.toFixed(6), 'rad', drift<1e-6?'(still)':'(MOVING)');
  } finally { if(b)await b.close(); server.kill(); } })();
