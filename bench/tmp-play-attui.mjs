// THE ATTACH SCREEN, PLAYED. Real T, real clicks on the bag and on the chips over the gun.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net'; import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const SHOT='C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/f3f45f2f-6bb7-4d56-87a5-95b314c4601d/scratchpad/attui';
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
    const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,200)));
    await p.goto(base+'/index.html',{waitUntil:'load',timeout:120000});
    await p.waitForSelector('#mb-creative-btn',{timeout:120000}); await sleep(1500);
    await p.click('#mb-creative-btn');
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await p.evaluate("__hc.lock(true); __hc.setTime(0.30)"); await sleep(1500);
    // take a gun and three attachments out of the REAL creative menu
    for(const n of ['AR-15','Red Dot Sight','Suppressor','Foregrip','Weapon Light']){
      await p.keyboard.press('KeyC'); await sleep(600);
      const box=await p.evaluate(`(()=>{const c=[...document.querySelectorAll('#creative div[title]')].find(x=>x.title===${JSON.stringify(n)});
        if(!c)return null; c.scrollIntoView({block:'center'}); const r=c.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      if(!box){ console.log('NO CELL '+n); await p.keyboard.press('KeyC'); continue; }
      await p.mouse.click(box.x,box.y); await sleep(200); await p.keyboard.press('KeyC'); await sleep(400);
    }
    await p.keyboard.press('Digit1'); await sleep(1200);
    await p.keyboard.press('KeyT'); await sleep(1400);
    await p.screenshot({path:SHOT+'/01-open.png'});
    const chips=await p.evaluate(`(()=>[...document.querySelectorAll('#attmk div')].map(c=>({slot:c.dataset.slot,shown:c.style.display,text:c.textContent,
      x:Math.round(parseFloat(c.style.left)||-1),y:Math.round(parseFloat(c.style.top)||-1)})))()`);
    console.log('CHIPS', JSON.stringify(chips));
    // pick the red dot out of the bag: find its cell in the grid or the hotbar and click it
    const pick=async(idx)=>{
      const box=await p.evaluate((i)=>{ const cells=[...document.querySelectorAll('#hotbar > *')];
        const c=cells[i]; if(!c)return null; const r=c.getBoundingClientRect();
        return {x:r.x+r.width/2,y:r.y+r.height/2,cells:cells.length}; }, idx);
      if(!box) return null; await p.mouse.click(box.x,box.y); await sleep(400); return box; };
    const got=await pick(1);   // slot 2 = Red Dot Sight
    console.log('PICKED', JSON.stringify(got), 'cursor', await p.evaluate("(()=>{const c=document.getElementById('cursor');return c?c.style.display:'?'})()"));
    await p.screenshot({path:SHOT+'/02-carrying.png'});
    const chips2=await p.evaluate(`(()=>[...document.querySelectorAll('#attmk div')].map(c=>({slot:c.dataset.slot,border:c.style.borderColor,text:c.textContent})))()`);
    console.log('CHIPS-LIT', JSON.stringify(chips2));
    // drop it on the MUZZLE (wrong) then the OPTIC (right)
    for(const sl of ['muzzle','light']){
      const b2=await p.evaluate(`(()=>{const c=document.querySelector('#attmk div[data-slot="${sl}"]'); if(!c||c.style.display==='none')return null;
        const r=c.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      if(!b2){ console.log('no chip for '+sl); continue; }
      await p.mouse.click(b2.x,b2.y); await sleep(700);
      console.log('DROP on '+sl, await p.evaluate("__hc.attProbe().wearing?JSON.stringify(__hc.attProbe().wearing):'-'"));
      await p.screenshot({path:SHOT+'/03-drop-'+sl+'.png'});
    }
    await p.keyboard.press('KeyT'); await sleep(1200);
    await p.screenshot({path:SHOT+'/04-closed.png'});
    console.log('WEARING AFTER CLOSE', await p.evaluate("JSON.stringify(__hc.attProbe().wearing)"));
    console.log('ERRORS', JSON.stringify(errs.slice(0,6)));
  } finally { if(b)await b.close(); server.kill(); } })();
