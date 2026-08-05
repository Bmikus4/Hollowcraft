import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0;
  const check=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1000,height:700}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?perf=1&debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`window.__hcPERF.arm(); __hc.lock(true);`);
    const g = await page.evaluate(`(()=>{ const r=__hc.gun('minigun'); return { gun:r, held:__hc.viewDbg().id }; })()`);
    console.log('  equipped:', JSON.stringify(g).slice(0,140));
    const before = await page.evaluate(`(()=>{ const s=__hc.gun&&__hc.gun('minigun'); return __hc.aim?__hc.aim():null; })()`);
    const mag = await page.evaluate(`(()=>{ try{ return __hc.gun('minigun'); }catch(e){ return {err:String(e.message||e)}; } })()`);
    console.log('  gun hook says:', JSON.stringify(mag).slice(0,220));
    // fire a burst and watch the belt count fall from 100
    const shots = await page.evaluate(`(async()=>{ const out=[];
      for(let i=0;i<6;i++){ try{ out.push(__hc.shoot()); }catch(e){ out.push({err:String(e.message||e)}); }
        await new Promise(r=>setTimeout(r,120)); }
      return out; })()`);
    const seen = JSON.stringify(shots).slice(0,300);
    console.log('  shots:', seen);
    // read the belt from the gun's own readout, not from shoot()'s return (which is just true/false)
    const after = await page.evaluate(`__hc.sight()`);
    check('the belt is finite and counts down from 100', after.mag<100 && after.mag>=90, `mag ${after.mag} after 6 shots`);
    const ads = await page.evaluate(`(async()=>{ __hc.aim&&__hc.aim(true); await new Promise(r=>setTimeout(r,700)); return __hc.sight(); })()`);
    check('the minigun aims over its irons', ads.ads===true && ads.adsT>0.8, `ads ${ads.ads}, adsT ${ads.adsT}`);
    const rl = await page.evaluate(`(async()=>{ __hc.reload&&__hc.reload(); await new Promise(r=>setTimeout(r,400)); return __hc.sight(); })()`);
    check('and it reloads the belt', rl.reloadT>0, `reloadT ${rl.reloadT} s`);

  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
