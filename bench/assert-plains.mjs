// #69 — FLAT PLAINS BIOME WITH RIVERS THROUGH IT.
//
// The brief puts this item's real risk in triple asterisks: IT CAN MOVE LAND. About twenty structures site off surfaceH —
// the cathedral wants the highest flattish dry ground, the village wants a real mountain, the silo wants flat ground — and
// a mask that flattens a region can steal any of them or shift a coastline. So half of this harness is about what must
// NOT have changed, measured with the dial on and off on one page (PLAINS_K=0 is the identity), rather than argued from
// the arithmetic. The other half is that the biome exists at all and reads as flat.
//
//   1 the mask exists, varies across the world, and is not everywhere
//   2 plains are FLATTER than the rest of the island — mean neighbour step, plainest patches against roughest
//   3 it is mutually exclusive with mountains: no flat mountain, and the peaks are still there
//   4 THE COASTLINE DOES NOT MOVE: 24 bearings, dial on and off, exactly equal
//   5 no dry land became water and no water became land, over a wide sample
//   6 rivers still run through it — the thing the biome exists for
//   7 the structures that site off surfaceH still find their ground
// usage: node bench/assert-plains.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let pass=0, fail=0;
const chk=(c,n,d)=>{ if(c){pass++;console.log('  PASS  '+n+(d?'   '+d:''));} else {fail++;console.log('  FAIL  '+n+(d?'   '+d:''));} };

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    const ctx=await browser.newContext({ viewport:{width:1280,height:720} }); const page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', null, {timeout:180000});
    await sleep(2000);

    console.log('\n--- 1  the mask exists and is a REGION, not the world ---');
    const cen = await page.evaluate('__hc.plainsCensus(11,88)');
    console.log('  plainest ' + JSON.stringify(cen.plainest));
    console.log('  least    ' + JSON.stringify(cen.least));
    const dial = await page.evaluate('__hc.plains()');
    chk(dial.k===1, 'the dial ships on', JSON.stringify(dial));
    chk(cen.n>20, 'the census found dry ground to sample', cen.n+' dry columns');
    chk(cen.plainest[0].pl>0.6, 'somewhere is strongly plains', 'strongest '+cen.plainest[0].pl);
    chk(cen.least[0].pl<0.15, 'and somewhere is not plains at all', 'weakest '+cen.least[0].pl);

    console.log('\n--- 2  plains are flatter than the rest ---');
    const meanOf = a => a.reduce((s,o)=>s+o.relief,0)/a.length;
    const flatM = meanOf(cen.plainest), roughM = meanOf(cen.least);
    chk(flatM < roughM*0.7, 'the plains patches are flatter than the roughest ones',
      'mean neighbour step '+flatM.toFixed(3)+' in plains against '+roughM.toFixed(3)+' outside');
    // …and the same ground, with the mask off, is rougher. This is the one that says the mask CAUSED the flatness rather
    // than the census having found a flat place and the mask having agreed with it.
    const spot = cen.plainest[0];
    const rOn = await page.evaluate(`__hc.relief(${spot.x},${spot.z},24)`);
    await page.evaluate('__hc.plains(0)');
    const rOff = await page.evaluate(`__hc.relief(${spot.x},${spot.z},24)`);
    await page.evaluate('__hc.plains(1)');
    console.log('  same patch  on ' + JSON.stringify(rOn) + '  off ' + JSON.stringify(rOff));
    chk(rOn.meanStep < rOff.meanStep*0.75, 'and turning the mask off makes THAT patch rougher again',
      'step '+rOn.meanStep+' on against '+rOff.meanStep+' off');
    chk(rOn.span < rOff.span, 'with less height spread across it', 'span '+rOn.span+' against '+rOff.span);

    console.log('\n--- 3  no flat mountain, and the mountains are still mountains ---');
    // From the HISTOGRAM, which scans every dry sample, not from the census's top-and-bottom five: the first version of
    // this check read the highest of ten hand-picked patches and called 48 blocks "the high ground".
    const hist = await page.evaluate('__hc.plainsHist(24,64)');
    console.log('  hist ' + JSON.stringify(hist));
    chk(hist.highest>70, 'high ground still exists somewhere', 'highest dry column '+hist.highest);
    chk(hist.highestPl<0.5, 'and the highest ground is not a plain', 'its mask strength '+hist.highestPl);
    chk(hist.frac>0.08 && hist.frac<0.6, 'the biome is a region, not the island and not a rounding error',
      (hist.frac*100).toFixed(1)+'% of dry columns are half plains or more');

    console.log('\n--- 4  THE COASTLINE DOES NOT MOVE — 24 bearings, dial on and off ---');
    const read = async k => { await page.evaluate('__hc.plains('+k+')'); return page.evaluate('__hc.shoreProfile(24,4)'); };
    const on = await read(1), off = await read(0), on2 = await read(1);
    const coasts = p => p.perBearing.map(o=>o.coast);
    const cOn=coasts(on), cOff=coasts(off), cOn2=coasts(on2);
    console.log('  coast on  ' + JSON.stringify(cOn));
    console.log('  coast off ' + JSON.stringify(cOff));
    chk(cOn.length===24 && cOn.every(c=>c!=null), '24 bearings of coast were found', cOn.length+' bearings');
    const moved = cOn.map((c,i)=>c===cOff[i]?null:[i,c,cOff[i]]).filter(Boolean);
    chk(moved.length===0, 'every bearing has the same coast radius with the mask on and off',
      moved.length?('MOVED: '+JSON.stringify(moved)):'24/24 identical');
    chk(JSON.stringify(cOn)===JSON.stringify(cOn2), 'and the reading repeats after the dial goes back', 'no cache staleness');
    const shOn=on.shallow, shOff=off.shallow;
    chk(shOn && shOff && shOn.median===shOff.median, 'the shallow shelf band is untouched too',
      'median shallow '+(shOn&&shOn.median)+' against '+(shOff&&shOff.median));

    console.log('\n--- 5  no land became water and no water became land ---');
    const wet = await page.evaluate(`(()=>{ const N=46, ST=44, pts=[];
      for(let i=0;i<N;i++)for(let j=0;j<N;j++){ const x=Math.round(500-(N-1)/2*ST+i*ST), z=Math.round(0-(N-1)/2*ST+j*ST); pts.push([x,z]); }
      const f=()=>pts.map(p=>__hc.wet(p[0],p[1]));
      __hc.plains(1); const a=f(); __hc.plains(0); const b=f(); __hc.plains(1);
      let flipped=0, first=null, dh=0, worst=0, at=null, changed=0, dry=0;
      for(let i=0;i<a.length;i++){ if(a[i].w!==b[i].w){ flipped++; if(!first) first=[pts[i],a[i],b[i]]; }
        if(!a[i].w) dry++;
        const d=Math.abs(a[i].h-b[i].h); dh+=d; if(d>0) changed++; if(d>worst){ worst=d; at=pts[i]; } }
      return { n:a.length, dry, flipped, first, changed, meanChange:+(dh/a.length).toFixed(2), worst, at }; })()`);
    console.log('  wet/dry ' + JSON.stringify(wet));
    chk(wet.flipped===0, 'not one column crossed the waterline', wet.flipped+' of '+wet.n+(wet.first?('  first '+JSON.stringify(wet.first)):''));
    // A mean over the whole sample is the wrong number for this — most of it is SEA and most of the land is not plains,
    // so the mean read 0.01 while single columns moved 8 blocks. The fraction of DRY columns touched is the honest one.
    chk(wet.changed/(wet.dry||1) > 0.06 && wet.worst >= 3, 'while the mask is genuinely reshaping the inland ground',
      wet.changed+' of '+wet.dry+' dry columns changed, worst '+wet.worst+' blocks at '+JSON.stringify(wet.at));

    console.log('\n--- 6  rivers still run through the plains ---');
    const riv = await page.evaluate(`(()=>{ const c=__hc.plainsCensus(11,88), o=c.plainest[0]; return __hc.riverNear(o.x,o.z,140); })()`);
    console.log('  river near the plainest patch ' + JSON.stringify(riv));
    chk(riv && riv.found, 'a river channel exists inside a plains region', JSON.stringify(riv));
    chk(riv && riv.flow>0.05, 'and it carries #74\'s current', 'flow '+(riv?riv.flow:'-'));

    console.log('\n--- frames for judging ---');
    // The plain from head height with its river in shot, and again from above so the biome's extent reads. Daylight,
    // because a flat horizon at night is a black rectangle.
    await page.evaluate('__hc.setTime(0.32)');
    const spotR = await page.evaluate(`__hc.riverNear(${cen.plainest[0].x},${cen.plainest[0].z},140)`);
    if(spotR.found){
      await page.evaluate(`__hc.tpAt(${spotR.x+14}, ${spotR.h+3}, ${spotR.z+14})`);
      await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()', null, {timeout:90000}).catch(()=>{});
      await sleep(3500);
      await page.evaluate(`__hc.look(${spotR.x}, ${spotR.h}, ${spotR.z})`); await sleep(1500);
      fs.writeFileSync(path.join(ROOT,'bench','results','plains-river.png'), await page.screenshot());
      await page.evaluate(`__hc.tpAt(${spotR.x}, ${spotR.h+42}, ${spotR.z+60})`); await sleep(3000);
      await page.evaluate(`__hc.look(${spotR.x}, ${spotR.h}, ${spotR.z})`); await sleep(1500);
      fs.writeFileSync(path.join(ROOT,'bench','results','plains-above.png'), await page.screenshot());
      chk(true, 'wrote plains-river.png and plains-above.png for judging', 'at '+spotR.x+','+spotR.z);
    } else chk(false, 'found a river to frame the plain against');

    // Structure siting is NOT asserted here on purpose: the cathedral, the cabin, the village and the silo each have
    // their own harness that knows what "the highest flattish dry ground" or "a real mountain" means for it, and
    // re-deriving any of that from this file would be a second, weaker copy of a check that already exists. They are run
    // separately after this — that is a step in the item, not an omission from the harness.

    console.log('\n'+pass+'/'+(pass+fail)+' passed');
    await browser.close();
    process.exit(fail?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
