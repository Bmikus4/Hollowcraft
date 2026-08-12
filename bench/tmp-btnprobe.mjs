import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = 'D:\\Code\\Minecraft', OUT = path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=u=>new Promise((res,rej)=>{const t0=Date.now();(function poll(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>Date.now()-t0>15000?rej():setTimeout(poll,250));})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const bpath=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p=>fs.existsSync(p));
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
try{
  const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
  const br=await chromium.launch({executablePath:bpath,headless:true,args:['--mute-audio']});
  const p=await (await br.newContext({viewport:{width:1280,height:720}})).newPage();
  await p.goto(base+'/index.html',{waitUntil:'load'}); await sleep(3500);
  console.log('css', JSON.stringify(await p.evaluate(()=>{
    const b=document.getElementById('mb-multi'); const cs=getComputedStyle(b,'::before');
    return { bg:cs.backgroundImage.slice(0,70), z:cs.zIndex, top:cs.top, pos:cs.position,
             clip:cs.clipPath.slice(0,44), hostZ:getComputedStyle(b).zIndex, hostBg:getComputedStyle(b).backgroundImage.slice(0,30) }; })));
  // Sample the middle of a non-hovered button and, for reference, the art just outside it.
  const box=await p.evaluate(()=>{ const r=document.getElementById('mb-multi').getBoundingClientRect();
    return {cx:Math.round(r.x+r.width/2), cy:Math.round(r.y+r.height/2), x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)}; });
  await p.screenshot({path:path.join(OUT,'btn-probe.png'),clip:{x:box.x-30,y:box.y-10,width:box.w+60,height:box.h+20}});
  const { PNG } = await import('pngjs').catch(()=>({PNG:null}));
  console.log('box', JSON.stringify(box));
  await br.close();
} finally { try{ server.kill(); }catch(e){} }
