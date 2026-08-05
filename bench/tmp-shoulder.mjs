// The third-person shouldering pose, in numbers: where each hand ends up in body space and how far the support hand is from the
// forend it is supposed to be holding. node bench/tmp-shoulder.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
const W=900,H=620;
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    page.on('pageerror',e=>console.log('  pageerror', String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(W/2,H/2); await sleep(1000);
    await page.evaluate(`(()=>{ const p=__hc.probe(); __hc.tp(p.x,p.gyHere+2,p.z); __hc.giveItem('rifle_ammo',200); })()`);
    await page.evaluate(`__hc.tpsProbe(true)`); await sleep(800);
    for(const g of ['ar15_dot','hunting_rifle_dot']){
      await page.evaluate(`(()=>{ __hc.aim(false); __hc.hold('${g}'); })()`); await sleep(700);
      await page.evaluate(`__hc.cam({yaw:0,pitch:0})`); await sleep(600);
      console.log(g.padEnd(20),'hip ', JSON.stringify(await page.evaluate(`__hc.tpsPose()`)));
      await page.evaluate(`__hc.aim(true)`); await sleep(1500);
      console.log(g.padEnd(20),'ads ', JSON.stringify(await page.evaluate(`__hc.tpsPose()`)));
      // Side-on and front-on views of the body, blown up, so the pose can be seen as well as measured.
      for(const [tag,yaw] of [['side',Math.PI/2],['front',Math.PI]]){
        await page.evaluate(`__hc.cam({yaw:${yaw},pitch:0})`); await sleep(500);
        await page.screenshot({ path: path.join(ROOT,'bench','results','shoulder-'+g+'-'+tag+'.png') });
      }
      await page.evaluate(`__hc.aim(false)`); await sleep(300);
    }
    await b.close();
  } finally { server.kill(); }
})();
