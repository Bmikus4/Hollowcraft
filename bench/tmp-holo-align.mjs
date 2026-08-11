// WHERE THE DOT, THE WINDOW AND THE BULLET ACTUALLY ARE, in screen pixels, for every dot gun at full aim.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));}); });
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function poll(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250);});})();});
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
(async()=>{ const port=await freePort();
 const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
 try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
  const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
  const page=await (await browser.newContext({viewport:{width:1000,height:700}})).newPage();
  page.on('pageerror',e=>console.log('PAGEERROR',String(e.message||e).slice(0,160)));
  await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
  await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
  await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
  await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.45); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
  await sleep(2000);
  const guns=(await page.evaluate('__hc.itemClasses()')).gunsAll||[];
  const dots=guns.filter(g=>/_dot$/.test(g));
  console.log('dot guns:', dots.join(' '));
  for(const g of dots){
    await page.evaluate(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${g} 1")`); await sleep(250);
    await page.evaluate(`__hc.hold(${JSON.stringify(g)})`); await sleep(350);
    await page.evaluate('__hc.aim(true)');
    for(let i=0;i<40;i++){ if((await page.evaluate('__hc.holoAlign()')).adsT>=0.999) break; await sleep(100); }
    await sleep(400);
    const a=await page.evaluate('__hc.holoAlign()');
    console.log(g.padEnd(28), 'glass',JSON.stringify(a.glass),'holo',JSON.stringify(a.holo),'bore',JSON.stringify(a.bore),
      '| holoVsGlass',a.holoVsGlass,'boreVsGlass',a.boreVsGlass,'offAxis',a.offAxisDeg,'ret',a.retVisible);
    await page.screenshot({path:path.join(OUT,'holo-'+g+'.png')});
    await page.evaluate('__hc.aim(false)'); await sleep(200);
  }
  await browser.close();
 } finally { try{server.kill();}catch(e){} } })();
