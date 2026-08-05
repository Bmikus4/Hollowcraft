// Did the per-layer leaf uv mirror reach the GPU buffers at all? A string edit that compiles is not a change that
// ships: the sky-through-canopy A/B moved 12.2% -> 13.0%, inside its own drift, and that has two possible causes.
// This rules out the boring one by reading aBlockUV back off the leaf geometry — a mirrored uv is NEGATIVE.
// node bench/tmp-leafuv-check.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const COUNT=`(function(){ let neg=0,tot=0;
  __hc.leafMeshes().forEach(m=>{ const a=m.geometry.attributes.aBlockUV.array; for(let i=0;i<a.length;i++){ tot++; if(a[i]<0) neg++; } });
  return { negUV:neg, totUV:tot, frac:+(neg/Math.max(1,tot)).toFixed(3) }; })`;
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true, args:['--enable-gpu','--use-angle=d3d11','--mute-audio'] });
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(3000);
    console.log('as loaded   ' + JSON.stringify(await page.evaluate(COUNT+'()')));
    await page.evaluate('__hc.leafUV(false)'); await sleep(2000);
    console.log('mirror off  ' + JSON.stringify(await page.evaluate(COUNT+'()')));
    await page.evaluate('__hc.leafUV(true)'); await sleep(2000);
    console.log('mirror on   ' + JSON.stringify(await page.evaluate(COUNT+'()')));
  } finally { await browser.close(); server.kill(); }
})();
