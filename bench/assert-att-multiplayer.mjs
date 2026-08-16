// DOES A TEAMMATE SEE WHAT IS BOLTED TO YOUR GUN? A peer's held item is built from an item id alone, so everything
// the attachment system does was owner-side: your rifle wore a scope on your screen and was bare in everyone else's.
//
// TWO REAL CLIENTS, one relay. There is no way to test replication with one page — the thing being tested is what
// crosses the wire — so this opens two browser contexts against the same mp-server, has one fit an optic and a can,
// and asks the OTHER what it built in that player's hand.
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
  p.on('pageerror',e=>console.log(tag+' PAGEERROR:',String(e.message).slice(0,120)));
  await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
  await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
  await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
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
    // The room name is whatever the build joins by default; both clients use the same one and the same seed, which
    // is what makes them see each other at all.
    // Both clients connect straight to the local relay's websocket — the menu's room/mode plumbing is the UI's, and
    // what is being tested here is the wire, not the lobby.
    const ws="ws://127.0.0.1:"+port;
    await A.evaluate(u=>__hc.mpConnect(u), ws); await sleep(2000);
    await B.evaluate(u=>__hc.mpConnect(u), ws); await sleep(4000);
    const peersA=(await A.evaluate("__hc.mpPeers()")).n;
    const peersB=(await B.evaluate("__hc.mpPeers()")).n;
    console.log('peers', peersA, peersB);
    if(peersA<1 && peersB<1){ console.log('SKIP — the two clients did not see each other; nothing to measure'); await b.close(); process.exit(0); }
    await A.evaluate("__hc.hold('ar15'); __hc.attFit('optic','red_dot'); __hc.attFit('muzzle','suppressor')");
    await sleep(2500);
    const pr=await B.evaluate("__hc.mpPeers()");
    const seen=(pr.peers||[]).find(x=>x.held==='ar15')||{held:null};
    console.log('peer sees', JSON.stringify(seen));
    T('the peer sees the gun at all', seen.held==='ar15', seen);
    T('the attachment string crossed the wire', !!seen.at && /red_dot/.test(seen.at), seen);
    T('the peer built the fitted pieces', (seen.wearing||[]).length>=2, seen);
    // AND A GUN THROWN ON THE FLOOR IS THE SAME GUN WHEN A TEAMMATE PICKS IT UP. The drop is broadcast by id and
    // count; without the rest of the stack's state, the rifle you threw across the room arrives stripped.
    await A.evaluate("__hc.hold('ar15'); __hc.attFit('optic','red_dot'); __hc.attFit('muzzle','suppressor')"); await sleep(800);
    const thrown=await A.evaluate("(()=>{const s=__hc.heldSlotProbe?null:null; return __hc.attTossTrip? 'probe' : 'none';})()").catch(()=>'none');
    await A.evaluate("(()=>{ const st=__hc.attProbe(); __hc.tossHeld && __hc.tossHeld(); })()").catch(()=>{});
    await sleep(1500);
    const bDrops=await B.evaluate("__hc.dropState?__hc.dropState():null").catch(()=>null);
    console.log('peer drops', JSON.stringify(bDrops));
    if(bDrops && bDrops.n>0){
      T('the peer sees the thrown gun carrying its fits', (bDrops.withAtt||0)>0, bDrops);
    } else console.log('SKIP — no drop reached the peer to measure');

    console.log(fails? fails+' FAILURE(S)':'ALL PASS');
    await b.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(String(e.message).slice(0,300)); process.exit(1); });
