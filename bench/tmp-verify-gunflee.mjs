// Verify animals flee gunshots: scareAnimals sets flee + a heading away from the shot.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no chrome'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errors=[];
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await sleep(1200);
    const flee = await page.evaluate(`__hc.gunFleeTest()`);
    // also drive the REAL gun path: arm + shoot, confirm no error and a fresh animal panics
    const shot = await page.evaluate(`(()=>{ try{ __hc.gun('ar15'); __hc.aim(true); const ok=__hc.shoot(); const near=animals.filter(a=>!a.dead && a.type!=='villager' && a.type!=='jesus' && Math.hypot(a.x-player.pos.x,a.z-player.pos.z)<46); return { fired:ok, panicking:near.filter(a=>a.flee>0).length, nearby:near.length }; }catch(e){ return {err:e.message}; } })()`);
    console.log(JSON.stringify({ pageErrors:errors, flee, shot }, null, 1));
    await browser.close();
  } catch(e){ console.error('FATAL', e.message); console.log(JSON.stringify({pageErrors:errors})); process.exitCode=1; }
  finally { try{ server.kill(); }catch(e){} }
})();
