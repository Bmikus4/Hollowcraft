// SANDBAGS ARE LAID BAGS, AND A WALL OF THEM COSTS A FLAT NUMBER OF DRAWS.
//
// Ben 08-04: sandbags "must actually be modelled". block('sandbag') was cat:'solid' — a plain cube wearing a tile with
// rows of bags painted on it, which is why a bunker read as printed cardboard.
//
// Three separate things have to be true, and each one has a number rather than a picture:
//   1. IT IS MODELLED. A cube's crest spread is exactly 0.000 and its triangle count is 12. The pile has a broken top
//      edge and hundreds of triangles. That is the difference between "modelled" and "textured".
//   2. IT IS STILL A SOLID CELL OF EARTH. Going cat:'model' forced isOpaque to 0 (greedyMesh selects the opaque pass on
//      isOpaque alone and never consults blockCat, so an opaque model block is drawn TWICE — a greedy cube AND its model).
//      So occludesSky has to be put back by hand, or every bunker roof bakes as open sky. That is asserted here against
//      htop, which is the array the skylight bake actually reads.
//   3. A WALL IS CHEAP. This block is instanced rather than cloned per cell precisely because players build walls out of
//      it. Mesh count must NOT grow with wall length, and the clone count must be 0 — if the instanced branch is ever
//      deleted the block still LOOKS right while costing a draw call per cell, which no screenshot would catch.
//
//   node bench/assert-sandbag.mjs
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
  // The streamer remeshes a dirty chunk on its own cadence, so poll rather than guess a delay — and poll on the INSTANCE
  // COUNT, not on "are there any meshes at all". The counts are world-wide, so a mesh left over from the previous wall
  // satisfies "meshes>0" instantly and the poll returns before the new wall has been meshed at all. That is exactly how
  // this harness first reported 1 instance for 13 cells and blamed the engine for its own impatience.
  const wall = async (page,x,y,z,n,axis,expectTotal) => {
    await page.evaluate(`__hc.sandbagWall(${x},${y},${z},${n},'${axis}')`);
    let r=null;
    for(let i=0;i<60;i++){ r=await page.evaluate(`__hc.sandbagWallCount(${x},${y},${z},${n},'${axis}')`);
      if(r && r.placed===n && (r.instances+r.clones)>=expectTotal) break; await sleep(250); }
    return r;
  };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,200)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    const pr=await page.evaluate('__hc.probe()');
    await page.evaluate(`(()=>{ __hc.lock(true); __hc.setTime(0.5); __hc.tp(${pr.spawnX}, ${pr.spawnZ}); })()`);
    await sleep(3000);

    // ---------- 1. THE BLOCK'S FOUR MASKS ----------
    const I=await page.evaluate('__hc.sandbagInfo()');
    console.log('     '+JSON.stringify(I));
    check('the sandbag is a MODEL block, not a cube', I.cat==='model', `cat ${I.cat}`);
    check('it is NOT opaque, or the mesher draws a greedy cube over the model', I.opaque===0, `isOpaque ${I.opaque}`);
    check('but it STILL occludes sky, so a bunker roof shades what is under it', I.occludesSky===1, `occludesSky ${I.occludesSky}`);
    check('and it is still solid, full height', I.solid===1 && I.h===1, `solid ${I.solid}, h ${I.h}`);

    // ---------- 2. IT IS ACTUALLY MODELLED ----------
    // ASSERT THE NUMBER, not the direction. A cube is 12 triangles with a crest spread of 0.000, so "more than a cube"
    // is the wrong bar — a two-box lump would clear it. A pile of twelve bags lands in the high hundreds.
    check('the pile is hundreds of triangles, not a box', I.tris>=400 && I.tris<=1400, `${I.tris} triangles`);
    check('its crest is BROKEN, which a cube cannot be', I.crest.spread>=0.05, `crest spread ${I.crest.spread} (a cube is 0.000)`);
    check('it fills its cell in x and z, so a wall has no gaps', I.span.x>=0.93 && I.span.z>=0.93, `span x ${I.span.x}, z ${I.span.z}`);
    check('it stands on the cell floor and reaches the top', I.base<=0.0 && I.crown>=0.93, `base ${I.base}, crown ${I.crown}`);
    check('the two parity variants are genuinely different geometry', I.variantsDiffer===true, `variantsDiffer ${I.variantsDiffer}`);
    check('the hand, the drop and the icon share the world pile', I.hasItemBuilder===true);

    // ---------- 3. THE ATLAS RULE ----------
    check('the new tile sits ABOVE everything that existed before it', I.aboveLastPastel===true, `tile ${I.tile} vs last pastel`);
    check('and ind_sandbag was NOT deleted (that re-rolls every tile below it)', I.indSandbagKept===true);

    // ---------- 4. THE COST: MESHES MUST NOT GROW WITH THE WALL ----------
    const b=await page.evaluate('(()=>{const p=__hc.st();return {x:Math.floor(p.px)+3,y:Math.floor(p.py)+1,z:Math.floor(p.pz)+3};})()');
    const one=await wall(page,b.x,b.y,b.z,1,'x',1);
    console.log('     1 block :  '+JSON.stringify(one));
    check('a single sandbag exists and draws', one && one.placed===1 && one.meshes>=1, JSON.stringify(one));
    check('and it is INSTANCED, not a per-block clone', one && one.clones===0, `clones ${one&&one.clones}`);

    // 12 long, inside one chunk's span, so mesh count is comparable against the single block
    const many=await wall(page,b.x,b.y,b.z+4,12,'x',13);   // 13 = the 12 here plus the single block above; the counts are world-wide
    console.log('     12 long :  '+JSON.stringify(many));
    check('a 12-long wall is all placed', many && many.placed===12, JSON.stringify(many));
    check('twelve sandbags are still ZERO clones', many && many.clones===0, `clones ${many&&many.clones}`);
    // THE LOAD-BEARING CHECK. 2 variants x chunks touched is the ceiling; per-cell drawing would be 12 or more.
    check('mesh count is FLAT in wall length — 2 per chunk, not one per cell',
      many && many.meshes<=2*Math.max(1,many.chunks)+2, `${many&&many.meshes} meshes over ${many&&many.chunks} chunk(s) for 12 cells`);
    check('every cell is accounted for by an instance', many && many.instances>=13, `${many&&many.instances} instances for 13 placed cells`);

    // ---------- 5. A ROOF ACTUALLY SHADES ----------
    // htop is the array _ssky/aSky bake from. A sandbag laid well above the ground must RAISE it; if occludesSky were 0
    // (which is what cat:'model' hands you by default) htop would not move and the bunker would bake as open sky.
    const roof=await page.evaluate(`__hc.sandbagRoof(${b.x+6},${b.y+4},${b.z+8})`);
    console.log('     roof    :  '+JSON.stringify(roof));
    check('a sandbag laid overhead raises the column top', roof && roof.after>=roof.y, `htop ${roof&&roof.before} -> ${roof&&roof.after}, block at y ${roof&&roof.y}`);

    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

    console.log(`\n${checks-fails}/${checks} checks pass`);
    if(fails) console.log('Read the row dumps above: cat/opaque/occludesSky tell you which of the three properties broke.');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
