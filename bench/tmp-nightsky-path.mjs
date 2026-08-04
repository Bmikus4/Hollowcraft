// Ben 08-04: "dark lines around the darkest parts of the night sky, black lines that wrap around the darkly blotted parts."
// HYPOTHESIS WITH A PREDICTION. The motion-blur path renders the scene into _sceneRT, which is RGBA8, while the composer's own
// targets are HALF-FLOAT. 8-bit LINEAR has almost no precision near black, so a dark sky gradient quantises into steps, and the
// steps follow the cloud noise's iso-contours — which is what "lines that wrap around the blotted parts" describes. If that is
// the cause, then ?nomblur (the classic RenderPass path, straight into the half-float target) must NOT have the lines.
// Same seed, same time, same camera; the ONLY difference is which path renders.
//   node bench/tmp-nightsky-path.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const VARIANTS=[['mblur','?debug=1'],['nomblur','?debug=1&nomblur=1']];
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    for(const [tag,qs] of VARIANTS){
      const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
      await page.goto(base+'/index.html'+qs,{waitUntil:'load',timeout:120000});
      await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:120000});
      await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",{timeout:240000});
      await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); __hc.setTime(0.0); })()').catch(()=>{});
      await sleep(2500);
      // Sky filling the frame, away from the moon: the banding shows in the plain dark gradient, not next to a light source.
      await page.evaluate('__hc.cam({yaw:2.4,pitch:0.95})'); await sleep(1500);
      await page.screenshot({path:path.join(ROOT,'bench','results','nsky-'+tag+'.png')});
      console.log(tag+': shot');
      await page.close();
    }
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
