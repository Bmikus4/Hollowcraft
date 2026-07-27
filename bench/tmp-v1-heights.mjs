// Tier 2.1: varying room heights — distribution, the crouch-only low rooms, and head clearance.
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
function waitHttp(url, timeoutMs=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>timeoutMs)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror', e=>{ errs.push(String(e.message||e).slice(0,220)); console.log('PAGEERROR:',String(e.message||e).slice(0,220)); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    // sweep several seeds so the 10%-of-outer-rooms rate is measurable (must be INSIDE — seed() only rebuilds in there)
    await page.evaluate(`window.__hcBR.enter()`); await sleep(5000);
    let tot=0, low=0;
    for(const s of [99991, 12345, 777, 424242, 8675309]){
      await page.evaluate(`window.__hcBR.seed(${s})`); await sleep(600);
      const h=await page.evaluate(`window.__hcBR.heights()`);
      tot+=h.n; low+=h.low;
      console.log('seed',s,'rooms',h.n,'low',h.low,'headroom',h.min,'..',h.max,JSON.stringify(h.hist));
    }
    console.log('TOTAL rooms',tot,'low',low,'=',(100*low/tot).toFixed(1)+'%');
    // stand in a low room and look through its doorway — the ceiling should cut across the opening
    await page.evaluate(`window.__hcBR.seed(99991)`); await sleep(1200);
    await page.evaluate(`__hc.qa(60)`);
    const lr = await page.evaluate(`window.__hcBR.goLow()`);
    console.log('lowRoom', JSON.stringify(lr));
    if(lr){ await sleep(2500);
      const before = await page.evaluate(`__hc.pos()`);
      await page.evaluate(`(()=>{ player.pos.y = BR_FLOOR+6; })()`).catch(()=>{});   // try to stand up through the low ceiling
      await sleep(900);
      const after = await page.evaluate(`__hc.pos()`);
      console.log('headClamp y before',+before.y.toFixed(2),'-> after forcing up',+after.y.toFixed(2));
      await page.screenshot({ path: path.join(OUT,'v1-lowroom.png') });
      console.log('shot lowroom');
    }
    console.log('errs', errs.length);
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
