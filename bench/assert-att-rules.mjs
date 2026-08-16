// BEN'S THREE QUESTIONS ABOUT THE ATTACHMENT SYSTEM, AS ASSERTIONS.
//   1. Are ALL guns modular, or only the ones that were tested?
//   2. Can any attachment fit any gun WITHIN REASON, and is "within reason" enforced?
//   3. Is it ONE attachment per slot, and is that enforced rather than assumed?
//
// The full table lives in bench/tmp-att-matrix.mjs and bench/results/att-matrix.json. This file is the part that
// must not silently change: the counts, the rule, and the refusals.
//
// WHY THE COUNTS ARE PINNED. "18 of 23 guns take everything" was true this morning and it was true because the rule
// was returning true for anything it had no opinion about — every pistol in the game accepted an underbarrel
// foregrip. A count that nobody asserts is a count nobody notices moving.
//
//   node bench/assert-att-rules.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// The five guns with no rail and the two with no model at all. Named, not counted, so a gun QUIETLY losing its rail
// is a failure with a name in it rather than a number that moved by one.
const NO_OPTIC=['chassis_rifle','forest_rifle','hunting_rifle','marksman_rifle','minigun'];
const NO_MODEL=['hunting_rifle','minigun'];
const HANDGUNS=['flare_gun','machine_pistol','pistol','pistol_compact','pistol_heavy','pistol_target',
                'revolver','revolver_rail','revolver_snub','sawn_off'];
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:900,height:520}})).newPage();
    page.on('pageerror',e=>{ console.log('  PAGEERROR:',String(e.message||e).slice(0,160)); fails++; checks++; });
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1&rd=4',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative');`);
    const M=await page.evaluate(`__hc.attMatrix()`);
    check('the matrix can be read at all', !M.err, M.err||`${M.guns} guns`);
    const row=g=>M.rows.find(r=>r.gun===g);

    // ---- 1. ARE ALL GUNS MODULAR ----
    console.log(`\n  ${M.guns} guns, ${M.atts.length} attachments`);
    check('every gun in the game is in the answer, not just the tested ones', M.guns>=23, `${M.guns} guns`);
    for(const g of NO_MODEL) check(`${g} has NO mounting points and takes nothing`, row(g) && row(g).n===0, row(g)?`n=${row(g).n}`:'missing');
    for(const g of NO_OPTIC) check(`${g} has no rail, so no optic fits it`, row(g) && !row(g).fits.red_dot, row(g)?`red_dot ${row(g).fits.red_dot}`:'missing');
    const full=M.rows.filter(r=>r.n===M.atts.length);
    console.log('  takes everything: '+full.map(r=>r.gun).join(' '));
    check('a long gun with a rail takes all seven', row('ar15') && row('ar15').n===7, row('ar15')?`ar15 n=${row('ar15').n}`:'missing');

    // ---- 2. IS "WITHIN REASON" ENFORCED ----
    // Ben's own example, both halves: a revolver refuses a foregrip and accepts a dot and a suppressor.
    const rv=row('revolver');
    check('A REVOLVER REFUSES A FOREGRIP', rv && rv.fits.foregrip===false, rv?`foregrip ${rv.fits.foregrip}`:'missing');
    check('and it still takes a dot sight', rv && rv.fits.red_dot===true, rv?`red_dot ${rv.fits.red_dot}`:'missing');
    check('and a suppressor', rv && rv.fits.suppressor===true, rv?`suppressor ${rv.fits.suppressor}`:'missing');
    check('AN AR TAKES ANYTHING', row('ar15') && M.atts.every(a=>row('ar15').fits[a]), 'all seven');
    for(const g of HANDGUNS){ const r=row(g); check(`${g} refuses an underbarrel grip`, r && r.fits.foregrip===false, r?`foregrip ${r.fits.foregrip}`:'missing'); }
    check('every long gun with a handguard still takes one', ['ak','smg','shotgun','bullpup'].every(g=>row(g)&&row(g).fits.foregrip), 'ak smg shotgun bullpup');
    // A REFUSAL MUST SAY WHY. Silently accepting and silently dropping are the two failures the instruction named,
    // and a rule with no reason attached is indistinguishable from the second one at the point of use.
    check('and the refusal carries a reason', rv && typeof rv.why.foregrip==='string' && rv.why.foregrip.length>8, rv&&rv.why.foregrip);
    console.log('  reason given: "'+(rv&&rv.why.foregrip)+'"');

    // ---- 3. ONE PER SLOT, PROVED BY TRYING TO FIT TWO ----
    // Structurally it is keyed by slot, which is an argument rather than a test. So: fit a red dot, fit a holo
    // sight over it, and count the optics on the gun afterwards.
    // THE SLOT IS A NAME, NOT AN INDEX. The first version of this passed 0, which created a slot called "0" holding
    // one attachment at a time — and then reported that a suppressor evicts an optic, which is a bug in the test
    // that reads exactly like a bug in the game.
    await page.evaluate(`__hc.hold('ar15')`); await sleep(300);
    const one=await page.evaluate(`__hc.attFit('optic','red_dot')`);
    const two=await page.evaluate(`__hc.attFit('optic','holo_sight')`);
    const W=await page.evaluate(`(()=>{ const p=__hc.attProbe(); return JSON.parse(JSON.stringify(p.wearing||{})); })()`);
    console.log('  after fitting red_dot then holo_sight: '+JSON.stringify(W));
    const optics=Object.values(W).filter(v=>v==='red_dot'||v==='holo_sight').length;
    check('TWO OPTICS CANNOT BE FITTED AT ONCE', optics===1, `${optics} optics on the gun: ${JSON.stringify(W)}`);
    check('and the second one replaced the first rather than being ignored', W.optic==='holo_sight', `optic slot holds ${W.optic}`);
    // The other slots are untouched by that, which is what makes it one per SLOT rather than one per gun.
    await page.evaluate(`__hc.attFit('muzzle','suppressor')`);
    const W2=await page.evaluate(`(()=>{ const p=__hc.attProbe(); return JSON.parse(JSON.stringify(p.wearing||{})); })()`);
    check('a muzzle device does not evict the optic', W2.optic==='holo_sight' && W2.muzzle==='suppressor', JSON.stringify(W2));
  }catch(e){ console.log('  HARNESS ERROR: '+(e&&e.message||e)); fails++; checks++; }
  finally{ try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks pass`);
  process.exit(fails?1:0);
})();
