// The original image is in, and /pines flip works. Reads the actual UVs rather than trusting the message.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
const errs=[]; const bad=[]; page.on('response',r=>{ if(r.status()>=400) bad.push(r.status()+' '+r.url().split('/').slice(3).join('/')); });
page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
page.on('console',m=>{const t=m.text(); if(/\[loop\] exception|not defined|not a function|404/i.test(t)) errs.push(t.slice(0,200));});
await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
await page.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.setTime(0.25);");
const B=await page.evaluate('__hc.islandCentres().mass');
const P=await page.evaluate(`(()=>{ const th=150*Math.PI/180, sea=__hc.island().sea;
  for(let d=340; d>60; d-=4){ const x=Math.round(${B.x}+Math.cos(th)*d), z=Math.round(${B.z}+Math.sin(th)*d);
    if(__hc.groundY(x,z)>sea+1) return {x,z,g:__hc.groundY(x,z)}; } return null; })()`);
await page.evaluate(`__hc.tpAt(${P.x}+0.5, ${P.g}+2, ${P.z}+0.5);`);
for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
await sleep(2500);
console.log((await page.evaluate("__hc.cmdRun('/waypoint island center mass')")).out[0].split('\n')[0]);
console.log((await page.evaluate("__hc.cmdRun('/pines at world 105 -165')")).out.join(' | ').split('\n')[0]);
await sleep(1500);
const st=await page.evaluate('__hc.pinesState()');
console.log('  image', st.tex, ' loaded', st.texLoaded, ' quads', st.n, ' facing', JSON.stringify(st.facing));
const uv=async()=>await page.evaluate(`(()=>{ const g=__hc.pinesUV(); return g; })()`);
console.log('  uv corners, no flip :', JSON.stringify(await uv()));
await page.evaluate("__hc.cmdRun('/pines flip h')"); await sleep(600);
console.log('  uv corners, flip h  :', JSON.stringify(await uv()));
await page.evaluate("__hc.cmdRun('/pines flip v')"); await sleep(600);
console.log('  uv corners, flip h+v:', JSON.stringify(await uv()));
await page.evaluate("__hc.cmdRun('/pines flip none')"); await sleep(600);
console.log('  uv corners, none    :', JSON.stringify(await uv()));
const az=105*Math.PI/180;
await page.evaluate('__hc.cam({yaw:'+Math.atan2(-Math.cos(az),-Math.sin(az))+', pitch:0.02});'); await sleep(1200);
await page.screenshot({path:path.join(ROOT,'bench','results','pines-original-105.png')});
console.log(bad.length?('  failed requests: '+[...new Set(bad)].join(' , ')):'  no failed requests');
console.log(errs.length?('ERRORS: '+errs.slice(0,4).join(' | ')):'no errors');
await browser.close(); server.kill();
