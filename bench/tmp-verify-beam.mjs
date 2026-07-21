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
const ev=(p,e)=>p.evaluate(e);
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errors=[];
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,220)));
    page.on('console',m=>{ const t=m.text(); if(/shader|glsl|compile|program/i.test(t))errors.push('CONSOLE:'+t.slice(0,200)); });
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await ev(page,`__hc.setTime(0.4)`); await sleep(700);
    // raise the seraph in FRONT at a distance so we can see the whole body (gold-overlay / heavenly check)
    const b = await ev(page,`(()=>{ try{ if(typeof __hc.arm==='function')__hc.arm(); const r=__hc.boss?__hc.boss({dist:26}):'no boss'; return { r, wy:+wretch.pos.y.toFixed(1), boss:!!wretch.boss }; }catch(e){ return {err:e.message}; } })()`);
    await sleep(1500);
    const info=await ev(page,`(()=>{ try{ return { wx:+wretch.pos.x.toFixed(1), wy:+wretch.pos.y.toFixed(1), wz:+wretch.pos.z.toFixed(1) }; }catch(e){ return {err:e.message}; } })()`);
    if(info && info.wx!=null){ await ev(page,`__hc.tp(${info.wx}, ${info.wy+2}, ${info.wz+24}, 0, 0.06)`); }
    await sleep(600);
    await page.screenshot({ path: path.join(OUT,'vis-beam.png') });
    console.log(JSON.stringify({ pageErrors:errors, b }, null, 1));
    await browser.close();
  } catch(e){ console.error('FATAL', e.message); console.log(JSON.stringify({pageErrors:errors})); process.exitCode=1; }
  finally { try{ server.kill(); }catch(e){} }
})();
