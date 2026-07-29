// P2 REGRESSION GATE. Merging a door leaf's children into one mesh is only correct if the door still swings,
// the leaf is still where it was, and the geometry is unchanged. The comment in brMergeStatic records exactly
// this bug happening before ("174 hinges with nothing left to swing"), so it gets a test, not a look.
//
// The test runs the SAME door twice in one page: once with PERF.brMergeRigid off (baseline), once on, and
// compares world-space bounding boxes of each pivot at several swing angles. Same box => same door.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };

const PROBE = a => `window.__hcPERF.doorProbe(${a})`;

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?perf=1&debug=1&t=210&brseed=20260728',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:180000});
    await page.evaluate(`window.__hcPERF.arm()`);

    // ---- A side: flag OFF, rebuild the environment so nothing is merged -------------------------------
    await page.evaluate(`window.__hcPERF.set('brMergeRigid', false)`);
    await page.evaluate(`window.__hcPERF.enterBR()`); await sleep(4000);
    console.log('  rebuild:', JSON.stringify(await page.evaluate(`window.__hcPERF.rebuildEnv()`))); await sleep(2500);
    const aClosed = await page.evaluate(PROBE(0));
    const aHalf   = await page.evaluate(PROBE(0.75));
    const aOpen   = await page.evaluate(PROBE(1.5));
    const aBreak  = await page.evaluate(`window.__hcPERF.brEnvBreakdown()`);

    // ---- B side: flag ON, same seed, same chunks ------------------------------------------------------
    await page.evaluate(`window.__hcPERF.set('brMergeRigid', true)`);
    console.log('  rebuild:', JSON.stringify(await page.evaluate(`window.__hcPERF.rebuildEnv()`))); await sleep(2500);
    const bClosed = await page.evaluate(PROBE(0));
    const bHalf   = await page.evaluate(PROBE(0.75));
    const bOpen   = await page.evaluate(PROBE(1.5));
    const bBreak  = await page.evaluate(`window.__hcPERF.brEnvBreakdown()`);

    console.log('baseline  meshes', aBreak.totalProtected, ' merged', aBreak.totalMerged, ' tris', aBreak.totalTris);
    console.log('brMergeRigid meshes', bBreak.totalProtected, ' merged', bBreak.totalMerged, ' tris', bBreak.totalTris);

    T('some doors exist to test', aClosed.boxes.length > 0, {pivots:aClosed.boxes.length});
    T('same pivot count either way', aClosed.boxes.length === bClosed.boxes.length,
      {a:aClosed.boxes.length, b:bClosed.boxes.length});
    T('triangle count is preserved (merging must not lose geometry)', aClosed.tris === bClosed.tris,
      {a:aClosed.tris, b:bClosed.tris});
    T('mesh count actually fell', bClosed.meshes < aClosed.meshes,
      {before:aClosed.meshes, after:bClosed.meshes, ratio:+(aClosed.meshes/Math.max(1,bClosed.meshes)).toFixed(2)});

    // Geometry must land in the same place at every angle, to within float slop. Both the vertex-exact AABB
    // and the vertex centroid are compared: the AABB catches a piece in the wrong place, the centroid catches
    // a piece that moved but happened to stay inside the same box.
    const EPS = 0.002;
    for(const [name,A,B] of [['closed',aClosed,bClosed],['half-open',aHalf,bHalf],['fully open',aOpen,bOpen]]){
      let worstB=0, worstS=0, bad=0, triMismatch=0;
      for(let i=0;i<Math.min(A.boxes.length,B.boxes.length);i++){
        const x=A.boxes[i], y=B.boxes[i];
        if(!x || !y){ if(x!==y) bad++; continue; }
        if(x.t !== y.t){ triMismatch++; bad++; }
        for(let k=0;k<6;k++){ const d=Math.abs(x.b[k]-y.b[k]); if(d>worstB) worstB=d; if(d>EPS) bad++; }
        // checksum tolerance scales with the magnitude of the sum — these are world coords near x=100000
        for(let k=0;k<4;k++){ const d=Math.abs(x.s[k]-y.s[k]) / Math.max(1,Math.abs(x.s[k]));
          if(d>worstS) worstS=d; if(d>1e-6) bad++; }
      }
      T('door leaves are in the same place, '+name, bad===0,
        {worstBoxDeltaMetres:+worstB.toFixed(5), worstChecksumRelDelta:worstS.toExponential(2),
         triangleCountMismatches:triMismatch, offending:bad});
    }

    // and the swing itself must still move them
    let moved=0;
    for(let i=0;i<bClosed.boxes.length;i++){
      const c=bClosed.boxes[i], o=bOpen.boxes[i]; if(!c||!o) continue;
      let d=0; for(let k=0;k<6;k++) d=Math.max(d, Math.abs(c.b[k]-o.b[k]));
      if(d>0.1) moved++;
    }
    T('doors still actually swing when opened', moved > 0, {pivotsThatMoved:moved, of:bClosed.boxes.length});

    await browser.close(); browser=null;
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(fails? ('\n'+fails+' FAILED') : '\nALL PASS');
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
