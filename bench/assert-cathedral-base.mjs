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
    // FOUR BLOCKS. The measurement is on the skirt, outside the walls, so it is the plinth and not the building on it. Six is the
    // allowance: four courses of plinth plus the block the pad's own top course sits on where the ground was already low.
    ok('the base is four blocks of masonry, not twenty', r.baseDepth>0 && r.baseDepth<=6, {baseDepth:r.baseDepth, wasAbout:24});
    // ON THE GROUND: the pad's top course sits one block over the site's own ground level, not over the highest point for 60 blocks.
    ok('…and it sits on the ground at its own centre', Math.abs(r.padTop-(r.gy0+1))<=1, {padTop:r.padTop, groundAtCentre:r.gy0});
    // A FLAT SHORE: every column in the shore band tops out at the same height. One height in the histogram is flat; the old
    // staircase would show one per ring.
    const heights=Object.keys(r.shoreHeights||{}).map(Number).sort((a,b)=>a-b);
    const dominant=heights.length?heights.reduce((a,h)=>r.shoreHeights[h]>r.shoreHeights[a]?h:a,heights[0]):null;
    const flatFrac=heights.length?r.shoreHeights[dominant]/r.shoreN:0;
    console.log('    shore heights', JSON.stringify(r.shoreHeights), 'dominant', dominant, 'frac', +flatFrac.toFixed(3));
    ok('the shore around it is flat', flatFrac>0.9, {dominant, flatFrac:+flatFrac.toFixed(3), n:r.shoreN});
    ok('…and it is at the church\'s own ground level', dominant!=null && Math.abs(dominant-r.gy0)<=1, {dominant, gy0:r.gy0});
    // NO TREES ON THE BASE, TREES AROUND IT.
    ok('nothing grows on the base', r.treesOnPad===0, {treesOnPad:r.treesOnPad});
    ok('…and the wood still surrounds it', r.treeColumnsAround>40, {treeColumnsAround:r.treeColumnsAround});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
