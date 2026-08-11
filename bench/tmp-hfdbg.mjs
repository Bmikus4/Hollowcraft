import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { HELPERS } from './perf-census.mjs';
const ROOT='D:/code/Minecraft', OUT=ROOT+'/bench/results';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
const port=await freePort();
const server=spawn(process.execPath,[ROOT+'/server.js'],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
try{
  const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
  const page=await (await browser.newContext({viewport:{width:900,height:520}})).newPage();
  page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
  page.on('console',m=>{const t=m.text(); if(/ERROR: 0:|shader/i.test(t))console.log('  GLSL:',t.slice(0,300));});
  await page.goto(base+'/index.html?debug=1&rd=8&cb='+Date.now()+'',{waitUntil:'load',timeout:120000});
  await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
  await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
  await page.evaluate(HELPERS);
  await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cinema(true);`);
  await page.evaluate(`__hc.heightFog({on:true, density:0.003})`);
  await page.evaluate(`(function(){ H.setTime(0.44); goShore(); const p=__hc.pos(); __hc.tpAt(p.x,p.y+38,p.z); H.cam({yaw:0.7,pitch:-0.16}); })()`);
  for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
  await sleep(3000);
  console.log('  state', JSON.stringify(await page.evaluate(`__hc.heightFog({})`)));
  console.log('  pos  ', JSON.stringify(await page.evaluate(`__hc.pos()`)));
  for(const [d,name] of [[1,'f'],[2,'t'],[3,'Vy'],[4,'worldY']]){
    console.log('  set dbg', d, JSON.stringify(await page.evaluate(`__hc.heightFog({dbg:${d}})`)));
    console.log('  uniform now', await page.evaluate(`__hc.heightFog({}).dbg`)); await sleep(400);
    await page.screenshot({path:OUT+`/hfdbg-${name}.png`});
  }
  await page.evaluate(`__hc.heightFog({dbg:0})`);
} finally { await browser.close(); server.kill(); }
