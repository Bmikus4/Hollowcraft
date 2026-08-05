// WHICH setTime VALUE IS ACTUALLY FULL DAYLIGHT — because two harnesses now disagree with the note in the resume.
// The note says "t=0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight; full daylight at 0.42", but at t=0.42
// bench/tmp-black-texel-locate.mjs read the wash's own day factor as 0.042 and its frame is dusky. One of the two is wrong and every
// daylight measurement in this bench rides on it. This walks the clock and prints uDay, which is the number the shaders actually use.
//   node bench/tmp-daytime-map.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core'; import fs from 'node:fs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:640,height:400},deviceScaleFactor:1});
    const page=await ctx.newPage();
    await page.goto(base+'/index.html?debug=1&rd=4',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene();`);
    for(let i=0;i<=20;i++){ const t=+(i/20).toFixed(2);
      await page.evaluate(`__hc.setTime(${t})`); await sleep(420); await page.evaluate(`__hc.setTime(${t})`); await sleep(200);
      const d=await page.evaluate(`__hc.time()`); const s=await page.evaluate(`__hc.scot({})`);
      console.log(`  t ${String(t).padEnd(5)} worldTime ${String(d.worldTime).padEnd(8)} frac ${String(d.frac).padEnd(6)} uDay ${s.day}`); }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
