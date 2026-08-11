// THREE MONKS KILLED THROUGH THE REAL DEATH PATH MAKES THE HORRIFIC WRETCH — including when the Wretch is not out at the time,
// which is the common case and the one that silently did nothing.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const PAGE=process.env.HC_PAGE||'index.html', TAG=process.env.HC_TAG||'now';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
let fails=0,checks=0; const ok=(n,c,d)=>{ checks++; if(!c)fails++; console.log((c?'  PASS  ':'  FAIL  ')+n+(d!==undefined?('   '+JSON.stringify(d)):'')); };
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
const page=await (await browser.newContext({viewport:{width:900,height:600}})).newPage();
const errs=[]; page.on('pageerror',e=>{errs.push(String(e.message||e));console.log('  PAGEERROR:',String(e.message||e).slice(0,200));});
await page.goto(base+'/'+PAGE+'?debug=1',{waitUntil:'load',timeout:120000});
await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
const ev=js=>page.evaluate(js);
await ev('(()=>{ __hc.lock(true); __hc.setTime(0.45); __hc.cmdRun("/gamemode survival"); })()').catch(()=>{});
await sleep(2500);
// THROUGH THE GAME'S OWN HOOKS. The first version of this reached for `animals` and `HORROR` inside an evaluate — both are
// module scope, so every kill returned {no:'no animals'} and every counter read null, and the run reported 4/6 while having
// killed nothing at all. __hc.monkKill kills through killAnimal (the single death chokepoint the gate hangs off) and counts
// horrific instances the way hwOnSacrifice actually works — by DRESSING the prime Wretch, not by adding one.
const state=async()=>{ const m=await ev('__hc.monks()'); const hw=await ev('__hc.hwState()');
  return { wrath:m&&m.wrath, horrific:JSON.stringify(hw).includes('"horrific":true') }; };
const s0=await state();
console.log('  before: '+JSON.stringify(s0));
ok('the Wretch does not start out changed', s0.horrific===false, s0);
ok('and no monk has been killed yet', s0.wrath===0, s0.wrath);
for(let k=1;k<=3;k++){
  const sp=await ev('__hc.monkSpawn(3,0)'); await sleep(900);
  const r=await ev('__hc.monkKill()'); await sleep(800);
  const st=await state();
  console.log('  kill '+k+': '+JSON.stringify(r)+'  -> '+JSON.stringify(st));
  ok('kill '+k+' was counted', st.wrath===k, {want:k, got:st.wrath});
  if(k<3) ok('after '+k+' it has NOT changed yet', st.horrific===false, st.horrific);
}
// THE CASE THAT USED TO LOSE IT: if the Wretch had no rig when the third kill landed, the conversion is owed and must be paid
// as soon as it has one. Waiting here is the whole point of the test.
let st=await state();
if(!st.horrific){
  console.log('  owed but not yet paid — bringing the Wretch OUT, which is what the debt waits for');
  await ev('__hc.summon ? __hc.summon() : 0').catch(()=>{});
  await ev('__hc.wretchArm ? __hc.wretchArm(true) : 0').catch(()=>{});
  for(let i=0;i<40 && !st.horrific;i++){ await sleep(500); st=await state(); }
}
console.log('  after three: '+JSON.stringify(st));
ok('three monk kills made the Horrific Wretch', st.horrific===true, st);
// AND IT IS ACTUALLY DRAWN. The flag was never the claim — this bench passed while the creature was invisible, because dressing
// the PRIME hands its group to the drift loop and that loop only ever iterated wretchExtra. Attached and never stepped renders as
// nothing at all, so `steps` climbing between two samples is the check that would have caught it.
// IT HAS TO BE OUT TO BE DRAWN, so put it out before measuring. Sampling in daylight measured a creature that had already
// despawned — attached, correctly not stepped, and indistinguishable from the bug. Night, then summon, then measure.
await ev('__hc.setTime(0.85)'); await sleep(900);
await ev('__hc.wretchArm ? __hc.wretchArm(true,true) : 0').catch(()=>{});
await ev('__hc.summon ? __hc.summon() : 0').catch(()=>{});
for(let i=0;i<30;i++){ const a=await ev('__hc.hwProbe()');
  if(Array.isArray(a) && a.some(x=>x.prime&&x.active)) break; await sleep(400); }
const d1=await ev('__hc.hwProbe()');
await sleep(1500);
const d2=await ev('__hc.hwProbe()');
console.log('  drift: '+JSON.stringify(d1));
console.log('  drift: '+JSON.stringify(d2));
const p1=Array.isArray(d1)?d1.find(x=>x.prime):null, p2=Array.isArray(d2)?d2.find(x=>x.prime):null;
ok('the converted PRIME is attached to the drift loop', !!p1, d1);
ok('and the loop is stepping it, so it is drawn', !!(p1&&p2&&(p2.steps>p1.steps)), {before:p1&&p1.steps, after:p2&&p2.steps});
ok('no page errors', errs.length===0, errs.slice(0,2));
console.log(`\n${checks-fails}/${checks} checks pass`);
await browser.close(); server.kill(); process.exit(fails?1:0);
