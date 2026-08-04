// A SKY BIRD FLIES THE WAY IT IS POINTING, AND ITS WINGS BEAT.
//
// Three faults, one function (Ben 08-04: "make sure birds fly in the proper direction, and that their wings flap", and
// "these weird black lines in the sky" — the same silhouette in all three):
//   1. rotation.y was -dir while velocity is (sin dir, cos dir). That mirrors Z: the body's long axis pointed
//      (sin dir, -cos dir), so the bird crabbed sideways at every heading except due east and west.
//   2. Each wing's geometry was pushed 0.31 inboard of a mesh sitting 0.36 outboard, so the strip ran from the tip back
//      across the body and the hinge was the TIP — rotating it moved the shoulder end and left the tip where it was.
//   3. The body was a bare box with no head or tail, so there was no front to see and no way for a wrong heading to look
//      wrong; and a 0.035-thick wing on a 1.5-2.7x scaled bird is a sub-pixel edge, which is the "black line".
//
// Measured through __hc.skyFlock() rather than from pixels: a 3-metre black silhouette 110 blocks up is a few pixels of
// near-black against near-black night sky, and neither a heading nor a moving vertex survives that.
//
//   node bench/assert-sky-birds.mjs
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

    // ARM A FLOCK AND WAIT FOR IT. Left alone the next one is 28-78 seconds away and the run would be measuring an empty array.
    await page.evaluate(`__hc.skyFlock({spawn:true})`);
    await page.waitForFunction(`(()=>{try{const f=__hc.skyFlock(); return Array.isArray(f)&&f.length>0;}catch(e){return false;}})()`,{timeout:20000});
    const flock=await page.evaluate(`__hc.skyFlock()`);
    console.log(`  ${flock.length} birds aloft, scales ${flock.map(b=>b.scale).join('/')}`);
    console.log(`  headings: ${flock.map(b=>`dir ${b.dir} rotY ${b.rotY} facesVel ${b.facesVel}`).join('   |   ')}`);

    // 1. THE MODEL FACES ITS OWN VELOCITY. The dot of the model's +Z with the unit velocity is 1 when it does. Before the fix
    //    this read cos(2*dir), which is 1 only for a heading of due north or due south. A flock shares one heading, so this is
    //    not four independent samples — its strength is that the heading is random per flock (the bearing to the player plus up
    //    to 0.35 radians either way), so a run that passes on a mirrored rotation would need that draw to land on an axis.
    //    Measured here at dir -0.349, where the old expression would have given 0.76.
    const worst=Math.min(...flock.map(b=>b.facesVel));
    check('every bird faces the way it is flying', worst > 0.999, `worst facesVel ${worst} across ${flock.length} birds`);
    check('the heading is the travel bearing, not its mirror', flock.every(b=>Math.abs(b.rotY-b.dir)<1e-6), flock.map(b=>`${b.rotY} vs ${b.dir}`).join(', '));

    // 2. THE WINGTIP MOVES. Sampled over a second: the hinge is at the shoulder now, so the tip is the part that travels, and
    //    its height relative to the body has to sweep a real arc. Pivoting at the tip (the bug) left this nearly constant.
    const track=[];
    for(let i=0;i<14;i++){ const f=await page.evaluate(`__hc.skyFlock()`); if(f[0]) track.push(f[0].tipDY); await sleep(80); }
    const lo=Math.min(...track), hi=Math.max(...track);
    console.log(`  wingtip height relative to the body over ${track.length} samples: ${lo.toFixed(3)} .. ${hi.toFixed(3)}`);
    check('the wingtip sweeps a real arc',        (hi-lo) > 0.25, `${(hi-lo).toFixed(3)} blocks of travel`);
    check('and it goes both above and below',     lo < 0 && hi > 0, `${lo.toFixed(3)} up to ${hi.toFixed(3)} — a beat, not a droop`);

    // AND A FRAME OF THE SILHOUETTE, because the third complaint was about how it LOOKS. Ben's night shot showed two long
    // near-black strokes with hooked ends in the sky; that is this model with a sub-pixel wing, a tip hinge and a heading
    // across its own path. The frame is not a pass/fail — it is the record of what the shape reads as now.
    { const f=await page.evaluate(`__hc.skyFlock()`);
      if(f[0]){ const b=await page.evaluate(`(()=>{const f=__hc.skyFlock(); return f[0];})()`);
        await page.evaluate(`(()=>{const s=__hc.st(); return __hc.tpAt(s.px, ${b.y}-2, s.pz);})()`);
        await page.evaluate(`__hc.setTime(0.42)`); await sleep(600);
        const OUT=path.join(ROOT,'bench','results'); fs.mkdirSync(OUT,{recursive:true});
        await page.screenshot({path:path.join(OUT,'sky-birds.png')});
        console.log('  frame: bench/results/sky-birds.png'); } }
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
