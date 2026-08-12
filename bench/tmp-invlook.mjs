// Two frames of the reworked inventory: the HUD bar alone, and the whole screen with the inventory open.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = 'D:\\Code\\Minecraft', OUT = path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=u=>new Promise((res,rej)=>{const t0=Date.now();(function poll(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>Date.now()-t0>15000?rej():setTimeout(poll,250));})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const bpath=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p=>fs.existsSync(p));
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
try{
  const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
  const br=await chromium.launch({executablePath:bpath,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required']});
  const ctx=await br.newContext({viewport:{width:1280,height:800}}); const p=await ctx.newPage();
  await p.goto(base+'/index.html',{waitUntil:'load'}); await sleep(3000);
  await p.click('#mb-solo');
  for(let i=0;i<90;i++){ if(await p.evaluate(()=>window.__hc.loadState().circleDone)) break; await sleep(500); }
  await sleep(2500);
  await p.evaluate(()=>window.__hc.gridFillPacked(['ar15','stim_syringe','rifle_ammo','cobble','revolver','wooden_spear','iron_helmet']));
  await p.evaluate(()=>{ __hc.giveItem('revolver',1); __hc.giveItem('torch',6); __hc.equipHat&&__hc.equipHat('iron_helmet'); __hc.eqUI&&__hc.eqUI('close'); });
  await sleep(900);
  await p.screenshot({path:path.join(OUT,'inv-hud.png'), clip:{x:400,y:0,width:480,height:180}});
  await p.evaluate(()=>window.__hc.openInv()); await sleep(1200);
  await p.screenshot({path:path.join(OUT,'inv-open.png')});
  await p.evaluate(()=>document.getElementById('craftbtn').click()); await sleep(500);
  await p.screenshot({path:path.join(OUT,'inv-craft.png')});
  console.log('shots written');
  await br.close();
} finally { try{ server.kill(); }catch(e){} }
