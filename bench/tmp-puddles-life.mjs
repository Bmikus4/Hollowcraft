// A PUDDLE HAS A LIFE, AND NONE OF IT HAD BEEN WATCHED (Ben 08-16: "rain puddles should be real things").
//
// 120b488 built them - they gather in flat low ground, fill in about fifteen seconds and dry over seventy - and then
// nothing looked at a frame, nothing priced them, and no bench ever waited out a dry. Seventy seconds is longer than
// any harness here runs, so the drying half of the feature has only ever existed as a constant in the source.
//
// Three questions, one run, because they need the same filled world:
//   1. LOOK    - a frame of wet ground, so the thing can be judged instead of asserted.
//   2. COST    - paired on/off windows at a site with the puddles actually FILLED. Their own design note calls
//                reflections at ground level the expensive case, so an unpriced number here is not acceptable.
//   3. THE DRY - sampled every five seconds past the seventy the code claims, reported as a curve. A puddle that
//                vanishes the moment the rain stops is a light switch, and only a clock can tell the difference.
//
//   node bench/tmp-puddles-life.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const med=a=>{ const s=a.slice().sort((x,y)=>x-y); return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2; };
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    const logs=[];
    page.on('pageerror',e=>logs.push('PAGEERROR: '+String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?perf=1&debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`window.__hcPERF&&window.__hcPERF.arm();`);
    await page.evaluate(`__hc.lock(true); __hc.freezeAnimals(true); __hc.cinema(true); __hc.freezeT(0); __hc.setTime(0.30);`);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    // Look DOWN at the ground: puddles are flat water on a floor, and a frame shot at the horizon cannot show them.
    await page.evaluate(`__hc.cam({yaw:0.7, pitch:-0.55}); __hc.pinScene();`);

    // ---- FIND GROUND THAT CAN HOLD WATER, and REFUSE to measure if there is none ----
    // A site must be flat (its four neighbours within 1.2 of it), low (at or under them, so water runs TO it), above
    // the sea and solid. Spawn satisfies none of that - the first run of this bench found 0 sites there and then
    // dutifully reported a cost and a 90-second drying curve for puddles that did not exist, with the dry check
    // PASSING because nothing was ever wet. A control that cannot fail is not a control.
    const probe=async(x,z)=>{ const g=await page.evaluate(`__hc.groundY(${x},${z})`);
      await page.evaluate(`__hc.tpAt(${x}+0.5, ${g}+2, ${z}+0.5)`); await sleep(1200);
      return await page.evaluate(`__hc.puddles()`); };
    const IC=await page.evaluate(`__hc.isleStats()`);
    let found=null;
    // A spiral of candidates rather than one guess: flat low ground is a property of the terrain, and which way it
    // lies from the island centre is not something this bench should assume.
    for(const [dx,dz] of [[0,0],[40,0],[-40,0],[0,40],[0,-40],[60,60],[-60,60],[60,-60],[-60,-60],[100,20],[-100,20],[20,100],[20,-100]]){
      const p=await probe(IC.x+dx, IC.z+dz);
      console.log(`  probe   ${String(IC.x+dx).padStart(5)},${String(IC.z+dz).padStart(5)}  sites ${p.sites}`);
      if(p.sites>=4){ found=p; break; }
    }
    if(!found){ console.log('\n  NO GROUND HERE HOLDS WATER - refusing to report a cost or a drying curve for puddles that do not exist.'); process.exit(1); }
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }

    // ---- TAKE THE VANTAGE BEFORE A DROP FALLS, and do not move again ----
    // THE SCAN IS KEYED TO THE PLAYER. _pudSiteScan rebuilds the site list whenever he has moved sixteen blocks, so
    // filling the puddles and THEN walking to a camera position throws the filled sites away and replaces them with
    // dry ones around the new spot. That is exactly what the previous run did: it filled five sites, teleported to
    // photograph them, and then priced the pass and timed a 90-second dry against a set that had just been reseeded to
    // zero - a drying curve that read 0.000 at every sample because nothing had ever been wet at that position.
    // Standing off the puddle also has to happen here rather than later: teleporting onto a site's own column buried
    // the eye inside a birch trunk once already.
    const seed=(found.at&&found.at[0])||null;
    if(seed){ await page.evaluate(`__hc.tpAt(${seed.x}+6.5, ${seed.y}+5, ${seed.z}+6.5)`); await sleep(1500);
      await page.evaluate(`__hc.cam({yaw:${Math.atan2(-6.5,-6.5)}, pitch:-0.62}); __hc.pinScene();`); await sleep(1200); }
    const here=await page.evaluate(`__hc.puddles()`);
    console.log(`  vantage at the seed site ${seed?seed.x+','+seed.y+','+seed.z:'(none)'}  -> ${here.sites} sites in range from here`);
    if(!(here.sites>0)){ console.log('\n  THE VANTAGE HAS NO SITES IN RANGE - refusing to measure puddles the camera cannot see.'); process.exit(1); }

    // ---- FILL ----
    await page.evaluate(`__hc.cmdRun('/weather storm 1')`);
    let filled=null;
    for(let s=0;s<12;s++){ await sleep(2500); filled=await page.evaluate(`__hc.puddles()`);
      if(s===0) console.log(`  sites   ${filled.sites} found near the player`);
      if(filled.drawn>0 && filled.meanFill>0.25) break; }
    console.log(`  filled  ${JSON.stringify(filled)}`);
    check('the puddle update threw nothing', !filled.err, String(filled.err));
    check('sites were found in the ground here', filled.sites>0, `sites ${filled.sites}`);
    check('rain filled them and they DREW', filled.drawn>0, `drawn ${filled.drawn} quads, meanFill ${filled.meanFill}`);
    const f1=path.join(OUT,'puddles-wet.png'); await page.screenshot({path:f1}); console.log('   ->',path.basename(f1));
    // Everything past this point is about WET ground. Measuring a cost or a dry with nothing drawn is how the first
    // run of this bench produced four confident numbers and a passing drying curve out of an empty field.
    if(!(filled.drawn>0)){ console.log('\n  NOTHING FILLED - refusing to price or to time a dry that has nothing to dry.'); process.exit(1); }

    // ---- COST, paired and alternating, with the puddles genuinely filled. Same discipline as perf-flag-ab: A then B
    // on odd rounds and B then A on even, so any drift inside a round cancels instead of landing on one side.
    const win=async(on)=>{ await page.evaluate(`__hc.puddles(${on?1:0}); __hcPERF.reset();`); await sleep(6000);
      const r=await page.evaluate(`(()=>{ const f=__hcPERF.live(), i=__hc.perf(); return { median:f.median, n:f.n, draws:i.calls }; })()`);
      if(!r.n) throw new Error('no frames committed - not a measurement');
      return r; };
    const dA=[], dOn=[], dOff=[];
    for(let r=0;r<4;r++){ let a,b;
      if(r%2===0){ b=await win(true); a=await win(false); } else { a=await win(false); b=await win(true); }
      dOn.push(b.median); dOff.push(a.median); dA.push(+(b.median-a.median).toFixed(3));
      console.log(`  round ${r+1}: off ${a.median} ms (perf calls ${a.draws})  ->  on ${b.median} ms (perf calls ${b.draws})   delta ${(b.median-a.median>=0?'+':'')}${(b.median-a.median).toFixed(3)}`);
    }
    const pm=med(dA), up=dA.filter(x=>x>0).length;
    console.log(`  COST    paired median ${pm>0?'+':''}${pm.toFixed(3)} ms over ${dA.length} rounds   ${up}/${dA.length} rounds slower with puddles ON   per-round [${dA.join(', ')}]`);
    // Not an assertion of a threshold - a threshold nobody agreed is how a bench starts lying. It records the number
    // and only fails if the puddles are outright expensive, which for a handful of quads would mean something is wrong.
    check('the puddles are not costing a whole frame', pm < 2.0, `${pm.toFixed(3)} ms`);

    // ---- THE DRY. Past the seventy seconds the code claims, sampled so the SHAPE is visible and not just the ends.
    await page.evaluate(`__hc.puddles(1); __hc.cmdRun('/weather clear')`);
    const curve=[];
    for(let t=0; t<=90; t+=5){ const p=await page.evaluate(`__hc.puddles()`);
      curve.push(`${t}s:${p.meanFill.toFixed(3)}/${p.drawn}`); if(t<90) await sleep(5000); }
    console.log('  DRY     mean fill / quads drawn:\n   '+curve.join('  '));
    const last=await page.evaluate(`__hc.puddles()`);
    check('they dry off rather than persisting forever', last.meanFill<0.06 && last.drawn===0, `after 90s: meanFill ${last.meanFill}, drawn ${last.drawn}`);
    const f2=path.join(OUT,'puddles-dry.png'); await page.screenshot({path:f2}); console.log('   ->',path.basename(f2));
    check('no page errors', logs.length===0, logs.slice(0,1).join('').slice(0,160));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
