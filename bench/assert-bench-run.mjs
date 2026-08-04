// THREE STEEL WORKBENCHES IN A ROW STAND ON TWELVE LEGS.
//
// Spanning the top the full cell already made a row read as one continuous surface, but each block still built its own
// four legs, so a 1x3 run was a trestle. Ben: "should just have 4 legs, 2 spokes."
//
// The legs now belong to the ENDS of a run: open end carries two, a block with benches on both sides carries none, a
// lone bench keeps all four. The spokes are full-cell rails that meet the neighbour's, so the rail reads as one length.
//
// COUNTED ACROSS THE WHOLE RUN, never per block — the fault was never "this bench has the wrong legs", it was "three
// benches bring twelve", and a per-block count passes on the bug.
//
//   node bench/assert-bench-run.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0;
  const check=(name,ok,detail)=>{ checks++; if(!ok) fails++; console.log((ok?'  PASS  ':'  FAIL  ')+name+(detail!==undefined?('   '+detail):'')); };
  const run = async (page,x,y,z,n,axis) => {
    await page.evaluate(`__hc.benchPlace(${x},${y},${z},${n},'${axis}')`);
    // the streamer remeshes the dirty chunk on its own cadence; poll for the clones instead of guessing a delay
    let r=null;
    for(let i=0;i<40;i++){ r=await page.evaluate(`__hc.benchCount(${x},${y},${z},${n},'${axis}')`);
      if(r && r.benches===n && (r.legs+r.spokes)>0) break; await sleep(250); }
    return r;
  };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    const pr = await page.evaluate(`__hc.probe()`);
    await page.evaluate(`(()=>{ __hc.lock(true); __hc.setTime(0.5); __hc.tp(${pr.spawnX}, ${pr.spawnZ}); })()`);
    await sleep(3000);
    const base0 = await page.evaluate(`(()=>{ const p=__hc.st(); return { x:Math.floor(p.px)+4, y:Math.floor(p.py)+1, z:Math.floor(p.pz)+4 }; })()`);

    // ---- A LONE BENCH IS A TABLE: FOUR LEGS ----
    const one = await run(page, base0.x, base0.y, base0.z, 1, 'x');
    check('a single bench exists in the world', one && one.benches===1, JSON.stringify(one));
    check('and it stands on four legs', one && one.legs===4, `legs ${one&&one.legs}`);
    check('with two spokes', one && one.spokes===2, `spokes ${one&&one.spokes}`);

    // ---- A RUN OF THREE IS ONE BENCH: STILL FOUR LEGS ----
    const three = await run(page, base0.x, base0.y, base0.z+6, 3, 'x');
    check('three benches in a row are all placed', three && three.benches===3, JSON.stringify(three));
    check('a 1x3 run stands on FOUR legs, not twelve', three && three.legs===4, `legs ${three&&three.legs}`);
    check('and the rail runs the whole length (2 spokes per block, joined)',
      three && three.spokes===6, `spokes ${three&&three.spokes} across 3 blocks`);

    // ---- THE TOPS MUST ACTUALLY MEET, ON BOTH AXES ----
    // Ben: "workbenches dont connect up, they only looked like it from one rotation." The top is 1.0 along its length and
    // 0.86 across, so an unrotated bench meets its neighbour along X and leaves a 0.14 seam at every block along Z.
    // Counting legs cannot see that; the worst gap between consecutive tops can.
    check('an X run is one continuous top, no seams', three && three.maxGap<=0.001 && three.span===3,
      `maxGap ${three&&three.maxGap}, span ${three&&three.span} over 3 blocks`);
    check('and it wears ONE vice, not one per block', three && three.vices===1, `vices ${three&&three.vices}`);

    const threeZ = await run(page, base0.x+8, base0.y, base0.z, 3, 'z');
    check('a 3-long run along Z also stands on four legs',
      threeZ && threeZ.benches===3 && threeZ.legs===4, `legs ${threeZ&&threeZ.legs}, benches ${threeZ&&threeZ.benches}`);
    check('a Z run is ALSO one continuous top — the rotation the fault hid behind',
      threeZ && threeZ.maxGap<=0.001 && threeZ.span===3, `maxGap ${threeZ&&threeZ.maxGap}, span ${threeZ&&threeZ.span} over 3 blocks`);
    check('and the Z run wears one vice too', threeZ && threeZ.vices===1, `vices ${threeZ&&threeZ.vices}`);

    // ---- A FIVE-LONG RUN IS STILL FOUR: the middle carries none ----
    const five = await run(page, base0.x, base0.y, base0.z+12, 5, 'x');
    check('a 1x5 run still stands on four legs', five && five.legs===4, `legs ${five&&five.legs}, benches ${five&&five.benches}`);

    console.log(`\n${checks-fails}/${checks} checks pass`);
    if(fails) console.log('THE BUG IS PRESENT: every bench in a run is bringing its own four legs.');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
