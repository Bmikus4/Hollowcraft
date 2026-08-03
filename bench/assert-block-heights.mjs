// A SHORT BLOCK MUST BE SHORT TO WALK ON, TOO.
//
// Collision used to be binary: a full cube, or a slab via `isHalf`. Everything else — chest, barrel, bed, a
// closed trapdoor, a lantern, a font — was a full 1x1x1 obstacle, so you bumped into the air above a chest and
// could not step onto a trapdoor. `h:` now carries each one's measured height.
//
// Checks the observable a player feels: drop them onto the block and see where they come to rest. Every claim
// is the RESTING HEIGHT above the block's own cell floor, compared against that block's declared height, and
// the guard is proven by including a full cube (which must still rest at 1.0) and a slab (0.5).
//
//   node bench/assert-block-heights.mjs
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
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?perf=1&debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`window.__hcPERF.arm(); __hc.lock(true);`);
    const pr = await page.evaluate(`__hc.probe()`);
    // A clear, flat spot next to spawn, so nothing else is in the way of the drop.
    await page.evaluate(`__hc.tp(${pr.spawnX+6}, ${pr.spawnZ+6}); __hc.cmdRun('/gamemode creative');`);
    await sleep(4000);

    const drop = async (block) => {
      const r = await page.evaluate(`(async()=>{
        const p=__hc.pos(); const bx=Math.floor(p.x), bz=Math.floor(p.z);
        const gy=Math.floor(__hc.probe().gyHere);
        // clear the column, put the block on the ground, then drop the player from 3 blocks up
        for(let dy=1; dy<=4; dy++) __hc.setBlockAt(bx, gy+dy, bz, 0);
        __hc.setBlockAt(bx, gy+1, bz, ${JSON.stringify(block)});
        __hc.cmdRun('/fly off');
        __hc.tpAt(bx+0.5, gy+1+3.0, bz+0.5);
        return { bx, bz, gy, placed:__hc.blockAt(bx, gy+1, bz) };
      })()`);
      await sleep(2600);                                   // fall + settle; a fixed wait is right for "has it stopped"
      const f = await page.evaluate(`(()=>{ const p=__hc.pos(), d=__hc.fallDbg(); return { y:p.y, onGround:d.onGround, vy:d.vy }; })()`);
      return { rest:+(f.y - (r.gy+1)).toFixed(3), onGround:f.onGround, vy:f.vy, placed:r.placed };
    };

    const CASES = [
      ['stone',    1.00, 'a full cube must be unchanged'],
      ['slab',     0.50, 'the slab case that already worked'],
      ['chest',    0.74, null],
      ['barrel',   0.93, null],
      ['bed',      0.55, null],
      ['trapdoor', 0.20, null],
      ['lantern',  0.63, null],
      ['font',     0.77, null],
    ];
    for(const [b,want,why] of CASES){
      const r = await drop(b);
      const ok = r.onGround && Math.abs(r.rest-want) < 0.08;
      check(`stand on ${b}: rests ${r.rest} above its cell floor (want ${want})`, ok,
        (why?why+'; ':'')+`onGround ${r.onGround}, vy ${r.vy}`);
    }
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
