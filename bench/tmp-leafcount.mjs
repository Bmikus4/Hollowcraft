// DOES THE CANOPY RULE STILL SHED LEAVES IN A WOOD? The fix thins the batch where there are no trees;
// the regression it could cause is thinning it everywhere. Counts live (size>0) leaves at the open
// shore and under the canopy at spawn, ten samples each.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
(async()=>{ const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null;
  try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:900,height:520}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await pg.waitForFunction("(()=>{try{const l=document.getElementById('load');return !l||l.style.display==='none';}catch(e){return false;}})()",null,{timeout:300000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(4000); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)');
    const live=()=>ev('__hc.leaves()');
    const at=async(label)=>{ const a=[]; for(let k=0;k<10;k++){ await sleep(500); a.push((await live()).live); }
      a.sort((x,y)=>x-y); console.log('  '+label.padEnd(7)+'live leaves '+JSON.stringify(a)+'   median '+a[5]); };
    console.log('  start '+JSON.stringify(await live()).slice(0,110));
    await at('shore');
    // INTO THE WOOD: step out along bearings until __hc.leaves reports a crown over the eye. A hand-picked
    // coordinate photographs whatever happens to be there today.
    const P=await ev('__hc.probe()'); let found=null;
    outer: for(let d=12; d<=180; d+=12){ for(let k=0;k<8;k++){ const a=k*Math.PI/4;
      await ev(`__hc.tp(${(P.x+Math.cos(a)*d).toFixed(1)}, ${(P.z+Math.sin(a)*d).toFixed(1)})`);
      for(let m=0;m<3;m++){ await ev('typeof streamChunks==="function"&&streamChunks(160,160)').catch(()=>{}); await sleep(260); }
      const L=await live(); if(L.canopyHere>=0 && L.visible){ found=[d,k]; break outer; } } }
    console.log('  canopy found '+JSON.stringify(found)+'  '+JSON.stringify(await live()).slice(0,110));
    await at('wood');
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
})();
