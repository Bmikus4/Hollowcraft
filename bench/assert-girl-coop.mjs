// DOES A TEAMMATE SEE THE GIANTESS? She was owner-side like the animals — one machine ran her AI and nobody else
// was told she existed — so a thirteen-block woman walking a player down was invisible to everyone but her target.
//
// TWO REAL CLIENTS, one relay, as with the attachments: the thing under test is the wire. The host spawns her; the
// guest is asked whether she is there, where, and whether her rig is actually posed rather than standing in its
// bind pose (a driven body that never moves is the failure mode a position check alone would pass).
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
async function boot(b, base, tag){
  const p=await (await b.newContext({viewport:{width:800,height:450}})).newPage();
  p.on('pageerror',e=>console.log(tag+' PAGEERROR:',String(e.message).slice(0,140)));
  await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
  await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
  await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
  await p.waitForFunction("(()=>{try{return __hc.girlState().loaded===true;}catch(e){return false;}})()",null,{timeout:180000});
  return p;
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const A=await boot(b,base,'A'), B=await boot(b,base,'B');
    const ws="ws://127.0.0.1:"+port;
    await A.evaluate(u=>__hc.mpConnect(u), ws); await sleep(2000);
    await B.evaluate(u=>__hc.mpConnect(u), ws); await sleep(3500);
    const host=await A.evaluate("(()=>{try{return !!NET.host;}catch(e){return null;}})()").catch(()=>null);
    console.log('A is host:', host);
    await A.evaluate("__hc.cmdRun('/gamemode creative'); __hc.girl(16)"); await sleep(3000);
    const a=await A.evaluate("__hc.girlState()");
    const g1=await B.evaluate("__hc.girlState()");
    console.log('host', JSON.stringify({active:a.active,pos:a.pos&&a.pos.map(v=>+v.toFixed(1)),state:a.state}));
    console.log('guest', JSON.stringify({active:g1.active,pos:g1.pos&&g1.pos.map(v=>+v.toFixed(1)),state:g1.state}));
    T('the host has her', a.active===true, a);
    T('the guest has her too', g1.active===true, g1);
    if(g1.active){
      const near=Math.hypot((a.pos[0]-g1.pos[0]),(a.pos[2]-g1.pos[2]));
      T('and in the same place, within a stride', near<2.5, {apart:+near.toFixed(2)});
      // A DRIVEN BODY THAT NEVER MOVES would pass a position check. Sample a bone twice and require it to travel.
      const p0=await B.evaluate("__hc.girlTrace?JSON.parse(JSON.stringify(__hc.girlTrace())):null").catch(()=>null);
      await sleep(1500);
      const p1=await B.evaluate("__hc.girlTrace?JSON.parse(JSON.stringify(__hc.girlTrace())):null").catch(()=>null);
      if(p0&&p1&&p0.foot&&p1.foot){
        const moved=Math.hypot(p1.foot[0]-p0.foot[0], p1.foot[1]-p0.foot[1], p1.foot[2]-p0.foot[2]);
        T('her rig is being posed on the guest, not standing in bind pose', moved>0.02, {moved:+moved.toFixed(3)});
      } else console.log('note: girlTrace unavailable on the guest, rig motion not asserted');
    }
    // AND SHE DIES FOR EVERYONE. The host kills her; the guest must take the same state, not keep walking a corpse.
    await A.evaluate("__hc.girlShoot('Head',30)"); await sleep(3000);
    const a2=await A.evaluate("__hc.girlState()"), g2=await B.evaluate("__hc.girlState()");
    console.log('after the kill  host', a2.state, ' guest', g2.state);
    T('the guest sees her fall', g2.state==='die'||g2.state==='dead', {host:a2.state, guest:g2.state});
    const drops=await B.evaluate("__hc.dropState()");
    T('and her bag is on the guest floor too', (drops.list||[]).some(d=>d.id==='giantess_bag'), drops);
    console.log(fails? fails+' FAILURE(S)':'ALL PASS');
    await b.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(String(e.message).slice(0,300)); process.exit(1); });
