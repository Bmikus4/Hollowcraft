// Scratch: why does a stone box not read as an interior? Deletable.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
(async()=>{
  const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:90000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(3500); const ev=s=>pg.evaluate(s);
    console.log('before ', await ev(`(()=>{const fx=Math.floor(player.pos.x),fz=Math.floor(player.pos.z);
      return {py:+player.pos.y.toFixed(2), top:opaqueTop(fx,fz), surf:surfaceH(fx,fz)};})()`));
    console.log('box    ', await ev('__hc.tenBox()'));
    await sleep(800);
    console.log('after  ', await ev(`(()=>{const fx=Math.floor(player.pos.x),fy=Math.floor(player.pos.y),fz=Math.floor(player.pos.z);
      let solids=0; for(let i=0;i<8;i++){const a=i*Math.PI/4; for(let r=1;r<=7;r++){ if(solidAt(Math.floor(player.pos.x+Math.cos(a)*r), Math.floor(player.pos.y+1.2), Math.floor(player.pos.z+Math.sin(a)*r))){solids++;break;} } }
      return {py:+player.pos.y.toFixed(2), top:opaqueTop(fx,fz), roofBlock:getBlock(fx,fy+4,fz), wallHits:solids, need:player.pos.y+1.6};})()`));
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
})();
