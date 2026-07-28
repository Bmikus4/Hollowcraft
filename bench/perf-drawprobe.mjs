// WHERE DO THE 4770 DRAW CALLS COME FROM? renderer.info counts every pass in the frame, so a scene-graph census
// plus the shadow-caster count should reconstruct it exactly. If it does, the cause is proven arithmetic rather
// than a plausible story. Counters only — this changes nothing.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

const CENSUS = `window.__hcPERF.census()`;

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?perf=1&debug=1&t=210&brseed=20260728',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:180000});
    await page.evaluate(`window.__hcPERF.arm()`);
    await sleep(3000);

    console.log('OVERWORLD census:', JSON.stringify(await page.evaluate(CENSUS),null,1));
    console.log('OVERWORLD info  :', JSON.stringify(await page.evaluate(`window.__benchInfoSnap`)));

    await page.evaluate(`window.__hcPERF.enterBR()`); await sleep(4000);
    const c = await page.evaluate(CENSUS);
    console.log('\nBACKROOMS census:', JSON.stringify(c,null,1));
    const info = await page.evaluate(`window.__benchInfoSnap`);
    console.log('BACKROOMS info  :', JSON.stringify(info));
    const passes = 1 + c.shadowFaces + (c.sunShadow?1:0);
    console.log('\nRECONSTRUCTION: visible drawables '+c.visible+' x passes '+passes+' = '+(c.visible*passes)+'   measured draws '+(info&&info.calls));

    // and the counterfactual, measured not guessed: what does the frame cost with the point-light shadows off?
    const before = await page.evaluate(`window.__hcPERF.reset(), null`);
    await sleep(2500);
    const withShadows = await page.evaluate(`window.__hcPERF.live()`);
    const infoA = await page.evaluate(`window.__benchInfoSnap`);
    await page.evaluate(`window.__hcPERF.brPointShadows(false)`);
    await page.evaluate(`window.__hcPERF.reset()`); await sleep(2500);
    const noShadows = await page.evaluate(`window.__hcPERF.live()`);
    const infoB = await page.evaluate(`window.__benchInfoSnap`);
    console.log('\nBR point-light shadows ON : median '+withShadows.median+' ms  p99 '+withShadows.p99+'  draws '+(infoA&&infoA.calls));
    console.log('BR point-light shadows OFF: median '+noShadows.median+' ms  p99 '+noShadows.p99+'  draws '+(infoB&&infoB.calls));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
