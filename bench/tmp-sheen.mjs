// BLACK TEXELS ON A LIT FACE: Ben's own repro - a held light, a dark area - swept against the sheen dial.
// ISOLATED BLACK is the number that matters: a black pixel with a LIT neighbour. A wholly dark frame is not the
// fault (that is night, and it is signed off); a black speck inside a lantern's pool is.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net'; import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const SHOT='C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/f3f45f2f-6bb7-4d56-87a5-95b314c4601d/scratchpad/sheen';
fs.mkdirSync(SHOT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const MEASURE = `(()=>{ const c=document.createElement('canvas'); const gl=document.querySelector('canvas');
  c.width=gl.width; c.height=gl.height; const g=c.getContext('2d'); g.drawImage(gl,0,0);
  const d=g.getImageData(0,0,c.width,c.height).data, W=c.width, H=c.height;
  const L=(i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
  let black=0, iso=0, lit=0, n=0, sum=0;
  for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){ const i=(y*W+x)*4, l=L(i); n++; sum+=l;
    if(l>24) lit++;
    if(l<8){ black++;
      if(L(i-4)>24||L(i+4)>24||L(i-W*4)>24||L(i+W*4)>24) iso++; } }
  return { mean:+(sum/n).toFixed(2), pctBlack:+(100*black/n).toFixed(3), pctIsolatedBlack:+(100*iso/n).toFixed(4), pctLit:+(100*lit/n).toFixed(2) }; })()`;
(async()=>{ const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  let b; try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const p=await (await b.newContext({viewport:{width:960,height:540}})).newPage();
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await p.evaluate("__hc.lock(true); __hc.pinScene(); __hc.freeze(true,false); __hc.freezeT(12.0); __hc.setTime(0.75);");
    // a dark place with a light in hand: his exact case
    await p.evaluate("__hc.hold('flashlight'); __hc.flashlight({on:true});");
    await sleep(4000);
    for(const k of (process.env.KS||'0,0.08,0.16,0.30,0.60').split(',')){
      await p.evaluate(`__hc.sheen({k:${k}})`); await sleep(1200);
      const m=await p.evaluate(MEASURE);
      await p.screenshot({path:SHOT+'/k'+k+'.png'});
      console.log('k='+k.padEnd(5), JSON.stringify(m));
    }
  } finally { if(b)await b.close(); server.kill(); } })();
