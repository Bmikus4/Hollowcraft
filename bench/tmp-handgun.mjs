// A HANDGUN IS HELD BY ITS GRIP, AT THE FIST, AND NEVER SHOULDERED.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
let fails=0,checks=0; const ok=(n,c,d)=>{ checks++; if(!c)fails++; console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?('   '+JSON.stringify(d)):'')); };
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
const page=await (await browser.newContext({viewport:{width:1000,height:700}})).newPage();
const errs=[]; page.on('pageerror',e=>{errs.push(String(e.message||e));console.log('  PAGEERROR:',String(e.message||e).slice(0,200));});
await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
const ev=js=>page.evaluate(js);
await ev('(()=>{ __hc.lock(true); __hc.setTime(0.42); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
await sleep(2500);
await ev('__hc.cam({yaw:0,pitch:0})'); await sleep(300);
const grips=await ev('__hc.gunGrips()');
console.log('  declared grips: '+JSON.stringify(grips).slice(0,300));
for(const id of ['revolver','revolver_suppressed','ar15','hunting_rifle']){
  await ev(`__hc.offNone(); __hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${id} 1")`); await ev(`__hc.hold("${id}")`); await sleep(900);
  const hip=await ev('__hc.gunHandOn ? __hc.viewBounds() : null');
  const hp=await ev('__hc.handPose()');
  await ev('__hc.aim(true)'); await sleep(1100);
  const ads=await ev('__hc.handPose()');
  const cl=await ev('__hc.adsClearance()');
  await ev('__hc.aim(false)'); await sleep(300);
  console.log('  '+id.padEnd(20)+' hip item '+JSON.stringify(hp.item)+'  ads item '+JSON.stringify(ads.item)+'  adsT '+cl.adsT+'  clear '+cl.clearance);
  if(id.startsWith('revolver')){
    // HIP: out on the strong side and level with the fist, not tucked at -0.20 like a long arm.
    ok(id+': hip is held out on the strong side', hp.item[0]>0.10, {x:hp.item[0]});
    // AIMED: on the centre line — a pistol comes to the eye, it does not weld to a cheek off to one side.
    ok(id+': aimed comes onto the centre line', Math.abs(ads.item[0])<0.12, {x:ads.item[0]});
    ok(id+': and it is not cut by the near plane', cl.clearance>0.02, cl.clearance);
    await ev(`__hc.hold("${id}")`); await sleep(400);
    await page.screenshot({path:path.join(OUT,'handgun-'+id+'-hip.png')});
    await ev('__hc.aim(true)'); await sleep(1100);
    await page.screenshot({path:path.join(OUT,'handgun-'+id+'-ads.png')});
    await ev('__hc.aim(false)'); await sleep(300);
  } else {
    // A LONG ARM IS UNTOUCHED. The whole class is gated on a flag, and this is what says so.
    ok(id+': a long arm still uses the shared hip pose', Math.abs(hp.item[0]-0.17)<0.06, {x:hp.item[0]});
  }
}
ok('no page errors', errs.length===0, errs.slice(0,2));
console.log(`\n${checks-fails}/${checks} checks pass`);
await browser.close(); server.kill(); process.exit(fails?1:0);
