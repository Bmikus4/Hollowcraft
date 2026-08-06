// BEN'S THREE CATHEDRAL COMPLAINTS, 08-05: a paved foundation, candles on the floor, columns that reach the ceiling.
//
//   "replace the cathedrals foundation with cobblestone (its grass rn)"
//   "in the cathedral there are floating torches, replace all torches there with candles, and make sure they are on the ground"
//   "make sure the pillars inside the cathedral reach the roof"
//
// All three read out of the WORLD after the builder has run, so what is measured is what got built. The apron over the pad has been
// cobble since 3699fcd; the grass was the FEATHER — the ring of steps that carries the apron back down to the promontory — which
// assert-cathedral-base never looked at because it only scans dd <= CATH_PAD.
//
//   node bench/assert-cathedral-fixes.mjs
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
    // Same approach as assert-cathedral-base: the builder needs _sReady over its own site, and the feather scan reaches past the pad,
    // so the site is orbited to stream it in before anything is measured.
    await page.evaluate(`__hc.goCathedral(0,40,0)`); await sleep(6000);
    let d=await page.evaluate(`__hc.cathedralDiag()`);
    if(!d.done){ console.log('    forced', JSON.stringify(await page.evaluate(`__hc.forceCathedral()`))); await sleep(3000); }
    for(const [dx,dz] of [[-90,0],[90,0],[0,-90],[0,90],[0,0]]){ await page.evaluate(`__hc.goCathedral(${dx},40,${dz})`); await sleep(3500); }
    const r=await page.evaluate(`__hc.cathFixes()`);
    if(r.err||r.no){ console.log('  probe failed', JSON.stringify(r)); process.exit(1); }
    console.log('    feather', JSON.stringify({grass:r.featherGrass, cobble:r.featherCobble, sand:r.featherSand, other:r.featherOther}));
    console.log('    lights ', JSON.stringify({torches:r.torches, candles:r.candles, floating:r.floating, where:r.floatAt}));
    console.log('    pillars', JSON.stringify(r.pillars));

    // ---- 1. THE FOUNDATION IS PAVED ----
    ok('the feather ring exists to measure', r.featherCobble+r.featherGrass+r.featherSand > 200, {cobble:r.featherCobble, grass:r.featherGrass, sand:r.featherSand});
    ok('no grass is left on the foundation', r.featherGrass===0, {grass:r.featherGrass});
    ok('the foundation is cobblestone', r.featherCobble > r.featherSand, {cobble:r.featherCobble, sand:r.featherSand});

    // ---- 2. CANDLES, ON THE GROUND ----
    ok('there are no torches left in the church', r.torches===0, {torches:r.torches});
    ok('the church is lit by candles', r.candles>=20, {candles:r.candles});
    ok('every light stands on a solid block', r.floating===0, {floating:r.floating, where:r.floatAt});

    // ---- 3. THE COLUMNS REACH ----
    ok('all fourteen columns are found', r.pillars.length===14, {found:r.pillars.length});
    // UNBROKEN FROM THE FLOOR TO ITS OWN LAST COURSE is what "reaches the roof" means. They used to stop at 19 under a ceiling laid at
    // 26 — seven blocks of air — so this is the number that moved. Not the gap to "the first thing overhead": above the ceiling slab
    // there are four blocks of designed roof void in every bay, which has nothing to do with the pillars.
    ok('every column is unbroken up to the ceiling course', r.pillars.every(p=>p.solidTo>=r.WHt-1), r.pillars.map(p=>p.solidTo));
    ok('none of them stops at the old 19', r.pillars.every(p=>p.solidTo>19), r.pillars.map(p=>p.solidTo));
    // The two pairs at the crossing stand in the drum, which the ceiling pass deliberately leaves open for the dome — expected there
    // and nowhere else.
    ok('at most four columns open into the dome', r.openTop<=4, {openTop:r.openTop});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
