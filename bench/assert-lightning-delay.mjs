// THUNDER IS LATE BY THE DISTANCE TO THE STRIKE (Ben's item 11: "silent flash then massive thunder ... delay from strike distance").
//
// The delay was 0.8+Math.random()*3.6 — a number with no cause. A strike now has a position, and the clap arrives dist/343 seconds
// after the flash. This measures the ratio on strikes the SHIPPING roll produced (the probe arms the storm; updateWeather rolls),
// that the flash itself is silent, that a near clap really does arrive before a far one, and that a far clap is quieter.
//
// The audio half of item 11 — 2-3 samples cut into 6-8 variants — is NOT here: it needs sample files from Ben and it is another
// session's span. One 'thunder' sample is what plays, at the distance-scaled volume this bench reads.
//
//   node bench/assert-lightning-delay.mjs
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
    await page.mouse.click(450,300); await sleep(1500);
    await page.evaluate(`__hc.qaLocked(true)`);

    // ---- 20 ROLLED STRIKES: every delay must be its own distance over 343 ----
    const rolls=[];
    for(let i=0;i<20;i++){
      await page.evaluate(`__hc.strikeRoll()`);
      // The roll happens in updateWeather, so give the page frames rather than reading the same tick. Read as soon as a distance
      // appears; a strike whose delay is short enough to clap before we look would lose weather.sdist, hence the _qd fallback.
      let r=null;
      for(let k=0;k<40 && !(r&&r.dist!=null);k++){ r=await page.evaluate(`__hc.strikeRead()`); if(r.dist==null) await sleep(50); }
      if(r&&r.dist!=null) rolls.push(r);
    }
    const bad=rolls.filter(r=>Math.abs(r.delay - r.dist/343) > 0.02);
    console.log('    strikes', JSON.stringify(rolls.slice(0,6).map(r=>({d:r.dist,t:r.delay}))));
    ok('20 strikes rolled', rolls.length===20, {got:rolls.length});
    ok('every delay is its distance over 343 m/s', rolls.length>0 && bad.length===0, bad.slice(0,3));
    const ds=rolls.map(r=>r.dist);
    console.log('    distance range', Math.min(...ds).toFixed(0), '→', Math.max(...ds).toFixed(0));
    ok('the distances really vary (not one constant)', Math.max(...ds)-Math.min(...ds) > 300, {min:Math.min(...ds),max:Math.max(...ds)});
    ok('no strike is closer than 90 m or beyond 3 km', Math.min(...ds)>=89.9 && Math.max(...ds)<=3000.1, {min:Math.min(...ds),max:Math.max(...ds)});

    // ---- THE FLASH IS SILENT ----
    // Read at the moment the strike appears: the sky is at flash 1 and no clap has been counted yet. This is only meaningful for a
    // strike whose delay is long enough to still be pending, so it is checked on the LONGEST of the twenty.
    const longest = rolls.reduce((a,r)=>(a&&a.delay>r.delay)?a:r, null);
    ok('a distant strike flashes with no thunder yet', !!longest && longest.claps===0 && longest.flash>0.3, longest);

    // ---- ORDER AND VOLUME: a near clap lands first, and a far one is quieter ----
    // Rolled until the storm gives a near one and a far one; each is then waited out. Wall-clock is not the game's clock (a headless
    // page runs its loop far below 60 Hz) so the waits are generous and the assertion is ordering and gain, never a timing.
    async function rollUntil(pred, tries){
      for(let i=0;i<tries;i++){ await page.evaluate(`__hc.strikeRoll()`);
        let r=null; for(let k=0;k<40 && !(r&&r.dist!=null);k++){ r=await page.evaluate(`__hc.strikeRead()`); if(r.dist==null) await sleep(50); }
        if(r&&r.dist!=null&&pred(r)) return r; }
      return null; }
    const near = await rollUntil(r=>r.dist<400, 60);
    let nearClap=null;
    if(near){ for(let k=0;k<80;k++){ const r=await page.evaluate(`__hc.strikeRead()`); if(r.claps>0){ nearClap=r; break; } await sleep(200); } }
    console.log('    near', JSON.stringify(near), '→ clap', JSON.stringify(nearClap));
    ok('a near strike claps', !!nearClap, {near, nearClap});

    const far = await rollUntil(r=>r.dist>2200, 80);
    let farClap=null, farQuietAt=null;
    if(far){
      await sleep(1500); farQuietAt=await page.evaluate(`__hc.strikeRead()`);   // 1.5 s of wall clock is far less than the ~7 s this clap owes
      for(let k=0;k<200;k++){ const r=await page.evaluate(`__hc.strikeRead()`); if(r.claps>0){ farClap=r; break; } await sleep(250); } }
    console.log('    far', JSON.stringify(far), '→ still silent', JSON.stringify(farQuietAt), '→ clap', JSON.stringify(farClap));
    ok('a far strike is still silent seconds after its flash', !!farQuietAt && farQuietAt.claps===0, farQuietAt);
    ok('the far clap does eventually arrive', !!farClap, {far, farClap});
    ok('the far clap is quieter than the near one', !!(nearClap&&farClap) && farClap.clapVol < nearClap.clapVol*0.85,
       {near:nearClap&&nearClap.clapVol, far:farClap&&farClap.clapVol});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
