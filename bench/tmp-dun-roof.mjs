// "everything in the dungeon looks good but the dungeon roof" — go there, look up, and report what the block data says versus
// what the renderer has built. node bench/tmp-dun-roof.mjs
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
(async()=>{ const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.mouse.click(640,360); await sleep(1500);
    await page.evaluate(`__hc.summon&&__hc.summon()`).catch(()=>{});
    // go to the lair and let its chunks build
    const at = await page.evaluate(`(()=>{ const L=wretch.lair; if(!L) return null; __hc.tpExact(L.x, L.z); return {x:L.x,z:L.z}; })()`).catch(()=>null);
    await sleep(6000);
    const first = await page.evaluate(`__hc.dunRoof()`);
    console.log('BEFORE waiting for the build:', JSON.stringify(first, null, 1));
    await sleep(9000);
    const r = await page.evaluate(`__hc.dunRoof()`);
    console.log('AFTER:', JSON.stringify(r, null, 1));
    // stand in the room and look up
    await page.evaluate(`(()=>{ const L=wretch.lair; __hc.tpExact(L.cx+0.5, L.cz+3.5, L.fy+1.2); __hc.cam({pitch:1.2, yaw:0}); })()`).catch(()=>{});
    await sleep(2500);
    await page.screenshot({path:path.join(ROOT,'bench','results','dun-roof.png')});
    await b.close(); } finally { server.kill(); } })();
