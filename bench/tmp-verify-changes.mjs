// Verify via __hc hooks: (1) clean load, (2) daddy feet, (3) animal ragdoll no-sink, (4) WRETCH corpse stays+settles,
// (5) SERAPH corpse falls+lands+settles+no-sink, (6) book/bible pose. No THREE in injected code (game is a module).
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'bench', 'results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no chrome'); }
const ev = (page,expr) => page.evaluate(expr);
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errors=[];
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,220)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await sleep(1500);

    // (2) DADDY feet
    const daddy = { live: await ev(page,`__hc.daddyFeet(0.6)`), sweep: [] };
    for(const o of [0.5,0.55,0.6,0.65]) daddy.sweep.push(await ev(page,`__hc.daddyFeet(${o})`));

    // (3) ANIMAL ragdoll — kill 3, wait, check settled + no-sink
    for(const t of ['deer','rabbit','fox']) await ev(page,`__hc.ragKill('${t}')`);
    await sleep(5000);
    const animals = await ev(page,`__hc.ragState().filter(r=>!r.boss)`);

    // (4) WRETCH corpse
    const wSpawn = await ev(page,`__hc.corpseKill(false)`);
    await sleep(5000);
    const wState = await ev(page,`(()=>{ const s=__hc.ragState().filter(r=>r.boss); const w=s.reduce((a,b)=> Math.abs(b.x-(${wSpawn.x}))<Math.abs(a.x-(${wSpawn.x}))?b:a, s[0]); return w; })()`);
    const wretch = { spawn:wSpawn, final:wState, driftXZ:+Math.hypot(wState.x-wSpawn.x, wState.z-wSpawn.z).toFixed(2) };

    // (5) SERAPH corpse (sky death 10 up)
    const sSpawn = await ev(page,`__hc.corpseKill(true)`);
    await sleep(6000);
    const sState = await ev(page,`(()=>{ const s=__hc.ragState().filter(r=>r.boss); const w=s.reduce((a,b)=> Math.abs(b.x-(${sSpawn.x}))<Math.abs(a.x-(${sSpawn.x}))?b:a, s[0]); return w; })()`);
    const seraph = { spawn:sSpawn, final:sState, driftXZ:+Math.hypot(sState.x-sSpawn.x, sState.z-sSpawn.z).toFixed(2) };

    // (6) BOOK + BIBLE pose (via __hc.viewDbg) + shots
    const bookShots={};
    for(const id of ['field_guide','bible']){ await ev(page,`__hc.hold('${id}')`); await sleep(700);
      bookShots[id]=await ev(page,`__hc.viewDbg()`); await sleep(250); await page.screenshot({ path: path.join(OUT,'chk-book-'+id+'.png') }); }

    console.log(JSON.stringify({ pageErrors:errors, daddy, animals, wretch, seraph, bookShots }, null, 1));
    await browser.close();
  } catch(e){ console.error('FATAL', e.message); console.log(JSON.stringify({pageErrors:errors})); process.exitCode=1; }
  finally { try{ server.kill(); }catch(e){} }
})();
