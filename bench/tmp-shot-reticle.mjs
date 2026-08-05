// Photograph the drifting ring: hip, aimed, and aimed with the drift pinned hard, so how far the reticle leaves centre is a
// picture and not only a number. Writes bench/results/reticle-*.png.
//   node bench/tmp-shot-reticle.mjs
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
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.30); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);
    await page.evaluate('__hc.cmdRun("/clearinv"); __hc.cmdRun("/give hunting_rifle_dot 1")');
    await page.evaluate('__hc.hold("hunting_rifle_dot")'); await sleep(500);
    await page.evaluate('__hc.cam({yaw:0.9,pitch:0.02})'); await sleep(400);
    const shot=async(tag)=>{ const p=await page.evaluate('__hc.xhProbe()');
      await page.screenshot({path:path.join(ROOT,'bench','results','reticle-'+tag+'.png')});
      console.log('  '+tag.padEnd(16)+' ring ('+p.offX+','+p.offY+')  axis '+p.offAxisDeg+' deg  adsT '+p.adsT); };
    await page.evaluate('__hc.swayPin(null)'); await sleep(400); await shot('hip');
    await page.evaluate('__hc.aim(true)'); await sleep(1400); await shot('aimed');
    await page.evaluate('__hc.swayPin(0.05,0.03)'); await sleep(700); await shot('aimed-pinned');
    await page.evaluate('__hc.swayPin(null)'); await page.evaluate('__hc.aim(false)');
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
