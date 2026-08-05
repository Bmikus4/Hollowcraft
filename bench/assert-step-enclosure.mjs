// E3: FOOTSTEPS KNOW WHAT THEY ARE ON, AND A ROOM SOUNDS LIKE A ROOM.
//
// E3(a) was half-built, exactly as the brief warned: sfxStep already had grass, stone, wood, sand and dirt. Three materials were
// answered by the wrong voice — GRAVEL was folded into sand, WATER was classified but had no branch and fell through to dirt, and
// the entire industrial pack read as dirt, so a steel grate walkway sounded like a garden path. Mud is in the brief and not in the
// game yet (#61/E4 brings it), so there is nothing to classify.
//
// E3(b) was half-built too: the enclosure probe drove a reverb send and nothing else, so the dungeon and the cathedral were open
// ground with echo on top. A room takes the TOP off what you hear. Same probe, one more consumer, and the probe now runs on a timer
// rather than every frame — 81 solidAt calls for a thing that cannot change faster than you can walk.
//
// WHAT IS ASSERTED: the classifier's answer per material (a footstep is inaudible to a harness; the material it picked is not), and
// the master lowpass corner in the open versus sealed in a box.
//
//   node bench/assert-step-enclosure.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?('   '+d):'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required']});
    const page=await (await browser.newContext({viewport:{width:900,height:600}})).newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.30); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await page.mouse.click(450,300);
    const ev=js=>page.evaluate(js);
    const ac=await ev('__hc.audioOn()');
    check('the audio graph is running (or the filter readings are meaningless)', !!(ac&&ac.ac), JSON.stringify(ac));
    await sleep(2500);

    // ---- 1. EVERY MATERIAL GETS ITS OWN VOICE ----
    // Placed and classified rather than walked onto: the classifier is the thing under test, and one cell per material is enough.
    const g=await ev('__hc.probe()');
    const want=[['grass','grass'],['stone','stone'],['cobble','stone'],['concrete','stone'],['planks','wood'],['log','wood'],
                ['sand','sand'],['gravel','gravel'],['steel_grate','metal'],['reinforced_wall','metal'],['riveted_plate','metal'],
                ['corrugated_sheet','metal'],['dirt','dirt']];
    const rows=[];
    for(let i=0;i<want.length;i++){
      const [block,expect]=want[i];
      await ev(`__hc.setBlock(${i-6},-1,4,'${block}')`);
      const got=await ev(`__hc.audioE3(${Math.floor(g.x)+(i-6)}+0.5, ${g.gyHere-1}, ${Math.floor(g.z)+4}+0.5)`);
      rows.push({block, expect, got:got.mat});
    }
    for(const r of rows) console.log('     '+r.block.padEnd(18)+'-> '+String(r.got).padEnd(8)+(r.got===r.expect?'':'   WANT '+r.expect));
    const wrong=rows.filter(r=>r.got!==r.expect);
    check('every block underfoot classifies to its own material', wrong.length===0,
      wrong.map(r=>`${r.block} gave ${r.got} not ${r.expect}`).join('; ')||`${rows.length} materials`);
    // The three that were broken, named, so a regression says which one.
    check('gravel is no longer sand', rows.find(r=>r.block==='gravel').got==='gravel');
    check('and steel is no longer dirt', rows.filter(r=>r.expect==='metal').every(r=>r.got==='metal'));
    const wat=await ev(`__hc.audioE3(${g.x}, ${g.gyHere-40}, ${g.z})`);   // deep below ground is stone, not water — water is checked by its own cell
    await ev(`__hc.setBlock(0,-1,6,'water')`).catch(()=>{});
    const w2=await ev(`__hc.audioE3(${Math.floor(g.x)}+0.5, ${g.gyHere-1}, ${Math.floor(g.z)+6}+0.5)`);
    console.log('     water cell        -> '+w2.mat);
    check('water classifies as water', w2.mat==='water', JSON.stringify(w2));

    // ---- 2. A ROOM TAKES THE TOP OFF ----
    // Open ground first, then sealed inside a box of stone. The probe is on a 0.32 s timer with 0.25 s smoothing on the filter, so
    // both readings are taken after a wait long enough for the value to have arrived — measuring it sooner measures the ramp.
    await ev(`__hc.tpAt(${g.x},${g.gyHere+2},${g.z})`); await sleep(2200);
    const open=await ev('__hc.audioE3()');
    console.log('     open ground       cov '+open.encCov+'   lowpass '+open.lowpass+' Hz   cave '+open.cave+' forest '+open.forest);
    check('in the open the sound is not muffled at all', open.lowpass>=19000, `${open.lowpass} Hz at cov ${open.encCov}`);
    // dz was looped and then NOT PASSED — this built a single slab at dz=0 instead of a box, and the probe correctly reported a
    // third of a room. The reading was right; the room was not there.
    await ev(`(()=>{ for(let dx=-2;dx<=2;dx++) for(let dy=-1;dy<=3;dy++) for(let dz=-2;dz<=2;dz++){
        const edge=(Math.abs(dx)===2||Math.abs(dz)===2||dy===-1||dy===3);
        __hc.setBlock(dx,dy,dz, edge?'stone':null); } })()`);
    await sleep(2600);
    const boxed=await ev('__hc.audioE3()');
    console.log('     sealed in stone   cov '+boxed.encCov+'   lowpass '+boxed.lowpass+' Hz   cave '+boxed.cave+' forest '+boxed.forest);
    check('the enclosure probe sees the room', boxed.encCov>0.5, `cov ${boxed.encCov}`);
    check('and a room MUFFLES: the master lowpass closes', boxed.lowpass < open.lowpass-4000,
      `${open.lowpass} -> ${boxed.lowpass} Hz`);
    check('while still leaving something above speech', boxed.lowpass>2500, `${boxed.lowpass} Hz`);
    check('and the reverb send answers the same probe', (boxed.cave||0)+(boxed.forest||0) > (open.cave||0)+(open.forest||0),
      `cave ${open.cave}->${boxed.cave}, forest ${open.forest}->${boxed.forest}`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser)await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
