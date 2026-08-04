// TWO GUNS, TWO HANDS, ONE RELOAD KEY.
//
// Ben, 2026-08-03, in three messages: "guns have lost thier reload animations"; "a loaded gun should still work in the
// offhand, right now it becomes unloaded and unusable"; "when left click mode is enabled for a gun both should fire with
// left and right click, also when reloaded, with an offhand gun, it should be reloaded, if both a main hand AND offhand
// gun, reload main hand gun first, when and if its loaded, then load the off hand gun with a consecutive R".
//
// Three separate defects sat behind those:
//   · a comment placed mid-line ate `view.reloadDur=...; view.reloadKey=...; view.reloadDef=...`, which killed the reload
//     animation AND made every reload cancel itself on the next frame;
//   · offUseActive() required an EMPTY main hand, so picking up one cartridge switched the offhand gun off;
//   · the mid-reload cancel compared the running reload against ONE hand, so an offhand reload died on its first frame.
// Each is checked as a state transition driven through the real key and mouse paths, not by reading a constant.
//
//   node bench/assert-dual-guns.mjs
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
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`__hc.lock(true)`);
    const K = code => page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{code:${JSON.stringify(code)},bubbles:true}))`);
    const mags = () => page.evaluate(`(()=>{ const g=__hc.mags?__hc.mags():null, s=__hc.sight(), o=__hc.offhandUse(), v=__hc.viewDbg();
      // offMag reads the OFFHAND gun's own magazine. sight().mag reads heldSlot(), which is the main hand whenever that
      // hand is full — the thing being tested here is that the offhand gun keeps ITS rounds while the main hand has an item.
      const om=(g&&g.offKey)?(g.all||[]).find(x=>x.split('=')[0]===g.offKey):null;
      return { main:o.held, off:o.off, offUse:o.offUse, active:o.active, mag:s.mag, offMag:om?+om.split('=')[1]:null,
               reloadT:s.reloadT, rot:v.rot, pos:v.pos, all:g&&g.all }; })()`);
    // POLL FOR THE STATE, NEVER FOR A DURATION (bench/README). A fixed sleep sized off the reload constant read the magazine
    // one step behind the game and reported three consecutive false failures on code that works.
    const waitReload = async (ms=8000) => { const t0=Date.now();
      for(;;){ const r=await page.evaluate(`+(__hc.sight().reloadT||0)`); if(r<=0) return true; if(Date.now()-t0>ms) return false; await sleep(150); } };
    // The gun ids come from the item table, not from memory: 'python' is not one, and the first version of this file spent
    // three checks proving that a nonexistent item does not fire.
    const GUNS = await page.evaluate(`__hc.itemClasses().gunsAll`);
    console.log('  guns in the table: '+GUNS.join(', '));
    const G1=GUNS[0], G2=GUNS.find(g=>g!==G1);

    // ---- 1. THE RELOAD ANIMATION EXISTS AT ALL ----
    await page.evaluate(`(()=>{ for(let i=0;i<9;i++)__hc.qSet('inv',i,null); __hc.offhandSet(null); __hc.qSet('inv',0,${JSON.stringify(G1)},1); __hc.giveItem('rifle_ammo',64); })()`);
    await sleep(400);
    // the capacity comes from the game, not from this file: magCap changed once already (the minigun's 100-round belt) and a
    // hardcoded 20 here would fail on a gun whose magazine is simply a different size.
    const CAP = await page.evaluate(`+__hc.sight().mag`);
    console.log(`  ${G1} carries ${CAP}; second gun ${G2}`);
    for(let i=0;i<3;i++){ await page.evaluate(`__hc.shoot()`); await sleep(120); }
    const rest = await page.evaluate(`__hc.viewDbg()`);
    await K('KeyR'); await sleep(700);
    const mid = await page.evaluate(`(()=>{ const v=__hc.viewDbg(), s=__hc.sight(); return { rot:v.rot, pos:v.pos, reloadT:s.reloadT }; })()`);
    console.log(`  rest rot ${JSON.stringify(rest.rot)} pos ${JSON.stringify(rest.pos)}`);
    console.log(`  mid-reload rot ${JSON.stringify(mid.rot)} pos ${JSON.stringify(mid.pos)} reloadT ${mid.reloadT}`);
    check('a reload is running',                     mid.reloadT>0, `reloadT ${mid.reloadT}`);
    // the animation rolls the gun inward (+z) and drops it — either alone is proof it is animating
    check('the gun MOVES during the reload',         Math.abs(mid.rot[2]-rest.rot[2])>0.05 || Math.abs(mid.pos[1]-rest.pos[1])>0.01,
      `rot.z ${rest.rot[2]} -> ${mid.rot[2]}, pos.y ${rest.pos[1]} -> ${mid.pos[1]}`);
    const finished = await waitReload();
    const done = await mags();
    check('the reload finishes',                     finished, `reloadT ${done.reloadT}`);
    check('and it fills the magazine',               done.mag===CAP, `mag ${done.mag} of ${CAP}`);

    // ---- 2. THE OFFHAND GUN SURVIVES A FULL MAIN HAND ----
    await page.evaluate(`__hc.shoot()`); await sleep(200);                       // one round down, so the magazine is identifiable
    await K('KeyF'); await sleep(300);                                           // gun → offhand, and the mode comes on with it
    // The second F press this used to need is gone (Ben 08-04: "left click still hits the fist of an empty fist when f was
    // pressed"). Moving the gun across empties the main hand, so the rule that the mode is only for an empty hand is now asked
    // of the hand as it IS after the move — one press arms the left trigger, and a second one would disarm it again.
    const off1 = await mags(); console.log('  in the offhand:', JSON.stringify({off:off1.off,mag:off1.mag,active:off1.active}));
    check('the offhand gun keeps its magazine',      off1.offMag===CAP-1, `offhand mag ${off1.offMag}, was ${CAP-1}`);
    await page.evaluate(`__hc.qSet('inv',0,'stone',8)`); await sleep(300);        // THE OLD BUG: anything here switched the mode off
    const off2 = await mags();
    check('a full main hand does not disarm it',     off2.offMag===CAP-1, `offhand mag ${off2.offMag} with a block in the right hand`);
    const clicked = await page.evaluate(`__hc.offhandClick()`); await sleep(250);
    const off3 = await mags();
    check('left click still fires it',               off3.offMag===CAP-2, `offhand mag ${off2.offMag} -> ${off3.offMag} (${JSON.stringify(clicked.routed||clicked)})`);

    // ---- 3. TWO GUNS: RIGHT CLICK FIRES THE MAIN ONE, R RELOADS THE MAIN ONE FIRST ----
    await page.evaluate(`__hc.qSet('inv',0,${JSON.stringify(G2)},1)`); await sleep(350);   // a SECOND gun in the right hand, the first still in the left
    const two0 = await mags();
    await page.evaluate(`document.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}))`); await sleep(300);
    const two1 = await mags();
    console.log('  two guns, after a right click:', JSON.stringify({all:two1.all}));
    const magOf = (all,pre)=>{ const r=(all||[]).find(s=>s.startsWith(pre)); return r?+r.split('=')[1]:null; };
    check('right click fires the MAIN hand gun',     JSON.stringify(two0.all)!==JSON.stringify(two1.all), `${JSON.stringify(two0.all)} -> ${JSON.stringify(two1.all)}`);
    await K('KeyR'); await waitReload();                                         // the main hand is short → it reloads FIRST
    const two2 = await mags(); console.log('  after the first R:', JSON.stringify(two2.all));
    await K('KeyR'); await waitReload();                                         // now the main hand is full → the offhand's turn
    const two3 = await mags(); console.log('  after the second R:', JSON.stringify(two3.all));
    check('R reloads the main hand first, the offhand second',
      JSON.stringify(two2.all)!==JSON.stringify(two1.all) && JSON.stringify(two3.all)!==JSON.stringify(two2.all),
      `${JSON.stringify(two1.all)} -> ${JSON.stringify(two2.all)} -> ${JSON.stringify(two3.all)}`);
    const errs = await page.evaluate(`window.__errCount||0`);
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
