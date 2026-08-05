// Diagnose the "frozen mouse": measure fps baseline vs with a Void Door open (60fps portal) vs inside the backrooms.
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
const ev=(p,e)=>p.evaluate(e);
async function fps(page,secs){ const s=[]; for(let i=0;i<secs*4;i++){ await sleep(250); s.push(await ev(page,`(()=>{try{return Math.round(__hc.st().fps)}catch(e){return -1}})()`)); } s.sort((a,b)=>a-b); return {min:s[0], med:s[s.length>>1], max:s[s.length-1]}; }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errors=[]; let browser;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await sleep(1500);
    const overworld = await fps(page,2);                                    // baseline (no door)
    await ev(page,`window.__hcBR.door()`); await sleep(600);                 // spawn a Void Door → 60fps portal renders the whole scene AGAIN each frame
    const withDoor = await fps(page,3);
    const horizon = await ev(page,`(()=>{try{return __hc.seaColor().horizon}catch(e){return null}})()`);   // did the darken apply? (loop must be running)
    await ev(page,`window.__hcBR.enter()`); await sleep(1200);
    const inside = await fps(page,3);
    const loopErr = await ev(page,`window._loopErr||null`); const brErr = await ev(page,`window._brErr||null`);
    console.log(JSON.stringify({ overworld, withDoor, inside, horizon, loopErr, brErr, pageErrors:errors.slice(0,8) }, null, 1));
  } catch(e){ console.error('FATAL',e.message); console.log(JSON.stringify({pageErrors:errors.slice(0,8)})); process.exitCode=1; }
  finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})();
