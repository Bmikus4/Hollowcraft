// Look at the launch board the way a player does: stand in front of the console and photograph its screen. The board is a canvas
// painted onto a mesh on the model now (Ben: "directly in game, not as a menu, on the actual control board"), so the only honest
// check is a frame with the glass in it, plus the numbers the board is working from.
//   node bench/tmp-board-shot.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
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
    browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1200,height:760}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR: '+String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.62); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(2500);
    const ev=js=>page.evaluate(js);
    const g=await ev('__hc.probe()');
    await ev(`__hc.tpAt(${g.x},${g.gyHere+2},${g.z})`); await sleep(800);
    // The console's OWN cell comes back from setBlock — deriving it from the player's position guessed the wrong y twice.
    const put=await ev(`__hc.setBlock(0,0,-3,'launch_console')`);
    await ev(`__hc.setBlock(3,0,-3,'icbm')`);
    await sleep(1500);
    const bx=put.wx, by=put.wy, bz=put.wz;
    // Stand at the console's own level, a stride back. The screen centre is 1.12 above the block's floor and the eye is ~1.6, so the
    // glass is BELOW the eye line and the pitch has to be NEGATIVE — positive is up in this camera, which cost the first two frames.
    await ev(`__hc.tpAt(${bx+0.5},${by},${bz+1.5})`);
    await ev('__hc.cam({yaw:0,pitch:-0.34})'); await sleep(900);
    let st=await ev(`__hc.icbmBoard(${bx},${by},${bz})`);
    console.log('  looking at the glass: '+JSON.stringify(st).slice(0,400));   // the WHOLE reply: printing three chosen keys hid an {err} and showed "{}"
    await page.screenshot({path:path.join(ROOT,'bench','results','board-look.png')});
    st=await ev(`__hc.icbmBoardUse(${bx},${by},${bz})`);
    console.log('  after a use on the chart: target '+JSON.stringify(st.target)+'  blocked '+JSON.stringify(st.blocked));
    await page.screenshot({path:path.join(ROOT,'bench','results','board-target.png')});
    console.log('  frames: bench/results/board-look.png, board-target.png');
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(String(e.message||e)); process.exit(1); });
