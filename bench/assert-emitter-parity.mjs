// A LIGHT IN YOUR HAND AND THE SAME LIGHT ON THE FLOOR EMIT THE SAME — Ben 08-05: "they should all emit the same, ALL OF THEM."
//
// They did not, and the drift was invisible because the two paths are 900 lines apart. The pool (placed) ran three tiers off the
// emitter's light LEVEL — 60/34 at level 15, 46/27 in the middle, 18/12 at level 10 or under — and the hand ran two, 58/32 at level 15
// and 46/26 for everything else. So a candle (level 10) in your hand threw a pool nearly three times as strong and twice as far as the
// same candle standing on the floor, and a lantern in your hand was 3% dimmer and 2 blocks shorter than one on a post.
//
// PARITY IS A CLAIM ABOUT NUMBERS, NOT PIXELS, and this file asserts it as one. A held light sits at the eye and a placed light sits
// in a block, so there is no vantage at which a crop compares them: any pixel difference would be geometry. `__hc.lightParams()`
// reports the shared table, the live hand light, and every live pool slot with the level it serves.
//   colour and distance carry NO multiplier, so they must equal the table exactly, on both paths.
//   intensity carries the hand's 12% flicker or the pool's fl*edge, so only its RATIO to the table's base is meaningful.
// Every emitter the player can hold is walked, one per light level the table distinguishes.
//
//   node bench/assert-emitter-parity.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// The items, and the level each one carries. Chosen to cover all three tiers the table distinguishes, including both ends of the
// dim tier and both of the middle one.
const KINDS=[ {item:'lantern', lvl:15, tier:'strong'}, {item:'torch', lvl:14, tier:'mid'},
              {item:'candelabra', lvl:13, tier:'mid'},
              // red_torch is level ELEVEN, not the 12 its first declaration says: `block('red_torch', ...)` is declared TWICE (light
              // 12 for the shrine torch, then again at light 11 for the crimson one) and the second call wins. Both emission paths
              // agree on 11, which is all this file is asserting; the duplicate declaration is a separate thing to clean up.
              {item:'red_torch', lvl:11, tier:'mid'},
              {item:'candle', lvl:10, tier:'dim'} ];
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    const page=await ctx.newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone(); __hc.freezeAnimals(true);`);
    const T=await page.evaluate(`__hc.lightParams().table`);
    console.log(`  table ${JSON.stringify(T)}`);
    check('the shared table answers, with three tiers and one decay', !!(T&&T.strong&&T.mid&&T.dim&&T.decay>0), JSON.stringify(T));
    check('the tiers are ordered, strong > mid > dim, in both reach and strength',
      T.strong.i>T.mid.i && T.mid.i>T.dim.i && T.strong.d>T.mid.d && T.mid.d>T.dim.d,
      `i ${T.strong.i}/${T.mid.i}/${T.dim.i}  d ${T.strong.d}/${T.mid.d}/${T.dim.d}`);

    // A CLEAR SPOT ON THE GROUND, and nothing else lit near it: the pool serves the NEAREST emitters, and worldgen fills most of its
    // slots at spawn (bench/tmp-break-light-wash.mjs found 14 of 16 already taken with one lantern placed), so a slot read at spawn
    // could belong to any torch in the wood. 400 blocks out, then assert the pool is empty before placing anything.
    const S=await page.evaluate(`__hc.st()`);
    const X=Math.round(S.sx)+400, Z=Math.round(S.sz);
    const GY=await page.evaluate(`(()=>{ const g=__hc.groundY(${X},${Z}); __hc.tpAt(${X}+0.5,g+2,${Z}+0.5); return g; })()`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1500);
    const quiet=await page.evaluate(`__hc.lightParams().pool.length`);
    check('the test spot has no other light in the pool', quiet===0, `${quiet} live pool slots before placing anything`);

    for(const K of KINDS){
      // HELD first, then the same item PLACED two blocks away, so both readings are of the same emitter kind in the same frame budget.
      await page.evaluate(`__hc.hold('${K.item}')`); await sleep(500);
      const H=await page.evaluate(`__hc.lightParams()`);
      await page.evaluate(`__hc.holdNone(); __hc.cmdRun('/setblock ${X+2} '+(${GY}+1)+' ${Z} ${K.item}')`);
      for(let i=0;i<10;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(300); }
      await sleep(900);
      const P=await page.evaluate(`__hc.lightParams()`);
      const slot=P.pool[0]||null, want=T[K.tier];
      console.log(`  ${K.item.padEnd(11)} lvl ${String(K.lvl).padEnd(3)} want i${want.i} d${want.d} c${want.c.toString(16)}`);
      console.log(`     held  ${JSON.stringify(H.held)}`);
      console.log(`     pool  ${JSON.stringify(slot)}   levels ${JSON.stringify(P.poolLvl.filter(v=>v!=null))}`);
      check(`${K.item}: the hand reads the level the block carries`, H.held.lvl===K.lvl, `${H.held.lvl} vs ${K.lvl}`);
      check(`${K.item}: the hand takes the table's tier`, H.held.base.i===want.i && H.held.base.d===want.d, JSON.stringify(H.held.base));
      check(`${K.item}: hand distance and colour are the table's`, H.held.d===want.d && H.held.c===want.c, `d ${H.held.d} c ${H.held.c.toString(16)}`);
      check(`${K.item}: the block lights one pool slot`, !!slot, JSON.stringify(P.pool));
      if(slot){
        check(`${K.item}: PLACED distance and colour equal HELD's`, slot.d===H.held.d && slot.c===H.held.c,
          `placed d ${slot.d} c ${slot.c.toString(16)} vs held d ${H.held.d} c ${H.held.c.toString(16)}`);
        // Intensity is multiplied on both paths — the hand by its flicker (0.88-1.12), the pool by the flame curve and the edge fade —
        // so the assertion is that both sit around the SAME base, not that they are equal to each other.
        const rh=H.held.i/want.i, rp=slot.i/want.i;
        check(`${K.item}: both intensities sit on the table's base`, rh>0.5&&rh<1.5&&rp>0.4&&rp<1.6,
          `held x${rh.toFixed(3)}  placed x${rp.toFixed(3)}  of ${want.i}`);
        check(`${K.item}: decay is shared`, slot.decay===T.decay && H.held.decay===T.decay, `held ${H.held.decay} placed ${slot.decay}`);
      }
      await page.evaluate(`__hc.cmdRun('/setblock ${X+2} '+(${GY}+1)+' ${Z} air')`);
      for(let i=0;i<10;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(300); }
      await sleep(700);
    }
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | ').slice(0,200));
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
