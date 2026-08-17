// THE MODAL ATTACH SCREEN, PLAYED: tap T, click an icon, click the pill to take it off.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net'; import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const SHOT='C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/f3f45f2f-6bb7-4d56-87a5-95b314c4601d/scratchpad/att4';
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
    await p.evaluate("__hc.hold('ar15'); for(const i of ['red_dot','holo_sight','suppressor','foregrip','weapon_light','laser_sight']) __hc.cmdRun('/give '+i+' 1')");
    await sleep(900);
    await p.keyboard.press('KeyT'); await sleep(1500);
    await p.screenshot({path:SHOT+'/01-open.png'});
    const rows=await p.evaluate(`(()=>[...document.querySelectorAll('#attmk > div')].map(r=>({slot:r.dataset.slot,shown:r.style.display,
      pill:r.querySelector('.attpill').textContent, icons:r.querySelector('.atticons').children.length,
      x:Math.round(parseFloat(r.style.left)||-1), y:Math.round(parseFloat(r.style.top)||-1)})))()`);
    console.log('ROWS', JSON.stringify(rows));
    // click the first icon on the OPTIC row, the way a player would
    const box=await p.evaluate(`(()=>{const r=document.querySelector('#attmk > div[data-slot="optic"]'); if(!r)return null;
      const b=r.querySelector('.atticons').children[0]; if(!b)return null; const q=b.getBoundingClientRect();
      return {x:q.x+q.width/2,y:q.y+q.height/2};})()`);
    console.log('icon at', JSON.stringify(box));
    await p.evaluate(`(()=>{window.__seen=[];
      document.getElementById('attmk').addEventListener('mousedown',e=>{ window.__seen.push((e.target.className||e.target.tagName)+'@'+Math.round(e.clientX)+','+Math.round(e.clientY)); },true);
      return 1;})()`);
    console.log('HITTEST', await p.evaluate(({x,y})=>{ const out=[]; let e=document.elementFromPoint(x,y);
      while(e && out.length<5){ const cs=getComputedStyle(e); out.push((e.id?'#'+e.id:'')+(e.className?'.'+String(e.className).slice(0,20):'')+e.tagName+' z='+cs.zIndex+' pe='+cs.pointerEvents); e=e.parentElement; }
      return out; }, box));
    if(box){ await p.mouse.move(box.x,box.y); await sleep(150); await p.mouse.down(); await sleep(120); await p.mouse.up(); await sleep(800); }
    console.log('SEEN', JSON.stringify(await p.evaluate("window.__seen")));
    console.log('AFTER FIT', JSON.stringify((await p.evaluate("__hc.attProbe()")).wearing));
    await p.screenshot({path:SHOT+'/02-fitted.png'});
    // click the pill to take it off again
    const pb=await p.evaluate(`(()=>{const r=document.querySelector('#attmk > div[data-slot="optic"]');
      const q=r.querySelector('.attpill').getBoundingClientRect(); return {x:q.x+q.width/2,y:q.y+q.height/2};})()`);
    await p.mouse.click(pb.x,pb.y); await sleep(700);
    console.log('AFTER REMOVE', JSON.stringify((await p.evaluate("__hc.attProbe()")).wearing));
    await p.keyboard.press('KeyT'); await sleep(800);
    console.log('CLOSED ui', await p.evaluate("__hc.attProbe().ui"), 'lock', JSON.stringify(await p.evaluate("(()=>{const l=__hc.lockLog();return {wanted:l.wanted,ui:l.ui,paused:l.paused};})()")));
    console.log('ERRORS', JSON.stringify(errs.slice(0,6)));
  } finally { if(b)await b.close(); server.kill(); } })();
