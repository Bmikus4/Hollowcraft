// Does every held gun FIT in front of the eye while aimed? Ben: "i can still see inside the shotgun's stock when it is ads."
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/code/Minecraft'; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync']});
    const page=await (await browser.newContext({viewport:{width:1000,height:700}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.45); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);
    const guns=(await page.evaluate('__hc.itemClasses()')).gunsAll||[];
    for(const g of guns){
      await page.evaluate('__hc.offhandSet(null)');
      await page.evaluate(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${g} 1")`); await sleep(350);
      await page.evaluate(`__hc.hold(${JSON.stringify(g)})`); await sleep(400);
      const hip=await page.evaluate('__hc.adsClearance()');
      await page.evaluate('__hc.aim(true)');
      for(let i=0;i<30;i++){ if((await page.evaluate('__hc.adsClearance()')).adsT>=0.999) break; await sleep(150); }
      const ads=await page.evaluate('__hc.adsClearance()');
      await page.evaluate('__hc.aim(false)'); await sleep(200);
      console.log(`  ${g.padEnd(28)} near=${ads.near}  hip rearZ=${String(hip.rearZ).padStart(8)} clr=${String(hip.clearance).padStart(8)}   ADS rearZ=${String(ads.rearZ).padStart(8)} clr=${String(ads.clearance).padStart(8)}  ${ads.clipped?'*** CLIPPED ***':''}`);
    }
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(String(e.message||e)); process.exit(1); });
