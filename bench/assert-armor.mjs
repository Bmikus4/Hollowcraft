// IS EVERY PIECE OF ARMOUR TEXTURED, AND IS IT BIG ENOUGH TO SEE? Ben 08-16: "amke tunics/chestpieces bigger,
// texture them, texture all armor". Both halves are measurable and neither had a check.
//
// TEXTURED is a fact about the material: a piece either carries a map or it is flat paint. The trap is that armour is
// not one object — a cuirass is a torso box PLUS two sleeves parented to the arms, a boot is four boxes on two legs —
// so a check that reads the group and not its `extra` parts calls a half-done set finished.
//
// BIGGER is a measurement against the body, and it is asserted as a floor rather than an exact size: the numbers are
// authored by eye and will be tuned again, so this says "not smaller than what Ben approved", which is the thing a
// later tidy-up would break.
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
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const p=await (await b.newContext({viewport:{width:900,height:500}})).newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,140)));
    const missed=[]; p.on('response',r=>{ if(r.status()>=400 && /assets\/tex/.test(r.url())) missed.push(r.url()+' '+r.status()); });
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    // The third-person body is what wears armour; it is built on demand, so raise it before asking.
    await p.evaluate("__hc.cmdRun('/gamemode creative'); __hc.tpsProbe(true)"); await sleep(1500);
    T('no 404 on an armour texture', missed.length===0, missed);

    const worn=[];
    for(const id of ['leather_helmet','leather_chestplate','leather_leggings','leather_boots',
                     'iron_helmet','iron_chestplate','iron_leggings','iron_boots']){
      await p.evaluate(i=>__hc.armorProbe(i), id); await sleep(250);
    }
    const r=await p.evaluate("__hc.armorProbe()");
    for(const pc of (r.pieces||[])) console.log('  '+pc.slot.padEnd(6), 'meshes', pc.meshes, 'mapped', pc.mapped, 'size', JSON.stringify(pc.size));
    T('every armour piece has parts on the body', (r.pieces||[]).length===4 && r.pieces.every(pc=>pc.meshes>0), r.pieces);
    T('every armour mesh carries a texture', r.allMapped===true, (r.pieces||[]).filter(pc=>pc.mapped!==pc.meshes));
    // FLOORS, not exact sizes: these are eye-authored numbers that will be tuned again, and what must not happen is
    // them shrinking back to the boxes Ben called too small.
    const by=s=>(r.pieces||[]).find(pc=>pc.slot===s)||{size:[0,0,0]};
    T('the cuirass is at least as big as Ben approved', by('chest').size[0]>=0.52 && by('chest').size[1]>=0.68, by('chest').size);
    T('the greaves and boots grew with it', by('legs').size[0]>=0.46 && by('boots').size[0]>=0.24, {legs:by('legs').size, boots:by('boots').size});
    T('the cap grew too', by('helm').size[0]>=0.40, by('helm').size);
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)':'ALL PASS');
    await b.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(String(e.message).slice(0,300)); process.exit(1); });
