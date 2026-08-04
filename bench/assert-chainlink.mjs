// A CHAINLINK FENCE IS A DIAMOND WEAVE YOU CAN SEE THROUGH, ON A RAIL, WITH POSTS AT INTERVALS.
//
// Ben 08-04: it "does not look real" — and it was literally model:'bars', the iron-bars lattice, three vertical bars per
// block. So the fault had three parts and each gets a number here rather than a judgement about a picture:
//   1. YOU CAN SEE THROUGH IT. Counted from the ATLAS PIXELS, which is the source of truth. Iron bars have no holes in
//      their tile at all; a weave is mostly hole. And texel (0,0) must stay OPAQUE, because every rail, post and cap pins
//      its UVs to that one texel so the whole fence can be a single alpha-tested material — if the weave pitch is ever
//      retuned and that texel becomes a hole, the rails and posts silently vanish.
//   2. POSTS AT INTERVALS, NOT ONE PER BLOCK. Counted ACROSS the whole run: the fault was never "this block has the wrong
//      post", it was "twelve blocks bring twelve posts", and a per-block count goes green on that.
//   3. IRON BARS ARE UNTOUCHED. They share the old builder, so they are the control. If this change reached them, the two
//      blocks would look identical again and the whole item would be undone while every other check still passed.
//
//   node bench/assert-chainlink.mjs
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
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(name,ok,detail)=>{ checks++; if(!ok) fails++; console.log((ok?'  PASS  ':'  FAIL  ')+name+(detail!==undefined?('   '+detail):'')); };
  // poll on the ARM COUNT, not on "any mesh exists": the counts are world-wide, so a previous run's fence satisfies
  // "something is drawn" instantly and the poll returns before this run has been meshed at all.
  const run = async (page,x,y,z,n,axis,expectArms) => {
    await page.evaluate(`__hc.chainlinkRun(${x},${y},${z},${n},'${axis}')`);
    let r=null;
    for(let i=0;i<60;i++){ r=await page.evaluate(`__hc.chainlinkCount(${x},${y},${z},${n},'${axis}')`);
      if(r && r.placed===n && r.arms>=expectArms) break; await sleep(250); }
    return r;
  };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,200)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",{timeout:240000});
    const pr=await page.evaluate('__hc.probe()');
    await page.evaluate(`(()=>{ __hc.lock(true); __hc.setTime(0.45); __hc.tp(${pr.spawnX}, ${pr.spawnZ}); })()`);
    await sleep(3000);

    // ---------- 1. IT IS A WEAVE, AND YOU CAN SEE THROUGH IT ----------
    const I=await page.evaluate('__hc.chainlinkInfo()');
    console.log('     '+JSON.stringify(I));
    check('chainlink has its OWN model, no longer the iron-bars lattice', I.chainlinkModel==='chainlink', `model '${I.chainlinkModel}'`);
    check('and iron_bars is untouched — the control', I.ironBarsModel==='bars', `iron_bars model '${I.ironBarsModel}'`);
    // ASSERT THE NUMBER: a weave is MOSTLY hole. "some holes" would pass on a tile with one stray transparent pixel.
    check('the tile is mostly hole, as a diamond weave is', I.holeFrac>=0.45 && I.holeFrac<=0.80, `${I.holes}/256 texels are holes (${I.holeFrac})`);
    check('texel (0,0) is OPAQUE — every rail and post pins its UVs there', I.texel00Alpha===255, `alpha ${I.texel00Alpha}`);
    // AND IT IS THE RIGHT TEXEL. This check exists because the first version did not have it: flipY meant the geometry was
    // sampling canvas row 15, the rust band, so every rail and post came out rust-brown while the probe cheerfully read
    // row 0 and reported galvanised steel. Cool steel has blue >= red; rust is the other way round.
    check('and the texel the rails sample is galvanised steel, not the rust band', I.railIsSteel===true, `rail texel rgb ${JSON.stringify(I.railTexel)}`);
    check('the fabric is alpha-TESTED, so nothing has to sort', I.alphaTest>0 && I.alphaTest<1, `alphaTest ${I.alphaTest}`);
    check('and it has its own depth material, or it casts a solid panel shadow', I.hasDepthMat===true);
    check('an arm carries fabric plus a rail plus a tension wire', I.armTris>=20 && I.armTris<=200, `${I.armTris} triangles`);
    check('the rail reaches the top of the cell', I.armTop>=0.93 && I.armTop<=1.02, `arm top ${I.armTop}`);
    check('the post stands a little proud of the fabric, as a real one does', I.postTop>I.armTop, `post ${I.postTop} vs arm ${I.armTop}`);

    // ---------- 2. POSTS AT INTERVALS, COUNTED ACROSS THE RUN ----------
    const b=await page.evaluate('(()=>{const p=__hc.st();return {x:Math.floor(p.px)+3,y:Math.floor(p.py)+1,z:Math.floor(p.pz)+3};})()');
    // a 12-long straight run: 11 internal links each way = 22 arms, and the ENDS must both be posted
    const r12=await run(page,b.x,b.y,b.z,12,'x',22);
    console.log('     12 long :  '+JSON.stringify(r12));
    check('a 12-long run is all placed', r12 && r12.placed===12, JSON.stringify(r12));
    check('the panels link neighbour to neighbour', r12 && r12.arms>=22, `${r12&&r12.arms} arms across 12 blocks`);
    // THE LOAD-BEARING CHECK. One post per block is 12. Ends plus every third along the run is roughly 4-6.
    check('twelve blocks do NOT bring twelve posts', r12 && r12.posts>=2 && r12.posts<=7,
      `${r12&&r12.posts} posts across 12 blocks (one-per-block would be 12)`);
    check('and the fence is instanced — a handful of meshes, not one per cell',
      r12 && (r12.armMeshes+r12.postMeshes)<=10, `${r12&&r12.armMeshes} arm + ${r12&&r12.postMeshes} post meshes for 12 cells`);

    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

    console.log(`\n${checks-fails}/${checks} checks pass`);
    if(fails) console.log('Read the dumps: chainlinkModel/ironBarsModel tell you if the two blocks got mixed up again.');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
