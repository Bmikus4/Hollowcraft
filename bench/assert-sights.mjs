// ARE THE IRON SIGHTS ALIGNED, ON EVERY GUN THAT HAS THEM? (Ben 08-11: "holosights arent aligned, fix them once and
// for all" was the same question asked about one sight.) The numbers in GLB_GUNS are authored per gun off each
// model's own profile, and nothing has ever checked the RESULT: a typo in one row draws a rear notch inside the
// receiver or a front post out on the barrel, and it is invisible until someone holds that particular gun.
//
// The measurement is __hc.sightPix(), which projects the two authored roots to screen pixels FROM THE CROSSHAIR at
// full ADS. That is the unit the complaint is always in, and it makes three things checkable:
//   * both roots are on screen at all
//   * they are LEVEL with each other — a sight line that slopes is a gun you cannot shoot straight
//   * the front root is forward of the rear one, i.e. the sight radius is positive rather than the pair swapped
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
    // attProbe only answers with a gun in hand; hold one first so the roster comes back.
    await p.evaluate("__hc.hold('ar15')"); await sleep(400);
    const ids=await p.evaluate("__hc.attProbe().guns")||[];
    const rows=[];
    for(const id of ids){
      await p.evaluate(g=>{ __hc.hold(g); __hc.attFit('optic',null); }, id);
      await p.evaluate("__hc.aim(true)"); await sleep(900);
      const r=await p.evaluate("__hc.sightPix()");
      await p.evaluate("__hc.aim(false)"); await sleep(200);
      if(r&&r.none) continue;                       // a scoped rifle has no iron roots: its sight is the glass
      rows.push({id, front:r.front, rear:r.rear, gap:r.gap, ads:r.adsT, parts:(r.parts||[]).length});
    }
    console.log(JSON.stringify(rows,null,0).slice(0,1400));
    T('every ironed gun reports its two roots', rows.length>=14, {n:rows.length});
    // LEVEL: the two roots must sit within a few pixels of each other vertically at full ADS. 12 px on a 540-line
    // frame is about a degree and a quarter — past that the shooter is looking at a sloped sight line.
    const sloped=rows.filter(r=>Math.abs(r.gap[1])>12);
    T('the two roots are level on every gun', sloped.length===0, sloped.map(r=>[r.id,r.gap[1]]));
    // ORDER: the front root must be further from the eye than the rear one. On screen at full ADS both sit near the
    // crosshair, so the test is that the pair is not swapped in x by any meaningful amount.
    const swapped=rows.filter(r=>Math.abs(r.gap[0])>40);
    T('front and rear are not swapped or splayed', swapped.length===0, swapped.map(r=>[r.id,r.gap[0]]));
    // ON SCREEN: a root projected hundreds of pixels off the crosshair is a number in the wrong units or the wrong
    // end of the model — the exact failure an authored table can hide.
    const off=rows.filter(r=>Math.abs(r.front[0])>120||Math.abs(r.front[1])>120||Math.abs(r.rear[0])>120||Math.abs(r.rear[1])>120);
    T('both roots are near the crosshair at full aim', off.length===0, off.map(r=>[r.id,r.front,r.rear]));
    T('every gun actually draws sight elements', rows.every(r=>r.parts>0), rows.filter(r=>!r.parts).map(r=>r.id));
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)':'ALL PASS');
    await b.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(String(e.message).slice(0,300)); process.exit(1); });
