// TASTE, NOT MEASUREMENT (the numbers are in assert-sandbag). Judge the sandbag from more than one vantage, because the
// ocean ring and the silo both shipped "accepted" from the single viewpoint where they happened to work:
//   a 2-high revetment close up, the same wall from 22 blocks, its crest from above, the same wall AT NIGHT,
//   and the pile in the hand with the hotbar icon in the same frame.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/code/Minecraft', OUT='D:/code/Minecraft/bench/results';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
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
    const page=await (await browser.newContext({viewport:{width:1100,height:760}})).newPage();
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",{timeout:240000});
    const pr=await page.evaluate('__hc.probe()');
    await page.evaluate(`(()=>{ __hc.lock(true); __hc.setTime(0.42); __hc.tp(${pr.spawnX}, ${pr.spawnZ}); })()`);
    await sleep(3000);

    // STAND ON THE SITE FIRST and read the ground there. Placing the wall at the SPAWN's y five blocks away buried it in
    // a rise and the first four shots photographed empty sea — the same class of miss that shot the vault door edge-on.
    await page.evaluate(`__hc.tp(${pr.spawnX}+6, ${pr.spawnZ}-4)`); await sleep(2600);
    const at=await page.evaluate(`(()=>{ const p=__hc.st(); const x=Math.floor(p.px), z=Math.floor(p.pz), y=Math.floor(p.py);
      __hc.sandbagWall(x,y,z,8,'z'); __hc.sandbagWall(x,y+1,z,8,'z'); return {x,y,z,py:p.py}; })()`);
    await sleep(4500);
    console.log('wall at', JSON.stringify(at));
    // aim from a vantage AT a target: yaw negates the direction, and POSITIVE pitch looks UP (tmp-lampshot proves it)
    const aim=async(ex,ez,ey,tx,tz,ty)=>{ const dx=tx-ex, dz=tz-ez, dy=ty-ey, hd=Math.hypot(dx,dz);
      await page.evaluate(`__hc.tpExact(${ex},${ez},${ey})`);
      await page.evaluate(`__hc.cam({yaw:${Math.atan2(-dx,-dz)}, pitch:${Math.atan2(dy,hd)}})`); };
    const cx=at.x+0.5, cz=at.z+3.5, cy=at.y+1.4;   // the wall's middle: it spans z..z+7 and stands 2 courses high

    // CLOSE, face on — the wall spans Z so the vantage stands off in X
    await aim(cx+5.5, cz, cy+0.4, cx, cz, cy); await sleep(1600);
    fs.writeFileSync(path.join(OUT,'sandbag-close.png'), await page.screenshot());
    // FAR — does it still read as bags at 22 blocks, or as a brown block
    await aim(cx+22, cz, cy+1.6, cx, cz, cy); await sleep(1400);
    fs.writeFileSync(path.join(OUT,'sandbag-far.png'), await page.screenshot());
    // THE CREST from above and along the run — the broken top edge is the silhouette claim
    await aim(cx+3.0, cz-5.5, cy+3.4, cx, cz, cy); await sleep(1400);
    fs.writeFileSync(path.join(OUT,'sandbag-crest.png'), await page.screenshot());
    // AT NIGHT — a non-opaque model block is lit differently from the cube it replaced
    await page.evaluate('__hc.setTime(0.0)'); await sleep(2200);
    await aim(cx+5.5, cz, cy+0.4, cx, cz, cy); await sleep(1600);
    fs.writeFileSync(path.join(OUT,'sandbag-night.png'), await page.screenshot());
    // IN THE HAND, with the hotbar icon in the same frame
    await page.evaluate('__hc.setTime(0.42)'); await sleep(1400);
    await page.evaluate('(()=>{ __hc.cmdRun("/give sandbag 12"); __hc.hold("sandbag"); })()'); await sleep(2400);
    fs.writeFileSync(path.join(OUT,'sandbag-held.png'), await page.screenshot());
    console.log('shots written', JSON.stringify(at));
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
