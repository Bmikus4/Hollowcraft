// Ben 08-04: "dark lines around the darkest parts of the night sky, black lines that wrap around the darkly blotted parts."
// Photograph the night sky at several elevations and MEASURE it, because "banding" and "an outline" are different faults with
// different causes: contour banding is a gradient quantised to 8-bit steps (many soft edges, evenly spaced), an outline is one
// hard step where a term crosses a threshold.
// IT ONLY PHOTOGRAPHS. Two measurement routes were tried and both are dead ends worth not repeating: reading the WebGL canvas
// back through a 2D canvas returns all zeros (no preserveDrawingBuffer), and the grade pass's uniforms cannot be poked from a
// probe because the composer is not exposed on window — so uFXAA / uGrain cannot be A/B'd without adding a QA hook first.
// Note the camera sign: POSITIVE pitch is up. Negative photographed the ground, twice.
//   node bench/tmp-nightsky-lines.mjs
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
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2000);
    for(const t of [0.0,0.02,0.95]){
      await page.evaluate(`__hc.setTime(${t})`); await sleep(1500);
      for(const pitch of [1.2,0.6,0.25]){   // POSITIVE is up in this camera; negative photographed the ground
        await page.evaluate(`__hc.cam({yaw:0.7,pitch:${pitch}})`); await sleep(900);
        const tag='night-'+String(t).replace('.','p')+'-p'+String(pitch).replace('.','p').replace('-','m');
        const f=path.join(ROOT,'bench','results',tag+'.png');
        await page.screenshot({path:f});
        // Scan a column of the sky and print the run-lengths of equal luminance: even runs of 1-2 levels = 8-bit banding,
        // one long run then a jump = a threshold edge. Read from the PNG the page just wrote, via the canvas.
        const scan=await page.evaluate(`(()=>{ const c=document.querySelector('canvas'); const g=document.createElement('canvas');
          g.width=1; g.height=c.height; const x=g.getContext('2d'); x.drawImage(c, -Math.floor(c.width*0.5), 0);
          const d=x.getImageData(0,0,1,g.height).data; const out=[]; let prev=null, run=0;
          for(let y=0;y<g.height;y+=1){ const L=Math.round(0.2126*d[y*4]+0.7152*d[y*4+1]+0.0722*d[y*4+2]);
            if(L===prev) run++; else { if(prev!==null) out.push([prev,run]); prev=L; run=1; } }
          out.push([prev,run]); return out.slice(0,26); })()`);
        console.log(tag.padEnd(22)+' L/run: '+scan.map(([L,n])=>L+'x'+n).join(' '));
      }
    }
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
