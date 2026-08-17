// PLAY IT: real keys, real clicks, real screenshots. No __hc probes for anything a player does.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = 'D:/Code/Minecraft';
const SHOT = process.env.SHOT_DIR || 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/f3f45f2f-6bb7-4d56-87a5-95b314c4601d/scratchpad/shots';
fs.mkdirSync(SHOT,{recursive:true});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
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
    const warns=[]; p.on('console',m=>{ if(m.type()==='warning'||m.type()==='error') warns.push(m.text().slice(0,160)); });
    await p.goto(base+'/index.html',{waitUntil:'load',timeout:120000});
    await p.waitForSelector('#mb-creative-btn',{timeout:120000});
    await sleep(1500);
    await p.click('#mb-creative-btn');   // the REAL menu button — DEBUG auto-start never sets creative
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await p.evaluate("__hc.lock(true); __hc.setTime(0.27)");
    await sleep(1500);
    await p.screenshot({path:SHOT+'/00-spawn.png'});

    // ---- A PLAYER OPENS CREATIVE WITH C AND LOOKS FOR A RED DOT ----
    await p.keyboard.press('KeyC'); await sleep(900);
    await p.screenshot({path:SHOT+'/01-creative.png'});
    const cells=await p.evaluate(`(()=>{const g=document.getElementById('creative');if(!g)return null;
      const all=[...g.querySelectorAll('div[title]')];
      const want=['Red Dot Sight','Holographic Sight','Rifle Scope','Suppressor','Weapon Light','Laser Sight','Foregrip','AR-15'];
      return {total:all.length, found:want.map(w=>{const i=all.findIndex(c=>c.title===w);return {w,i};})};})()`);
    console.log('CREATIVE', JSON.stringify(cells));
    // click the real cells for a gun + three attachments
    for(const name of ['AR-15','Red Dot Sight','Suppressor','Weapon Light']){
      const box=await p.evaluate(`(()=>{const c=[...document.querySelectorAll('#creative div[title]')].find(x=>x.title===${JSON.stringify(name)});
        if(!c)return null; c.scrollIntoView({block:'center'}); const r=c.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      if(!box){ console.log('NO CELL for '+name); continue; }
      await p.mouse.click(box.x,box.y); await sleep(250);
    }
    await p.keyboard.press('KeyC'); await sleep(600);
    const inv=await p.evaluate("(()=>{const s=__hc.st(); return (s.inv||[]).filter(Boolean).map(x=>x.id+'x'+x.n);})()");
    console.log('INV AFTER CREATIVE CLICKS', JSON.stringify(inv));
    await p.screenshot({path:SHOT+'/02-after-take.png'});

    // ---- HOLD THE GUN: select the hotbar slot with the real number key ----
    const gunSlot=await p.evaluate("(()=>{const s=__hc.st();const i=(s.inv||[]).findIndex(x=>x&&x.id==='ar15');return i;})()");
    console.log('gun in slot',gunSlot);
    if(gunSlot>=0&&gunSlot<9) await p.keyboard.press('Digit'+(gunSlot+1));
    await sleep(1200);
    await p.screenshot({path:SHOT+'/03-holding-gun.png'});

    // ---- PRESS T ----
    await p.keyboard.press('KeyT'); await sleep(900);
    await p.screenshot({path:SHOT+'/04-attach-screen.png'});
    const attTxt=await p.evaluate("(()=>{const d=document.getElementById('attui');return d?{shown:d.style.display,text:(d.innerText||'').slice(0,900)}:null;})()");
    console.log('ATT SCREEN', JSON.stringify(attTxt));

    // ---- FIT: ENTER on OPTIC, S to MUZZLE, ENTER, S to LIGHT, ENTER ----
    await p.keyboard.press('Enter'); await sleep(600);
    await p.keyboard.press('KeyS'); await sleep(200); await p.keyboard.press('Enter'); await sleep(600);
    await p.keyboard.press('KeyS'); await sleep(200); await p.keyboard.press('Enter'); await sleep(600);
    await p.screenshot({path:SHOT+'/05-fitted-screen.png'});
    const fitTxt=await p.evaluate("(()=>{const d=document.getElementById('attui');return (d.innerText||'').slice(0,700);})()");
    console.log('AFTER FITS', JSON.stringify(fitTxt));
    await p.keyboard.press('KeyT'); await sleep(1200);
    await p.screenshot({path:SHOT+'/06-gun-with-attachments.png'});
    // ADS through the optic
    await p.mouse.down({button:'right'}); await sleep(1200);
    await p.screenshot({path:SHOT+'/07-ads.png'});
    await p.mouse.up({button:'right'}); await sleep(400);

    console.log('PAGE ERRORS', JSON.stringify(errs.slice(0,10)));
    console.log('CONSOLE', JSON.stringify(warns.filter(w=>/glb|attach|placement|model/i.test(w)).slice(0,10)));
  } finally { if(b)await b.close(); server.kill(); }
})();
