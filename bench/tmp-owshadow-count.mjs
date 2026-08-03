// Proof the owShadowMoveOnly gate is what changes behaviour: count actual shadow-cube refreshes over the same
// window with it on and off, standing still by a torch. A flag that cannot be shown to change the count is
// not evidence, whatever the frame times say.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { HELPERS } from './perf-census.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?perf=1&debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`window.__hcPERF.arm()`); await page.evaluate(HELPERS);
    await page.evaluate(`goDungeon('hall'); H.cam({yaw:0.7,pitch:0}); H.lock(true);`);
    for(let i=0;i<60;i++){ const ok=await page.evaluate(`(()=>{const f=__hc.fill(); return f.meshed>=f.want;})()`); if(ok) break; await sleep(500); }
    await sleep(3000);
    const count = async (flag, ms=4000) => {
      await page.evaluate(`__hcPERF.set('owShadowMoveOnly', ${flag})`);
      await sleep(600);
      const a=await page.evaluate(`__hc.lights()`);
      await sleep(ms);
      const b=await page.evaluate(`__hc.lights()`);
      return { refreshes:b.owShadowRefreshes-a.owShadowRefreshes, skips:b.owShadowSkips-a.owShadowSkips, casters:b.pointShadow };
    };
    const off=await count(false), on=await count(true);
    console.log(`  flag OFF: ${off.refreshes} cube refreshes, ${off.skips} skipped, ${off.casters} shadow-casting point lights`);
    console.log(`  flag ON : ${on.refreshes} cube refreshes, ${on.skips} skipped, ${on.casters} shadow-casting point lights`);
    const ok1 = off.refreshes>0, ok2 = on.refreshes < off.refreshes, ok3 = on.skips>0, ok4 = on.casters===off.casters;
    console.log((ok1?'  PASS  ':'  FAIL  ')+'the cadence does refresh with the flag off   '+off.refreshes);
    console.log((ok2?'  PASS  ':'  FAIL  ')+'the flag reduces refreshes standing still    '+off.refreshes+' -> '+on.refreshes);
    console.log((ok3?'  PASS  ':'  FAIL  ')+'and it records the skips it made             '+on.skips);
    console.log((ok4?'  PASS  ':'  FAIL  ')+'the shadow-caster COUNT never changes        '+off.casters+' vs '+on.casters+' (a changed count would recompile every lit material)');
    fails = [ok1,ok2,ok3,ok4].filter(x=>!x).length;
    console.log(`\n${4-fails}/4 checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
