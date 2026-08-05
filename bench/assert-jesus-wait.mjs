// JESUS WAITS 20 SECONDS BEFORE HE LEAVES (Ben 08-05: "jesus should wait 20s before taking off in the beginning of the game").
//
// He is spawned at the shore with _introT, mills about, then commits to a heading over open water and walks out until the render edge
// culls him. Ten seconds was long enough to notice him and not long enough to walk over and look at him.
//
// Measured on the CLOCK, not on the constant: __hc.fauna reports every animal with intro/leaving flags, so this samples until `leaving`
// flips and reports the elapsed seconds. Nothing about the departure itself is changed, so the only claim is the wait.
//
//   node bench/assert-jesus-wait.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
let fails=0; const ok=(n,c,g)=>{ if(!c)fails++; console.log(`  ${c?'ok  ':'FAIL'}  ${n}   ${JSON.stringify(g)}`); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(450,300);
    // Wait for him to exist at all — he is spawned with the shore, which streams.
    let seen=false;
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fauna()`);
      if(Array.isArray(f) && f.some(a=>a.t==='jesus'&&a.intro)){ seen=true; break; } await sleep(500); }
    ok('the intro Jesus is at spawn', seen, {seen});
    if(!seen) throw new Error('no intro jesus');
    // MEASURED IN SIMULATED SECONDS. A headless page runs its frame loop far below 60 Hz, so his countdown — which is decremented by
    // the frame's dt — takes far longer in wall-clock: the first run of this measured 46 real seconds for a 20-second wait and failed an
    // assertion that was about the wrong clock. fauna reports introT, which is the number the game itself counts down.
    const first=(await page.evaluate(`__hc.fauna()`)).find(a=>a.t==='jesus'&&a.intro);
    console.log('    countdown on first sight', JSON.stringify(first));
    ok('his wait is twenty seconds, not ten', first && first.introT>14 && first.introT<=20.01, {introT:first&&first.introT});
    ok('...and he has not committed to leaving while it runs', first && first.leaving===false, {leaving:first&&first.leaving});
    let left=null, lastT=null;
    for(let i=0;i<90;i++){ const f=await page.evaluate(`__hc.fauna()`);
      const jj=(f||[]).find(a=>a.t==='jesus'&&a.intro);
      if(!jj){ left='gone'; break; }
      lastT=jj.introT;
      if(jj.leaving){ left=jj.introT; break; }
      await sleep(400); }
    console.log('    leaving at introT', JSON.stringify({left, lastT}));
    ok('he leaves when the countdown reaches zero', left==='gone' || (left!=null && left<=0.35), {left, lastT});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
