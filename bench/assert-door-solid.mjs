// YOU CANNOT STAND INSIDE A DOOR LEAF, OPEN OR CLOSED — AND THE DOORWAY IS STILL WALKABLE.
//
// A door is one cell holding a thin leaf, not a filled cell. Closed, the leaf is a 0.30-deep slab on the cell's -z face and
// aabbHits special-cases exactly that. Open, the leaf swings to the -x face — and the open ids are declared solid:false, so
// aabbHits skips the cell entirely and the player walks straight into the panel.
//
// Probed with __hc.hits(x,y,z), which asks the collider directly. Walking into a door and looking at where you end up tests
// step-up, friction and the substep order as much as it tests the hitbox, and cannot say WHICH of them let you through.
//
// The claims, for both states:
//   1. the leaf volume collides
//   2. the rest of the cell does not — a doorway you cannot walk through is a wall
//   3. the open door's doorway is clear along the axis you actually walk through it
//
//   node bench/assert-door-solid.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:900,height:520},deviceScaleFactor:1})).newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.setTime(0.42); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);

    // A DOOR ON OPEN GROUND, well clear of anything else, and the two cells above it cleared so only the door is in the AABB's
    // way. The probe is taken at the door's own y, standing height.
    const S=await page.evaluate(`__hc.st()`);
    const site=await page.evaluate(`(()=>{ const x=Math.round(${S.sx})+6, z=Math.round(${S.sz})+6, gy=__hc.groundY(x,z);
      return {x, z, y:gy+1}; })()`);
    const { x, z, y } = site;
    console.log(`  door cell (${x}, ${y}, ${z})`);
    // __hc.setBlock is RELATIVE to the player, so stand in the cell first. Standing inside the door while probing is harmless:
    // hits() is a pure query against the block grid and never moves anyone.
    const setDoor=async(open)=>{
      await page.evaluate(`(()=>{ __hc.tpAt(${x}+0.5, ${y}, ${z}+0.5);
        __hc.setBlock(0,0,0,'${open?'door_open':'door'}'); __hc.setBlock(0,1,0,'${open?'door_top_open':'door_top'}'); })()`);
      await sleep(500);
    };
    // The probe point is the PLAYER CENTRE. HW is about a third of a block, so a centre placed at the middle of a 0.30-deep leaf
    // overlaps it comfortably; a centre at the far side of the cell must not.
    const probe=async(px,pz)=>page.evaluate(`__hc.hits(${px}, ${y}, ${pz})`);
    const report=async(tag)=>{
      const inLeafClosed=await probe(x+0.5, z+0.15);   // the closed leaf: z from zz to zz+0.30
      const inLeafOpen  =await probe(x+0.15, z+0.5);   // the open leaf: x from xx to xx+0.30
      const openDoorway =await probe(x+0.75, z+0.5);   // clear of an open leaf, in the cell — you walk through here
      const closedFar   =await probe(x+0.5, z+0.85);   // clear of a closed leaf, in the cell
      console.log(`  ${tag.padEnd(7)} closed-leaf volume ${inLeafClosed}   open-leaf volume ${inLeafOpen}   walk-through lane ${openDoorway}   far side ${closedFar}`);
      return { inLeafClosed, inLeafOpen, openDoorway, closedFar };
    };
    await setDoor(false); const C=await report('CLOSED');
    await setDoor(true);  const O=await report('OPEN');

    check('a closed door leaf stops you',        C.inLeafClosed===true,  `hits() at the leaf = ${C.inLeafClosed}`);
    check('an OPEN door leaf stops you too',     O.inLeafOpen===true,    `hits() inside the swung panel = ${O.inLeafOpen}`);
    check('the open door is still walkable',     O.openDoorway===false,  `hits() in the lane you walk through = ${O.openDoorway}`);
    // A CLOSED DOOR MUST NOT FILL ITS CELL EITHER — that is the other way to get this wrong, and it would wall up every
    // doorway in the world while making the check above pass.
    check('a closed door is a leaf, not a block',C.closedFar===false,    `hits() at the far side of a closed door's cell = ${C.closedFar}`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
