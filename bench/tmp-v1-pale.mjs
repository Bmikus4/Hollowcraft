// The Pale: gif face, jointed flail, doorway peek, run+footsteps, flail-and-scream withdrawal.
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
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(7000);
    await page.evaluate(`__hc.qa(60)`);   // fill light: the entity is black and most rooms are unlit
    // forced clips, straight in front of the camera
    for(const a of ['idle','run','flail','peek','lunge']){
      await page.evaluate(`window.__hcBR.anim('${a}')`); await sleep(1400);
      await page.screenshot({ path: path.join(OUT,'v1-pale-'+a+'.png') });
      console.log('shot',a);
    }
    // HEAD CLOSE-UPS: shut (idle) and thrown open (flail)
    for(const a of ['idle','flail']){
      await page.evaluate(`window.__hcBR.anim('${a}')`); await sleep(1200);
      const st2=await page.evaluate(`(()=>{ const p=window.__hcBR.paleState(); return p; })()`);
      await page.evaluate(`(()=>{ const p=BR.pale; const yaw=player.yaw; player.pos.set(p.x + Math.sin(yaw)*2.0, BR_FLOOR+1.9, p.z + Math.cos(yaw)*2.0); })()`).catch(()=>{});
      await sleep(900);
      await page.evaluate(`(()=>{ const p=BR.pale; __hc.look(p.x, BR_FLOOR+3.35, p.z); })()`).catch(()=>{});
      await sleep(700);
      await page.screenshot({ path: path.join(OUT,'v1-pale-head-'+a+'.png'), clip:{x:400,y:120,width:480,height:420} });
      console.log('head shot',a,'gape',st2&&st2.gape);
    }
    // face texture actually loaded?
    const face = await page.evaluate(`(()=>{ try{ const p=window.BR&&null; }catch(e){} return null; })()`);
    // live behaviour: spawn it and watch state transitions for 20s
    await page.evaluate(`window.__hcBR.pale(24)`); await sleep(1000);
    const log=[];
    for(let i=0;i<24;i++){ await sleep(900);
      const s=await page.evaluate(`(()=>{ const d=window.__hcBR.paleState?window.__hcBR.paleState():null; return d; })()`);
      log.push(s); }
    console.log('paleLog', JSON.stringify(log.filter(Boolean).slice(0,12)));
    console.log('errs', errs.length);
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
