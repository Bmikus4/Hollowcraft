// WATER ON THE SHORE, AND THE COAST STAYING PUT. Ben: "shoreline looks good, but water on shore needs expanded".
//
// "Shoreline looks good" is the constraint, not the aside. The shoreline, the curved near-shore water, the ring fade and the ocean
// annulus are all accepted work, so whatever widens the shallow water is not allowed to move the coast by a single block. CFG.SEA
// would have been the obvious dial and is the wrong one: it moves every coast in the world and everything ever placed by surfaceH
// with it -- the chapel picks the most distant dry beach, the dock and lighthouse sit at fixed offsets, the snail spawner wants
// sand. The shelf instead compresses submarine DEPTH only.
//
// That the coast cannot move is provable from the arithmetic (the branch needs elev already under the sea, and at depth 0 the
// factor multiplies 0) -- but an argument is not a measurement. __hc.shelf sets SHELF_K live and clears the height cache, so the
// coast radius on 24 bearings is read at the shipped 0.35 and again at the identity 1.0 and required to be IDENTICAL, while the
// shallow band is required to differ. One dial, two readings, both claims tested at once.
//
// usage: node bench/assert-shore-shelf.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/code/Minecraft';
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

let checks=0, fails=0;
const ok=(n,c,d)=>{ checks++; if(!c){fails++; console.log('  FAIL  '+n+'   '+JSON.stringify(d)); } else console.log('  ok    '+n+'   '+JSON.stringify(d)); };

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:800,height:520}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=4',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(4000);

    const read=async(k)=>{ await page.evaluate('__hc.shelf('+k+',14)');
      const p=await page.evaluate('__hc.shoreProfile(24,2)');            // 2 = wadeable; that is the band Ben is looking at
      return p; };

    const on  = await read(0.35);    // as shipped
    const off = await read(1.0);     // identity: no compression at all — the world before this change
    const on2 = await read(0.35);    // and back, so a one-way cache effect cannot masquerade as the result
    console.log('  shelf 0.35 : shallow  min '+on.shallow.min+'  median '+on.shallow.median+'  mean '+on.shallow.mean+'  max '+on.shallow.max);
    console.log('  shelf 1.00 : shallow  min '+off.shallow.min+'  median '+off.shallow.median+'  mean '+off.shallow.mean+'  max '+off.shallow.max);
    console.log('  shelf 0.35 : shallow  min '+on2.shallow.min+'  median '+on2.shallow.median+'  mean '+on2.shallow.mean+'  max '+on2.shallow.max+'   (repeat)');

    ok('24 bearings of coast were found', on.perBearing.length===24 && on.perBearing.every(o=>o.coast!=null), on.perBearing.length);

    // THE INVARIANT. Coast radius, every bearing, both settings, exactly equal.
    const cOn=on.perBearing.map(o=>o.coast), cOff=off.perBearing.map(o=>o.coast);
    const moved=cOn.map((v,i)=>v===cOff[i]?null:{bearing:on.perBearing[i].bearing, at035:v, at1:cOff[i]}).filter(Boolean);
    ok('the shelf moves the coastline on NO bearing', moved.length===0, moved.slice(0,4));
    // …and the dry beach behind it is untouched too, since those are all land columns.
    const bOn=on.perBearing.map(o=>o.beachToGrass), bOff=off.perBearing.map(o=>o.beachToGrass);
    ok('and the dry beach width is unchanged', bOn.every((v,i)=>v===bOff[i]),
      bOn.map((v,i)=>v===bOff[i]?null:[on.perBearing[i].bearing,v,bOff[i]]).filter(Boolean).slice(0,4));

    // THE POINT. Wadeable water, wider.
    ok('the wadeable band is wider than it was', on.shallow.median > off.shallow.median,
      {median:on.shallow.median, was:off.shallow.median});
    ok('and substantially so, not by a block', on.shallow.median >= off.shallow.median*1.5,
      {median:on.shallow.median, was:off.shallow.median, ratio:+(on.shallow.median/off.shallow.median).toFixed(2)});
    ok('the mean moved with it, so it is not one lucky bearing', on.shallow.mean > off.shallow.mean*1.4,
      {mean:on.shallow.mean, was:off.shallow.mean});
    // A/B/A on the dial itself: if the repeat disagrees, the height cache is serving stale columns and neither reading is real.
    ok('the dial is reversible and the reading repeats', on2.shallow.median===on.shallow.median && on2.shallow.mean===on.shallow.mean,
      {first:on.shallow.median, again:on2.shallow.median});
    // The steepest coast must still exist: if every bearing came out wide, the shelf has flattened the island's character away.
    ok('steep coast survives somewhere', on.shallow.min < on.shallow.median, {min:on.shallow.min, median:on.shallow.median});

    ok('no page errors', errs.length===0, errs.slice(0,3));
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
