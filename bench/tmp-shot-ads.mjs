// Photograph the ADS sight picture for the dot guns and the scoped rifle, so "the top of the holosun is cut off" can be
// measured instead of imagined. Writes bench/results/ads-<id>.png.
//   node bench/tmp-shot-ads.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const GUNS=(process.argv[2]||'ar15_dot,rifle,rifle_dot').split(',');
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(640,360); await sleep(500);
    await page.evaluate(`__hc.cam({pitch:0.12})`);   // a little down: sky behind the sight, so its silhouette reads
    const out={};
    for(const id of GUNS){
      const held=await page.evaluate(`__hc.hold('${id}')`);
      await sleep(300);
      await page.mouse.down({button:'right'}); await sleep(900);
      out[id]={held, sight:await page.evaluate(`(()=>{ try{ return __hc.sight(); }catch(e){ return null; } })()`),
        pose:await page.evaluate(`__hc.adsFit()`)};
      await page.screenshot({path:path.join(ROOT,'bench','results','ads-'+id+'.png')});
      await page.mouse.up({button:'right'}); await sleep(500);
    }
    console.log(JSON.stringify(out,null,1));
    await browser.close();
  } finally { server.kill(); }
})();
