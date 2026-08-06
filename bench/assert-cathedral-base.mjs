// THE CATHEDRAL'S BASE IS FOUR BLOCKS ON A FLAT SHORE (Ben 08-05: "the cathedrals base is wayy too massive, it should only be 4
// blocks tall (the base) vs the existing 20+. AFTER that change is made, bring it to ground level, and place it on a custom designed
// flat shore that fits it perfectly" / "do not generate trees on the base of the cathedral, make sure this rule stands. BUT do
// surround the base itself with trees").
// The plinth has been capped at four since 07-24; the 20+ was a staircase 24 rings out whose every step was filled with cobble "down
// to the terrain / seabed", and on a coastal promontory that is twenty to thirty blocks of masonry. Every number here is scanned off
// the BUILT world — surfaceH is the original heightfield and knows nothing about what the builder cut or filled.
//   node bench/assert-cathedral-base.mjs
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
    await page.mouse.click(450,300); await sleep(1200);
    await page.evaluate(`__hc.rd(12)`);
    console.log('    diag', JSON.stringify(await page.evaluate(`__hc.cathedralDiag()`)));
    // Fly there and let it stream — the builder needs _sReady over its own site, and the scan below needs the surrounding wood loaded.
    await page.evaluate(`__hc.goCathedral(0,40,0)`); await sleep(6000);
    let d=await page.evaluate(`__hc.cathedralDiag()`);
    if(!d.done){ console.log('    forced', JSON.stringify(await page.evaluate(`__hc.forceCathedral()`))); await sleep(3000); }
    // The scan reaches ~110 blocks out, so orbit the site to stream that in before measuring.
    for(const [dx,dz] of [[-90,0],[90,0],[0,-90],[0,90],[0,0]]){ await page.evaluate(`__hc.goCathedral(${dx},40,${dz})`); await sleep(3500); }
    const r=await page.evaluate(`__hc.cathedralBase()`);
    console.log('    base', JSON.stringify(r));
    ok('the cathedral is built', r && r.done===true && r.padTop!=null, {done:r&&r.done, padTop:r&&r.padTop});
    // FOUR BLOCKS TALL. Measured as HEIGHT ABOVE THE ORIGINAL GROUND, not as a masonry column: this promontory is stone under its
    // topsoil, so counting masonry downward from the apron reads 43 and is describing the mountain, not the base. Five is the
    // allowance — four courses of plinth plus the top course itself where the ground under it was already a block low.
    ok('the base stands four blocks over the ground, not twenty', r.baseLiftLand!=null && r.baseLiftLand<=5,
       {baseLiftLand:r.baseLiftLand, cliffFooting:r.baseLift, footingAt:r.liftAt, wasAbout:24});
    // NOTHING FLOATS. The plinth is clamped to four courses, so on a promontory that falls to the sea the floor was a single course of
    // cobble over open air — 302 of 1325 columns had nothing under them within four blocks, and you could look under the church and
    // into it. What is left is caves: a natural void below the footing reads the same to a block scan.
    ok('the floor has ground under it', r.hangFloor<=60, {hangFloor:r.hangFloor, wasAbout:302, floatApron:r.floatApron});
    // ON THE GROUND: the pad's top course sits one block over the site's own ground level, not over the highest point for 60 blocks.
    ok('…and it sits on the ground at its own centre', Math.abs(r.padTop-(r.gy0+1))<=1, {padTop:r.padTop, groundAtCentre:r.gy0});
    // COBBLESTONE, NOT GRASS (Ben 08-05: "the cathedrals base needs to be cobblestone not grass"). The old base was a paved pad with
    // a ten-block dead-flat GRASS shore laid over its skirt, and from the ground a mown terrace and a paved one both read as base.
    ok('the base is cobble, with no grass on it', r.grassOnApron===0 && r.apronCobble>200, {grassOnApron:r.grassOnApron, apronCobble:r.apronCobble});
    // …AND SMALLER, FITTING CLOSER (same ask). The apron is every column within CATH_PAD of the CRUCIFORM outline rather than of its
    // bounding box, so the cross's four empty corners are ground again.
    // THE LINE MOVED OUT TO THE FEATHER'S EDGE, on Ben's own later instruction (08-05: "replace the cathedrals foundation with
    // cobblestone (its grass rn)"). This asserted wideMasonry===0 — no masonry within three rings past the apron — which is now the
    // paving he asked for, so it counts 260 by design. What must still be zero is masonry OUTSIDE the feather altogether: that is the
    // base sprawling into untouched land, which is what "wayy too massive" meant and is still the fault.
    ok('…and no masonry reaches past the foundation', r.beyondMasonry===0, {beyondMasonry:r.beyondMasonry, where:r.beyondSample, paved:r.wideMasonry, pad:r.pad, feather:r.feather});
    // NO TREES ON THE BASE, TREES AROUND IT.
    ok('nothing grows on the base', r.treesOnPad===0, {treesOnPad:r.treesOnPad});
    ok('…and the wood still surrounds it', r.treeColumnsAround>40, {treeColumnsAround:r.treeColumnsAround});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
