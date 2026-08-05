// Main hand vs offhand, same gun, same burst: the viewmodel buck and the camera's own climb.
// node bench/tmp-offrecoil.mjs
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
    const page=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    page.on('pageerror',e=>console.log('  pageerror', String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(450,300); await sleep(1200);
    await page.evaluate(`(()=>{ const p=__hc.probe(); __hc.tp(p.x,p.gyHere+2,p.z); __hc.giveItem('rifle_ammo',400); })()`);
    for(const id of ['ar15','revolver','hunting_rifle']){
      const off=await page.evaluate(`__hc.offFire(6,'${id}')`);
      console.log('  OFF ', id.padEnd(15), JSON.stringify(off));
      const main=await page.evaluate(`(()=>{ __hc.offNone(); __hc.hold('${id}'); __hc.giveItem('rifle_ammo',400);
        const p0=__hc.cam().pitch; const v0=__hc.fireFx(true);
        const f=__hc.fire(6);
        const peak=__hc.fireFx();
        return { fired:f.fired, camClimb:+(__hc.cam().pitch-p0).toFixed(4), peak }; })()`);
      console.log('  MAIN', id.padEnd(15), JSON.stringify(main));
      await sleep(300);
    }
    await b.close();
  } finally { server.kill(); }
})();
