// WHERE IS THE MUZZLE FLASH, AND DOES IT LIGHT ANYTHING?
// Ben 08-04: the shotgun's flash cannot be seen in ADS, and "all muzzle flashes should actually shoot light".
// So: read the flash's NDC position for every gun at the hip and fully aimed, and measure the rendered luminance at
// night with the flash pinned on and off. Screenshots are for taste; the numbers here are what decide the fix.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT='D:/code/Minecraft';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const meanLum=(buf)=>{ const im=decodePNG(buf); const W=im.w,H=im.h,CH=im.ch; let s=0,n=0;
  // sample the CENTRE-LOWER area: the ground the flash would light, not the sky and not the HUD
  for(let y=(H*0.45)|0; y<(H*0.80)|0; y+=2) for(let x=(W*0.25)|0; x<(W*0.75)|0; x+=2){
    const o=(y*W+x)*CH; s+=0.2126*im.data[o]+0.7152*im.data[o+1]+0.0722*im.data[o+2]; n++; }
  return +(s/n).toFixed(2); };
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
    await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await page.evaluate('__hc.setTime(0.0)'); await sleep(3000);   // NIGHT — a light that adds nothing is only provable in the dark
    await page.evaluate('__hc.cam({yaw:0,pitch:-0.35})'); await sleep(1200);   // look down at the ground in front

    const guns=(await page.evaluate('__hc.itemClasses()')).gunsAll||[];
    const bare=guns.filter(g=>!/_dot|_suppressed/.test(g));   // one representative per gun, unattached
    console.log('guns:', bare.join(' '));
    for(const g of bare){
      await page.evaluate('__hc.offhandSet(null)');
      await page.evaluate(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${g} 1")`); await sleep(400);
      await page.evaluate(`__hc.hold(${JSON.stringify(g)})`); await sleep(500);
      // ---- HIP ----
      await page.evaluate('__hc.aim(false)'); await sleep(500);
      await page.evaluate('__hc.flashHold(false)'); await sleep(350);
      const offShot=await page.screenshot(); const offL=meanLum(offShot);
      await page.evaluate('__hc.flashHold(true)'); await sleep(350);
      const hip=await page.evaluate('__hc.flashProbe()');
      const hipBuf=await page.screenshot(); const onL=meanLum(hipBuf);
      fs.writeFileSync('D:/code/Minecraft/bench/results/flash-'+g+'-hip.png', hipBuf);
      // ---- ADS ----
      await page.evaluate('__hc.aim(true)');
      for(let i=0;i<30;i++){ if((await page.evaluate('__hc.flashProbe()')).adsT>=0.999) break; await sleep(150); }
      const ads=await page.evaluate('__hc.flashProbe()');
      const adsBuf=await page.screenshot(); const adsL=meanLum(adsBuf);
      fs.writeFileSync('D:/code/Minecraft/bench/results/flash-'+g+'-ads.png', adsBuf);
      await page.evaluate('__hc.flashHold(false)'); await page.evaluate('__hc.aim(false)');
      console.log(`  ${g.padEnd(15)} lum dark=${offL} hipFlash=${onL} adsFlash=${adsL}  light=${hip.lightInt}`);
      console.log(`      hip  onScreen=${hip.onScreen} ndc=${JSON.stringify(hip.ndc)} camZ=${hip.camZ} beyondNear=${hip.beyondNear} vis=${hip.visible} scale=${JSON.stringify(hip.scale)}`);
      console.log(`      ads  onScreen=${ads.onScreen} ndc=${JSON.stringify(ads.ndc)} camZ=${ads.camZ} beyondNear=${ads.beyondNear} vis=${ads.visible} adsT=${ads.adsT}`);
    }
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(String(e.message||e)); process.exit(1); });
