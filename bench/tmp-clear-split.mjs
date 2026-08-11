import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));}); });
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function poll(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250);});})();});
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
(async()=>{ const port=await freePort();
 const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
 try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
  const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
  const page=await (await browser.newContext({viewport:{width:900,height:600}})).newPage();
  page.on('pageerror',e=>console.log('PAGEERROR',String(e.message||e).slice(0,160)));
  await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
  await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
  await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
  await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
  await sleep(2000);
  for(const g of ['ar15','minigun','hunting_rifle','shotgun','revolver']){
    await page.evaluate(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${g} 1")`); await sleep(250);
    await page.evaluate(`__hc.hold(${JSON.stringify(g)})`); await sleep(350);
    const hip=await page.evaluate('__hc.adsClearance()');
    await page.evaluate('__hc.aim(true)'); await sleep(900);
    const ads=await page.evaluate('__hc.adsClearance()');
    await page.evaluate('__hc.aim(false)'); await sleep(200);
    console.log(g.padEnd(16),'HIP item',String(hip.clearance).padStart(8),'arm',String(hip.armClearance).padStart(8),'rear',hip.rearName,hip.rearIsArm?'(ARM)':'',
      '| ADS item',String(ads.clearance).padStart(8),'arm',String(ads.armClearance).padStart(8),'rear',ads.rearName,ads.rearIsArm?'(ARM)':'','push',ads.push);
  }
  await browser.close();
 } finally { try{server.kill();}catch(e){} } })();
