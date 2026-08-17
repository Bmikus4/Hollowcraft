// HOLD T: the screen must not take the player's legs, their look, or the pointer.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net'; import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const SHOT='C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/f3f45f2f-6bb7-4d56-87a5-95b314c4601d/scratchpad/att3';
fs.mkdirSync(SHOT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
(async()=>{ const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  let b; try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,180)));
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await p.evaluate("__hc.lock(true); __hc.setTime(0.30)"); await sleep(1200);
    await p.evaluate("__hc.hold('ar15'); __hc.cmdRun('/give red_dot 1'); __hc.cmdRun('/give suppressor 1'); __hc.cmdRun('/give foregrip 1'); __hc.cmdRun('/give weapon_light 1'); __hc.cmdRun('/give laser_sight 1')");
    await sleep(900);
    const pos0=await p.evaluate("(()=>{const s=__hc.st();return [s.px,s.pz,s.py];})()");
    await p.keyboard.down('KeyT'); await sleep(1400);
    await p.screenshot({path:SHOT+'/01-holdT.png'});
    console.log('OPEN', JSON.stringify(await p.evaluate("(()=>{const a=__hc.attProbe();return {ui:a.ui, rows:a.rows};})()")));
    // can he still walk and look while it is open?
    await p.keyboard.down('KeyW'); await sleep(900); await p.keyboard.up('KeyW');
    for(let i=0;i<8;i++){ await p.mouse.move(400+i*30,360); await sleep(10); }
    await sleep(300);
    const pos1=await p.evaluate("(()=>{const s=__hc.st();return [s.px,s.pz,s.py];})()");
    console.log('POS before',JSON.stringify(pos0),'after',JSON.stringify(pos1),
      'MOVED', (Math.abs(pos1[0]-pos0[0])+Math.abs(pos1[1]-pos0[1])).toFixed(2));
    console.log('LOCK', JSON.stringify(await p.evaluate("(()=>{const l=__hc.lockLog();return {locked:l.locked,wanted:l.wanted,paused:l.paused,ui:l.ui};})()")));
    await p.screenshot({path:SHOT+'/02-open-after-walk.png'});
    await p.keyboard.up('KeyT'); await sleep(700);
    console.log('CLOSED', JSON.stringify(await p.evaluate("__hc.attProbe().ui")));
    // fit everything and look at the sizes on the gun
    await p.evaluate("__hc.attFit('optic','red_dot'); __hc.attFit('muzzle','suppressor'); __hc.attFit('grip','foregrip'); __hc.attFit('light','weapon_light'); __hc.attFit('laser','laser_sight')");
    await sleep(900);
    console.log('SIZES', JSON.stringify((await p.evaluate("__hc.attProbe()")).fitted));
    await p.screenshot({path:SHOT+'/03-all-fitted.png'});
    await p.evaluate("__hc.aim(true)"); await sleep(1600);
    await p.screenshot({path:SHOT+'/04-ads-reddot.png'});
    console.log('ERRORS', JSON.stringify(errs.slice(0,6)));
  } finally { if(b)await b.close(); server.kill(); } })();
