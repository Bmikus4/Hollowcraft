// The arm goes where the hand goes, and does NOT walk off while it is there.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
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
const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,200)); });
await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
const ev=js=>page.evaluate(js);
await ev('(()=>{ __hc.lock(true); __hc.setTime(0.45); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
await sleep(2500);
await ev('__hc.cam({yaw:0,pitch:0})'); await sleep(200);
const P0=await ev('__hc.pos()'); const wallZ=Math.floor(P0.z)-2, standX=Math.floor(P0.x)+0.5, standY=P0.y;
await ev(`(()=>{ for(let dx=-6;dx<=6;dx++) for(let dy=-1;dy<=4;dy++) __hc.setBlock(dx,dy,-2,'stone'); })()`);
await sleep(1200);
const goTo=async(dz)=>{ await ev(`__hc.tpAt(${standX},${standY},${wallZ+1+dz})`); await ev('__hc.cam({yaw:0,pitch:0})'); };
const relax=async()=>{ for(let i=0;i<40;i++){ const b=await ev('__hc.blockOut()'); if(!(b.bend>0.02)) return; await sleep(100); } };
for(const id of ['torch','wood_pickaxe','lantern']){
  await ev(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${id} 1")`); await ev(`__hc.hold(${JSON.stringify(id)})`); await sleep(300);
  await ev('__hc.offhandSet("torch",1)'); await sleep(300);
  await goTo(2.20); await sleep(200); await relax();
  const off=await ev('__hc.handPose()'), offA=await ev('__hc.armPos ? __hc.armPos() : null').catch(()=>null);
  await goTo(0.45); await sleep(1000);
  const at1=await ev('__hc.handPose()');
  await sleep(2500);                                        // HELD there: the z rebase is what this second sample is for
  const at2=await ev('__hc.handPose()');
  await goTo(2.20); await sleep(200); await relax();
  const back=await ev('__hc.handPose()');
  const d=(a,b)=>[+(b[0]-a[0]).toFixed(4),+(b[1]-a[1]).toFixed(4)];
  console.log('  '+id.padEnd(14)+' item '+JSON.stringify(d(off.item,at1.item))+'  arm '+JSON.stringify(d(off.arm,at1.arm))
    +'   offItem '+JSON.stringify(d(off.offItem,at1.offItem))+'  offArm '+JSON.stringify(d(off.offArm,at1.offArm)));
  // THE CLAIM IS "WITH THEM", so the quantity is the DIFFERENCE of the two deltas, not either one alone. Asserting that the arm
  // moved would be the wrong test: how far a wall pushes an item depends on the item, and the offhand's own rest already sits
  // deep enough that a torch there barely retracts at all. What must hold either way is that the hand and the thing in it move
  // by the SAME amount — a matched zero is as correct as a matched 0.35.
  const near=(a,b)=>Math.abs(a[0]-b[0])<0.005 && Math.abs(a[1]-b[1])<0.005;
  ok(id+': the main arm moves exactly with its item', near(d(off.item,at1.item), d(off.arm,at1.arm)),
     {item:d(off.item,at1.item), arm:d(off.arm,at1.arm)});
  ok(id+': the offhand arm moves exactly with its item', near(d(off.offItem,at1.offItem), d(off.offArm,at1.offArm)),
     {item:d(off.offItem,at1.offItem), arm:d(off.offArm,at1.offArm)});
  // …and the main hand really is being pushed, or the pair above could match by both standing still.
  ok(id+': and the wall really did push the main item back', Math.abs(at1.item[1]-off.item[1])>0.05, {itemDelta:d(off.item,at1.item)});
  // AND IT DID NOT KEEP MOVING. 2.5s pressed against the wall is ~150 frames; an accumulating += on any axis is unmissable here.
  ok(id+': and it does not drift while held there', Math.abs(at2.arm[1]-at1.arm[1])<0.02 && Math.abs(at2.offArm[1]-at1.offArm[1])<0.02,
     {t1:[at1.arm[1],at1.offArm[1]], t2:[at2.arm[1],at2.offArm[1]]});
  ok(id+': and it returns to rest afterwards', Math.abs(back.arm[1]-off.arm[1])<0.02 && Math.abs(back.offArm[1]-off.offArm[1])<0.02,
     {rest:[off.arm[1],off.offArm[1]], back:[back.arm[1],back.offArm[1]]});
}
ok('no page errors', errs.length===0, errs.slice(0,2));
console.log(`\n${checks-fails}/${checks} checks pass`);
await browser.close(); server.kill(); process.exit(fails?1:0);
