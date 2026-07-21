// Night moon + moonglade: point the camera low at the horizon at night, sweep yaw, screenshot.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT, 'bench', 'results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('ERR',String(e.message).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&t=720',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true&&__hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await sleep(9000);
    // sweep yaw AND pitch (look up) to catch the small high moon disc
    for(const y of [0,1.05,2.1,3.14,4.2,5.2]){
      for(const p of [-0.7,-1.1]){
        await page.evaluate(`__hc.cam({yaw:${y},pitch:${p}})`);
        await sleep(300);
        await page.screenshot({ path: path.join(OUT,'moon-y'+String(y).replace('.','_')+'-p'+String(p).replace('.','_').replace('-','n')+'.png') });
      }
    }
    console.log('swept');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
