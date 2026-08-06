// THE LOAD TIMELINE, WITHOUT PERTURBING IT. Counters only, no screenshots — which is the whole point of it existing
// alongside bench/intro-visible.mjs. That one shoots a 720p PNG per sample and the shots throttle the renderer enough to
// slow chunk streaming: it showed the circle still up at 27 s and had me chasing a deadlock that was not there. This
// reads circleDone / initialReady / heldMs / watchdog / chunkHere and nothing else, and the same boot releases at ~10 s.
//
// It is also the only place the SPLIT is visible: circleDone goes true when the ground exists, initialReady long after,
// when the icon bake and the shader warm have finished — and the fps column shows what those cost now that they no
// longer have a flythrough to hide behind.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=u=>new Promise((res,rej)=>{const t0=Date.now();(function poll(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>20000?rej(new Error('down')):setTimeout(poll,250);});})();});
const B=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
try{
  const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
  const br=await chromium.launch({executablePath:B,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync']});
  const page=await (await br.newContext({viewport:{width:1280,height:720}})).newPage();
  page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,180)));
  await page.goto(base+'/index.html',{waitUntil:'load',timeout:120000});
  await page.waitForFunction(`!!window.__hc`,null,{timeout:120000});
  await sleep(3000); await page.click('#mb-solo'); const t0=Date.now();
  for(let i=0;i<9;i++){ await sleep(3000);
    const r=await page.evaluate(`(()=>{ const L=__hc.loadState(), p=__hc.probe(), s=__hc.st();
      return { circleDone:L.circleDone, initialReady:L.initialReady, readyR:L.readyR, heldMs:L.heldMs, watchdog:L.watchdog,
               loadVisible:L.loadVisible, chunkHere:p.chunkHere, chunk26:p.chunk26, px:+p.x.toFixed(1), pz:+p.z.toFixed(1), fps:s.fps }; })()`);
    console.log('@'+((Date.now()-t0)/1000).toFixed(0).padStart(3)+'s '+JSON.stringify(r)); }
  await br.close();
} finally { server.kill(); }
