// PLAY IT: bare gun vs each attachment, held and down the sight. Real menu, real keys, real clicks.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft';
const SHOT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/f3f45f2f-6bb7-4d56-87a5-95b314c4601d/scratchpad/shots2';
fs.mkdirSync(SHOT,{recursive:true});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const GUN = process.env.GUN || 'AR-15';
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  let b;
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,160)));
    await p.goto(base+'/index.html',{waitUntil:'load',timeout:120000});
    await p.waitForSelector('#mb-creative-btn',{timeout:120000});
    await sleep(1500);
    await p.click('#mb-creative-btn');
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await p.evaluate("__hc.lock(true); __hc.setTime(0.30)");
    await sleep(1500);

    const take=async(name)=>{
      await p.keyboard.press('KeyC'); await sleep(700);
      const box=await p.evaluate(`(()=>{const c=[...document.querySelectorAll('#creative div[title]')].find(x=>x.title===${JSON.stringify(name)});
        if(!c)return null; c.scrollIntoView({block:'center'}); const r=c.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      if(!box){ console.log('NO CELL '+name); await p.keyboard.press('KeyC'); return false; }
      await p.mouse.click(box.x,box.y); await sleep(250);
      await p.keyboard.press('KeyC'); await sleep(600); return true;
    };
    for(const n of [GUN,'Red Dot Sight','Holographic Sight','Rifle Scope','Suppressor','Weapon Light','Laser Sight','Foregrip']) await take(n);
    // hold the gun: slot 1
    await p.keyboard.press('Digit1'); await sleep(1200);

    const look=async(tag)=>{
      await sleep(900); await p.screenshot({path:SHOT+'/'+tag+'-hip.png'});
      await p.mouse.down({button:'right'}); await sleep(1600);
      await p.screenshot({path:SHOT+'/'+tag+'-ads.png'});
      await p.mouse.up({button:'right'}); await sleep(700);
    };
    await look('a-bare');

    // fit one at a time through the real T screen: open, pick slot, ENTER, close, look, reopen, BACKSPACE
    const fitSlot=async(downs)=>{ await p.keyboard.press('KeyT'); await sleep(700);
      for(let i=0;i<downs;i++){ await p.keyboard.press('KeyS'); await sleep(150); }
      await p.keyboard.press('Enter'); await sleep(700);
      const t=await p.evaluate("(()=>{const d=document.getElementById('attui');return (d.innerText||'').slice(0,400);})()");
      await p.keyboard.press('KeyT'); await sleep(700); return t; };
    const clearSlot=async(downs)=>{ await p.keyboard.press('KeyT'); await sleep(600);
      for(let i=0;i<downs;i++){ await p.keyboard.press('KeyS'); await sleep(150); }
      await p.keyboard.press('Backspace'); await sleep(600);
      await p.keyboard.press('KeyT'); await sleep(600); };

    console.log('OPTIC1', await fitSlot(0)); await look('b-reddot'); await clearSlot(0);
    console.log('OPTIC2', await fitSlot(0)); await look('c-holo');   await clearSlot(0);
    console.log('OPTIC3', await fitSlot(0)); await look('d-scope');  await clearSlot(0);
    console.log('MUZZLE', await fitSlot(1)); await look('e-suppressor');
    console.log('LIGHT',  await fitSlot(2)); await look('f-light');
    console.log('LASER',  await fitSlot(3)); await look('g-laser');
    console.log('GRIP',   await fitSlot(4)); await look('h-grip');
    console.log('PAGE ERRORS', JSON.stringify(errs.slice(0,8)));
  } finally { if(b)await b.close(); server.kill(); }
})();
