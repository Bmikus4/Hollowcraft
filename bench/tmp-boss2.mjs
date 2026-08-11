import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:1000,height:640}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR',String(e.message||e).slice(0,240)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(500,320); await sleep(2000);
    const shot=async(name,dist,up)=>{
      await page.evaluate(`__hc.boss({park:1,dist:${dist},up:${up}})`);
      await sleep(2200);
      await page.evaluate(`(()=>{const p=__hc.pos(); return __hc.aimAt(p.x, p.y+${up}, p.z-${dist});})()`);
      await sleep(1200);
      await page.screenshot({ path: path.join(ROOT,'bench','results','boss-'+name+'.png') });
      console.log(name, JSON.stringify(await page.evaluate(`__hc.bossHp()`)));
    };
    await shot('close',14,4);
    await shot('mid',26,7);
    // phase 2 through the real damage path
    for(let i=0;i<70;i++){ const r=await page.evaluate(`__hc.hurtBoss(400)`); if(r.phase>=2) break; }
    await sleep(2500); await shot('p2',26,7);
    for(let i=0;i<70;i++){ const r=await page.evaluate(`__hc.hurtBoss(400)`); if(r.phase>=3) break; }
    await sleep(3000); await shot('p3',26,7);
    await b.close();
  } finally { server.kill(); }
  process.exit(0);
})();
