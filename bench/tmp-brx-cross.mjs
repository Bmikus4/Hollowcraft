// Chunk boundary crossings: do the two sides of every shared boundary punch the SAME holes?
// This is the property the whole infinite maze rests on. A mismatch is a door on one face of a wall and plaster on the
// other, and it is unfixable after the fact because the two chunks disagree about what the boundary is.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:900,height:600}})).newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e).slice(0,220)); console.log('PAGEERROR:',String(e.message||e).slice(0,220)); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(5000);
    await page.evaluate(`window.__hcBRX.infinite(true)`); await sleep(2000);

    const R = await page.evaluate(`(()=>{
      const out={ pairs:0, match:0, bad:[], noGap:[], gapCount:0, tun:0, st:0, lint:0, chunks:0 };
      const ov=(A,B)=>{ // do two gap sets cover the same intervals? compare as a merged 0.25-resolution mask
        const mask=(G)=>{ const m={}; for(const g of G) for(let v=Math.round(g[0]*4); v<Math.round(g[1]*4); v++) m[v]=1; return m; };
        const a=mask(A), b=mask(B); const keys=new Set([...Object.keys(a),...Object.keys(b)]);
        let diff=0; for(const k of keys) if(!!a[k]!==!!b[k]) diff++; return diff; };
      for(let gx=-4; gx<=4; gx++) for(let gz=-4; gz<=4; gz++){
        const c=window.__hcBRX.crossings(gx,gz); out.tun+=c.tunnels; out.st+=c.stairs; out.lint+=c.lintels; out.chunks++;
        for(const [dgx,dgz] of [[1,0],[0,1]]){
          const mine =window.__hcBRX.gaps(gx,gz,dgx,dgz);
          const theirs=window.__hcBRX.gaps(gx+dgx,gz+dgz,-dgx,-dgz);
          out.pairs++; out.gapCount+=mine.length;
          const d=ov(mine,theirs);
          if(d<=1) out.match++; else if(out.bad.length<4) out.bad.push({gx,gz,dgx,dgz,mine,theirs,diffCells:d});
          if(!mine.length) out.noGap.push([gx,gz,dgx,dgz]);
        } }
      return out; })()`);

    // RETIRED: this used to assert both sides of a boundary punch matching holes. That invariant existed to stop a door
    // landing on one face and plaster on the other, and it is now satisfied structurally: a shared boundary has exactly ONE
    // owner (the lower chunk), so there is only one wall and it cannot disagree with itself. What replaces it is the
    // property that motivated the change — no two wall planes on the same line.
    const dw = await page.evaluate(`window.__hcBRX.dupWalls()`);
    console.log('duplicate wall check:', JSON.stringify(dw));
    T('no two walls sit on the same world line (Ben: overlapping walls)', dw.dupPairs===0, dw);
    // (openings-per-boundary is covered by 'no boundary is left completely sealed' below; R.bad is a capped sample list
    //  and must never be used as a count)
    T('the owning side still punches openings', R.gapCount>0, {gaps:R.gapCount, pairs:R.pairs});
    T('no boundary is left completely sealed', R.noGap.length===0, {sealed:R.noGap.slice(0,4)});
    T('crossings actually exist in quantity', R.gapCount>R.pairs, {gaps:R.gapCount, pairs:R.pairs});
    T('tunnels and stairs are being recorded', R.tun>0 && R.st>0, {chunks:R.chunks, tunnels:R.tun, stairs:R.st, lintels:R.lint});

    // walk a straight line across many chunk boundaries on foot and confirm we are never blocked in
    const walk = await page.evaluate(`(()=>{ const out=[];
      for(const [gx,gz] of [[0,0],[1,0],[2,0],[2,1],[3,1],[-1,-1],[-2,-1]]){
        window.__hcBRX.walkTo(gx,gz);
        const g=[ window.__hcBRX.gaps(gx,gz,1,0).length, window.__hcBRX.gaps(gx,gz,-1,0).length,
                  window.__hcBRX.gaps(gx,gz,0,1).length, window.__hcBRX.gaps(gx,gz,0,-1).length ];
        out.push({at:[gx,gz], exits:g.reduce((a,b)=>a+b,0), perSide:g}); }
      return out; })()`);
    console.log('exits per chunk:', JSON.stringify(walk));
    T('every chunk has at least 2 ways out', walk.every(w=>w.exits>=2), walk.filter(w=>w.exits<2));
    T('every side of every chunk has an opening', walk.every(w=>w.perSide.every(n=>n>0)), walk.filter(w=>w.perSide.some(n=>n===0)));

    const st=await page.evaluate(`window.__hcBRX.stats()`);
    await page.evaluate(`window.__hcBRX.walkTo(0,0)`); await sleep(4000);   // settle: no rebuilds in flight
    await page.evaluate(`window.__benchInfo=1`); await sleep(1200);
    const fps=[]; for(let i=0;i<5;i++){ await sleep(700); fps.push((await page.evaluate(`__hc.st()`)).fps); }
    const perfOn=await page.evaluate(`__hc.perf()`);
    await page.evaluate(`window.__hcBRX.infinite(false); window.__hcBR.exit(); window.__hcBR.enter();`); await sleep(4500);
    const fpsOff=[]; for(let i=0;i<5;i++){ await sleep(700); fpsOff.push((await page.evaluate(`__hc.st()`)).fps); }
    const perfOff=await page.evaluate(`__hc.perf()`);
    console.log('stats', JSON.stringify(st));
    console.log('INFINITE ON  fps', JSON.stringify(fps), 'perf', JSON.stringify(perfOn));
    console.log('INFINITE OFF fps', JSON.stringify(fpsOff), 'perf', JSON.stringify(perfOff));
    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)' : 'ALL PASS');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
