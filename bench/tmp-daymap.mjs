// WHICH CLOCK FRACTION IS ACTUALLY NIGHT? __hc.setTime's comment says 0 = midnight, and the frames it produces are a bright
// blue sky — so the mapping is worth measuring rather than trusting. setTime returns uDay, which is the number the sky shader
// actually branches on (uDay 0 = night colours, 1 = day). Prints uDay and the mean sky luminance per fraction.
//   node bench/tmp-daymap.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:640,height:360}})).newPage();
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2000);
    const g=await page.evaluate('__hc.probe()');
    await page.evaluate(`__hc.tpAt(${g.x},${g.gyHere+45},${g.z})`); await sleep(1500);
    const f=path.join(ROOT,'bench','results','daymap.png');
    for(let t=0;t<1.0001;t+=0.0625){
      const uDay=await page.evaluate(`__hc.setTime(${t.toFixed(4)})`);
      await page.evaluate(`__hc.tpAt(${g.x},${g.gyHere+45},${g.z})`);
      await page.evaluate('__hc.cam({yaw:1.6,pitch:1.0})'); await sleep(800);
      await page.screenshot({path:f});
      const img=decodePNG(fs.readFileSync(f)); const {w,h,ch,data}=img;
      let s=0,n=0;
      for(let y=Math.round(h*0.05); y<Math.round(h*0.45); y+=2)
        for(let x=Math.round(w*0.2); x<Math.round(w*0.8); x+=2){ const k=(y*w+x)*ch; s+=0.2126*data[k]+0.7152*data[k+1]+0.0722*data[k+2]; n++; }
      console.log('  t '+t.toFixed(3)+'   uDay '+String(uDay).padStart(6)+'   sky luma '+(s/n).toFixed(1));
    }
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
