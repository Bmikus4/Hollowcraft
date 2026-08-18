// FLAT-IMAGE PINES placed by bearing. Stand where the dial reads 150 and place them at 105 and -165, then
// photograph each one by looking straight at the bearing it was given.
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
const errs=[]; page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
page.on('console',m=>{const t=m.text(); if(/\[loop\] exception|not defined|not a function/i.test(t)) errs.push(t.slice(0,200));});
await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
await page.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.setTime(0.25);");
// STAND WHERE THE DIAL READS 150: on the bearing 150 from the centre of mass, out on land.
const B=await page.evaluate('__hc.islandCentres().mass');
const P=await page.evaluate(`(()=>{ const th=150*Math.PI/180, sea=__hc.island().sea;
  for(let d=340; d>60; d-=4){ const x=Math.round(${B.x}+Math.cos(th)*d), z=Math.round(${B.z}+Math.sin(th)*d);
    if(__hc.groundY(x,z)>sea+1) return {x,z,g:__hc.groundY(x,z),d}; } return null; })()`);
await page.evaluate(`__hc.tpAt(${P.x}+0.5, ${P.g}+2, ${P.z}+0.5);`);
for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
await sleep(2500);
console.log('standing at', JSON.stringify(P), ' dial bearing', (await page.evaluate("__hc.cmdRun('/waypoint island center mass'),__hc.wpAxis&&__hc.wpAxis()?__hc.wpAxis().bearingDeg:null")));
const r=await page.evaluate("__hc.cmdRun('/pines at 105 -165')");
(r.out||[]).forEach(l=>String(l).split('\n').forEach(x=>console.log('   '+x)));
console.log('   ', JSON.stringify(await page.evaluate("__hc.pinesState()")));
for(const deg of [105,-165]){
  const az=deg*Math.PI/180;
  await page.evaluate('__hc.cam({yaw:'+Math.atan2(-Math.cos(az),-Math.sin(az))+', pitch:0.02});');
  await sleep(1100);
  await page.screenshot({path:path.join(ROOT,'bench','results',`pines-at-${deg}.png`)});
  console.log(`   looking at ${deg} -> pines-at-${deg}.png`);
}
console.log(errs.length?('ERRORS: '+errs.slice(0,4).join(' | ')):'no errors');
await browser.close(); server.kill();
