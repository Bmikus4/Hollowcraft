// The frame that settles the dungeon-roof diagnosis: the hall's ceiling in ?dbg=sky, which renders the per-face BAKED SKYLIGHT
// as greyscale. White ceiling = the carve left the faces thinking they are open to the sky; black = the fault is elsewhere.
//   node bench/tmp-dun-sky.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
async function shot(page, tag, ROOTDIR){
  const go = await page.evaluate(`__hc.dunGo(0.2)`);
  console.log(tag, 'stood at', JSON.stringify(go));
  await sleep(4000);
  const go2 = await page.evaluate(`__hc.dunGo(0.2)`);   // the chunks may have streamed in under us
  await sleep(2500);
  await page.evaluate(`__hc.cam({pitch:1.35, yaw:0.6})`);   // look up at the ceiling
  await sleep(1200);
  await page.screenshot({path:path.join(ROOTDIR,'bench','results','dun-'+tag+'.png')});
  return go2;
}
(async()=>{ const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    for(const [tag,q] of [['normal','?debug=1&t=252'],['sky','?debug=1&t=252&dbg=sky'],['bl','?debug=1&t=252&dbg=bl']]){
      const page=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
      await page.goto(base+'/index.html'+q,{waitUntil:'load',timeout:90000});
      await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
      await page.mouse.click(640,360); await sleep(2000);
      // the lair is only built once its chunks exist — walk the player there and wait for the builder
      await page.evaluate(`(()=>{ const p=__hc.pos(); __hc.tpExact(p.x+95, p.z+70); })()`);
      await sleep(9000);
      const r = await shot(page, tag, ROOT);
      console.log(tag, JSON.stringify(r));
      await page.close();
    }
    await b.close(); } finally { server.kill(); } })();
