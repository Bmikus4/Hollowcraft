// DOES THE RELOAD ANIMATION MOVE ANYTHING? Three of its four limbs were written against parts that were never carved
// out of the one-piece gun mesh — `mag`, `bolt` and `cyl` — so a reload dipped the whole gun and the magazine, the
// bolt and the cylinder stayed welded to it. All three call sites are guarded (`if(M&&M.mag)`), which is why nothing
// ever threw and the gap was invisible from the outside.
//
// A screenshot cannot answer this: the part is inside its own gun for most of the stroke. What can is the part's own
// local position sampled across the reload — it either travels or it does not.
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
    const p=await (await b.newContext({viewport:{width:960,height:540}})).newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,140)));
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await p.evaluate("__hc.lock(true); __hc.pinScene(); __hc.freeze(true,false); __hc.setTime(0.27)");
    await sleep(1200);
    for(const id of ['ar15','ak','bullpup']){
      const r=await p.evaluate(g=>__hc.reloadParts?__hc.reloadParts(g):{err:'no probe'}, id);
      console.log(id, JSON.stringify(r));
      T(id+': the gun has a carved magazine', r.mag===true, r);
      T(id+': the magazine travels during the reload', r.magTravel>0.02, {travel:r.magTravel});
      T(id+': it comes back to where it started', r.magReturn<0.005, {off:r.magReturn});
    }
    // AND THE REVOLVER'S DRUM. Its cylinder numbers were measured for the loaded chambers already, so the carve is
    // those same bounds — the reload swings it out on the crane rather than sliding the whole gun sideways.
    const rev=await p.evaluate("__hc.reloadParts('revolver')");
    console.log('revolver', JSON.stringify(rev));
    T('the revolver has a carved cylinder', rev.cyl===true, rev);
    T('the cylinder swings out during the reload', rev.cylTravel>0.02, {travel:rev.cylTravel});

    // AND THE BOLT. guns/sniper-rifle has no bolt handle modelled at all (tools/models/bolt-handle.mjs finds one
    // lateral bulge on the whole rifle and it is the cheek rest), so one is built for it the way the irons are.
    const blt=await p.evaluate("__hc.reloadParts('hunting_rifle')");
    console.log('bolt', JSON.stringify(blt));
    T('the bolt rifle has a bolt handle', blt.bolt===true, blt);
    T('the bolt works during the reload', blt.boltTravel>0.05, {travel:blt.boltTravel});

    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)':'ALL PASS');
    await b.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(String(e.message).slice(0,300)); process.exit(1); });
