// THE HALLS ARE VAST, AND STILL MIXED. Ben: "rooms should be more vast, but there should be a good mix of all".
//
// Both halves matter, and the second is what makes this an assertion rather than a dial. The allocator is already bimodal --
// about a third small rooms, the rest grown greedily up to a cap -- but the greed runs in scan order, so by the time it reaches
// the far side of the grid `free()` keeps failing and most rooms come out as 1-cell slivers. Measured before any change, over
// 136 rooms: min 1, p25 1, MEDIAN 2, p75 5, p90 12, max 25. A median of 2 cells is not a vast hall, it is a cupboard.
//
// So the checks are on the DISTRIBUTION, not on one room: the median and p75 must rise, and the small mode must survive -- if
// p25 climbs off 1 and the minimum stops being a single cell, the mix Ben asked for is gone and every room is a hall.
//
// usage: node bench/assert-br-vast.mjs
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
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('(()=>{ try{ return __hcBR.enter(); }catch(e){ return null; } })()');
    await sleep(8000);
    ok('the player is inside the Backrooms', (await page.evaluate('(()=>{ const s=__hcBR.state?__hcBR.state():null; return !!(s&&s.inside); })()'))===true);

    const C=await page.evaluate('__hcBR.roomCensus()');
    console.log('  census: '+JSON.stringify(C));
    const z=C.cells;
    // FEWER rooms is the point, not a warning sign: the same grid divided into bigger pieces holds fewer of them. It went
    // 136 -> 73 on the same seed, so this bound only exists to catch a generator that has stopped producing a maze at all.
    ok('a maze was generated', C.rooms>=55, C.rooms);
    // VASTER. Before / after, same seed: median 2/3, p75 5/12, p90 12/24, max 25/36.
    //   The MEDIAN is bounded loosely on purpose. A quarter of rooms are deliberately one cell (see the small mode below), so
    // the median sits near the bottom of the distribution whatever the halls do — pushing it to 4 would mean deleting the mix
    // Ben asked for. p75 and p90 are the statistics that say "vast", and they both more than doubled.
    ok('the median room grew', z.median>=3, {median:z.median, was:2});
    ok('the upper quartile is properly large', z.p75>=9, {p75:z.p75, was:5});
    ok('and the top decile is a genuine hall', z.p90>=18, {p90:z.p90, was:12});
    ok('the biggest halls got bigger still', z.max>=28, {max:z.max, was:25});
    // STILL MIXED. If these go, every room is a hall and the maze reads as one uniform space.
    ok('tight rooms survive — the minimum is still one cell', z.min===1, z.min);
    ok('and the small mode is still a quarter of the maze', z.p25<=2, {p25:z.p25});
    ok('every district still appears', Object.keys(C.byZone||{}).length>=3, C.byZone);
    ok('and the lit fraction is untouched', C.litPct>35 && C.litPct<62, C.litPct);   // Ben settled this at "half the rooms lit"

    ok('no page errors', errs.length===0, errs.slice(0,3));
    console.log('\n'+checks+' checks, '+fails+' failed');
    console.log('RESULT: '+(fails?'FAIL':'PASS'));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
