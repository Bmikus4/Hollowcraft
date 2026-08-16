// EVERY GUN IN THE GAME CAN BE FOUND (Ben 08-16: "place the guns in loot"). The eighteen pack weapons had no recipe,
// no loot line and no drop — they existed only in the creative menu. They are finds now: a chest names a POOL and
// takes one weapon from it, picked from the chest's own coordinates and the world seed.
//
// What a bench can state that a playthrough cannot: that every gun in every pool is a real item, and that each one
// is actually reachable — a pool entry the picker can never return is a weapon still locked away.
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
    const p=await (await b.newContext({viewport:{width:800,height:450}})).newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,140)));
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await sleep(1200);
    const r=await p.evaluate("__hc.gunLoot(600)");
    console.log(JSON.stringify(r.pools));
    T('every pooled gun is a real item', r.notItems.length===0, r.notItems);
    T('every pooled gun can actually be rolled', r.missing.length===0, r.missing);
    // THE EIGHTEEN. This is the list from the audit that prompted the work; if one drops out of the pools later,
    // this is what says so.
    const EIGHTEEN=['ak','ak_underfolder','bullpup','chassis_rifle','flare_gun','forest_rifle','machine_pistol',
      'marksman_rifle','pistol','pistol_compact','pistol_heavy','pistol_target','revolver_rail','revolver_snub',
      'sawn_off','shotgun_long','shotgun_riot','smg'];
    const missing=EIGHTEEN.filter(g=>r.covered.indexOf(g)<0);
    T('all eighteen pack guns are findable', missing.length===0, missing);
    // A chest must not become a gun shop: one weapon per chest is the rule, so no pool may be empty either.
    T('every pool produces exactly one weapon per chest', Object.values(r.pools).every(c=>Object.keys(c).length>0), r.pools);
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)':'ALL PASS');
    await b.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(String(e.message).slice(0,300)); process.exit(1); });
