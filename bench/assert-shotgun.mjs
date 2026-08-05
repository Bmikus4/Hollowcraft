// THE 12 GAUGE FIRES NINE PELLETS, FROM ITS OWN BOX OF SHELLS.
//
// Ben: "add a 12 guage shotgun, and buckshot, both professionally rendered". Four things have to be true and none of them
// are visible in the item table: it holds five, it feeds from `buckshot` and never from the rifle's cartridges, one trigger
// pull spends ONE shell while putting several pellets into what you aimed at, and the pattern OPENS with range so that the
// same shot at 30 blocks is worth a fraction of the same shot at 4.
//
// The pellet count is measured as damage to the Wretch, not by counting rays: no single-projectile gun in the game does
// more than 70 in one pull, so a drop above that can only be several pellets landing. The far shot is the control.
//
//   node bench/assert-shotgun.mjs
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
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.setTime(0.5);`);

    // ---- IT EXISTS, IT IS CRAFTABLE, AND IT IS ITS OWN GUN ----
    const has = await page.evaluate(`(()=>{ const g=__hc.itemClasses().gunsAll; return { gun:g.indexOf('shotgun')>=0, suppressed:g.indexOf('shotgun_suppressed')>=0 }; })()`);
    check('the 12 gauge is a gun in the item table', has.gun, JSON.stringify(has));

    await page.evaluate(`(()=>{ for(let i=0;i<9;i++)__hc.qSet('inv',i,null); __hc.offhandSet(null); __hc.qSet('inv',0,'shotgun',1); })()`);
    await sleep(500);
    const s0 = await page.evaluate(`(()=>{ const s=__hc.sight(); return { mag:s.mag, id:__hc.viewDbg().id }; })()`);
    check('it comes loaded with five shells',        s0.mag===5, `mag ${s0.mag}`);
    check('and it draws its own model',              s0.id==='shotgun', `viewmodel id ${s0.id}`);

    // ---- IT FEEDS FROM SHELLS, NOT CARTRIDGES ----
    await page.evaluate(`(()=>{ __hc.shoot(); __hc.shoot(); })()`); await sleep(400);
    await page.evaluate(`__hc.giveItem('rifle_ammo',64)`);
    await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyR',bubbles:true}))`);
    await sleep(1200);
    const onlyRifle = await page.evaluate(`(()=>{ const s=__hc.sight(); return { mag:s.mag, reloadT:s.reloadT }; })()`);
    check('rifle cartridges do NOT load it',        onlyRifle.mag===3 && onlyRifle.reloadT===0, `mag ${onlyRifle.mag}, reloadT ${onlyRifle.reloadT}`);
    await page.evaluate(`__hc.giveItem('buckshot',16)`);
    await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyR',bubbles:true}))`);
    for(let i=0;i<40;i++){ const r=await page.evaluate(`+(__hc.sight().reloadT||0)`); if(r<=0) break; await sleep(150); }
    const fed = await page.evaluate(`(()=>{ const s=__hc.sight(); return { mag:s.mag }; })()`);
    check('buckshot DOES load it',                  fed.mag===5, `mag ${fed.mag}`);

    // ---- THE PUMP RACKS ONCE, AT THE END OF THE RELOAD ----
    await page.evaluate(`__hc.shoot()`); await sleep(200);
    // SAMPLED EVERY FRAME, FROM INSIDE THE PAGE, AND R PRESSED IN THE SAME EVALUATE.
    //
    // This polled 26 times at 120 ms from node, hoping the rack happened to fall inside one of those windows. The forend travels
    // and returns in a fraction of a second at the END of the reload, so the whole check rested on the animation overlapping a
    // sample -- a false FAILURE any time the reload timing shifted, on working code, with nothing in the output to say why.
    // A per-frame loop cannot miss it: the pump has no frame to move in that is not measured.
    //
    // The keypress moved inside too, for the reason the comment two blocks down already records: split across evaluates, frames
    // pass in between, and here those are exactly the frames the rack could happen in.
    //
    // It ends on STATE, not a duration -- reloadT going positive then back to zero, plus a tail for the rack that comes after it.
    const pump = await page.evaluate(`(async()=>{
      const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
      const z=[]; let sawReload=false, tail=0;
      document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyR',bubbles:true}));
      for(let i=0;i<900;i++){
        const v=(__hc.pumpZ?__hc.pumpZ():null); if(v!=null) z.push(v);
        const rt=+((__hc.sight()||{}).reloadT||0);
        if(rt>0) sawReload=true; else if(sawReload) tail++;
        if(sawReload && tail>120) break;
        await f(); }
      return { z, sawReload, frames:z.length }; })()`);
    const pumpZ=pump.z||[];
    const travel = pumpZ.length? Math.max(...pumpZ)-Math.min(...pumpZ) : 0;
    console.log('  forend travel over the reload: '+travel.toFixed(4)+' from '+pumpZ.length+' per-frame samples (reload seen: '+pump.sawReload+')');
    // If the reload never started, travel would read 0 and look like a broken pump. Say which of the two it is.
    check('the reload actually ran', pump.sawReload===true, `reloadT went positive: ${pump.sawReload}`);
    check('the forend is racked during the reload',  travel>0.03, `travel ${travel.toFixed(4)} over ${pumpZ.length} frames`);

    // ---- NINE PELLETS: measured as damage, close in, against the same shot far away ----
    // PLACE AND FIRE IN ONE EVALUATE. Split across two, the AI gets frames in between: measured, the creature walked from
    // 5 blocks to 2.99 and into FLEE, out of the ray, and BOTH the AR and the shotgun scored zero — a harness artefact that
    // looks exactly like broken damage. Nothing steps the game between the aim and the trigger this way.
    // THREE SHELLS PER RANGE, and the pattern is judged on the TOTAL. One shell is not a measurement: the creature is
    // placed on whatever ground is `dist` blocks ahead, and on a slope or behind a trunk the whole pattern can be eaten by
    // terrain — a single-shot version of this check read 108 damage on one run and 0 on the next with the same code.
    const shootAt = (dist) => page.evaluate(`(()=>{ if(!__hc.wretchAt) return {err:'no wretchAt hook'};
        const drops=[]; let set=null;
        for(let k=0;k<3;k++){ set=__hc.wretchAt(${dist}); if(set.err) return set;
          __hc.mag&&__hc.mag(5);
          const before=__hc.wretchHp(); __hc.shoot(); drops.push(before-__hc.wretchHp()); }
        return { dist:${dist}, set, drops, total:drops.reduce((a,b)=>a+b,0) }; })()`);
    const near = await shootAt(4);
    if(near.err){ check('the Wretch can be placed for the pattern test', false, near.err); }
    else {
      console.log('  point blank: '+JSON.stringify(near));
      check('a shell puts SEVERAL pellets into it', Math.max(...near.drops)>70, `drops ${near.drops.join(', ')} — no single projectile in the game exceeds 70`);
      const far = await shootAt(30);
      console.log('  at 30 blocks: '+JSON.stringify(far));
      check('the pattern opens with range',          far.total < near.total*0.7, `${far.total} total at 30 blocks against ${near.total} at 4`);
    }
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
