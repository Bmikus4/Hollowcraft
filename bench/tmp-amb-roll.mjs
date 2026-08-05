// #71 — the ambience scheduler's cue mix at four times of day, and whether the new files decoded.
// node bench/tmp-amb-roll.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
      args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page = await (await browser.newContext({ viewport:{width:800,height:600} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', null, {timeout:180000});
    await sleep(4000);
    let A=await page.evaluate('__hc.ambAssets()'); for(let i=0;i<20 && (!A.owl.got || !A.insect.got);i++){ await sleep(700); A=await page.evaluate('__hc.ambAssets()'); }
    console.log('assets  ' + JSON.stringify(A));
    for(const [name,t] of [["sunrise",0.00],["noon",0.25],["sunset",0.50],["midnight",0.75]]){
      const r = await page.evaluate(`__hc.ambRoll(400,${t})`);
      console.log(name.padEnd(9) + ' ' + JSON.stringify(r));
    }
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
