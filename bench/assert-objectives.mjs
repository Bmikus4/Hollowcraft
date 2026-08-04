// FIFTEEN OBJECTIVES, IN BEN'S ORDER, WITH THE NEXT AND THE LAST ONE IN THE TOP LEFT.
//
// Ben: "I want 15 clear objectives to help the player progress through the game, and it should be shown on a bar that is
// stored in the pause menu (to the left of the pause menu UI) and appears showing the next objective and the last objective
// in the top left."
//
// What is checked: the count, that the chain runs cabin -> exploring -> dungeon -> base -> kill the Wretch -> sacrifice ->
// Ceraphim -> Backrooms in that relative order, that a REAL condition ticks one (a torch in the bag, and the cabin under
// your feet — driven through the game, not through the tick hook), that the top-left shows both lines and advances, and that
// the pause overlay renders one row per objective to the left of the card.
//
// The ledger lives in localStorage on purpose, so this resets it first: a second run would otherwise start finished.
//
//   node bench/assert-objectives.mjs
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
    const page=await (await browser.newContext({viewport:{width:1600,height:900}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.objReset();`);
    await sleep(900);

    const o0 = await page.evaluate(`__hc.objectives()`);
    if(o0.err){ console.log('  '+o0.err); process.exit(1); }
    console.log('  chain: '+o0.ids.join(' -> '));
    check('there are fifteen objectives',            o0.n===15, `${o0.n}`);
    const at = id => o0.ids.indexOf(id);
    const spine = ['cabin','explore','lair','base','slay','god','seraph','backrooms'];   // his own sequence: cabin, exploring, the dungeon, a base, the Wretch, the sacrifice, the Ceraphim, the Backrooms
    // Ben's order, checked as RELATIVE positions: the filler objectives between his named ones may sit anywhere, but his
    // named ones must run in the sequence he gave them in.
    const ordered = spine.every((id,k)=>k===0 || (at(id)>=0 && at(spine[k-1])>=0 && at(id)>at(spine[k-1])));
    check("Ben's chain runs in his order",           ordered, spine.map(id=>id+'@'+at(id)).join(' '));
    check('the base objective exists and is buildable', at('base')>=0 && at('base')<at('slay'), `base@${at('base')} slay@${at('slay')}`);
    // "build a base" must NOT tick itself. It read the world's edit map, which worldgen and the intro have already filled
    // past forty before the player has placed anything — measured, it was ticked on the first poll of a new game.
    check('a new game has not already built a base', o0.got.indexOf('base')<0, `got ${o0.got.join(',')||'nothing'}`);
    const placed = await page.evaluate(`(()=>{ __hc.objPlace(40); return __hc.objectives(); })()`);
    await sleep(1200);
    const based = await page.evaluate(`__hc.objectives()`);
    check('forty placed blocks ticks the base',      based.got.indexOf('base')>=0, `placed ${based.placed}, got ${based.got.join(',')}`);

    // ---- the top-left tracker ----
    check('the tracker is on screen',                o0.hudShown, `display ${o0.hudShown}`);
    check('and it names the objective to do next',   !!o0.next && (o0.hudText||'').indexOf('OBJECTIVE')>=0, `"${(o0.hudText||'').replace(/\s+/g,' ')}"`);

    // ---- a REAL condition ticks one: put a torch in the bag ----
    const beforeTorch = await page.evaluate(`__hc.objectives()`);
    await page.evaluate(`__hc.giveItem('torch',1)`);
    await sleep(1400);
    const afterTorch = await page.evaluate(`__hc.objectives()`);
    check('carrying a torch ticks the fire objective', afterTorch.got.indexOf('torch')>=0, `got ${afterTorch.got.join(',')}`);
    check('and the tracker now shows it as DONE',      (afterTorch.hudText||'').indexOf('DONE')>=0, `"${(afterTorch.hudText||'').replace(/\s+/g,' ')}"`);
    check('the count advanced',                        afterTorch.done>beforeTorch.done, `${beforeTorch.done} -> ${afterTorch.done}`);

    // ---- standing in the cabin ticks the cabin, through the game's own predicate ----
    const tp = await page.evaluate(`(()=>{ const s=__hc.st(); if(s.sx==null) return {err:'no spawn recorded'};
      __hc.tpAt(s.sx+22, __hc.st().py+40, s.sz-14); return { x:s.sx+22, z:s.sz-14 }; })()`);
    if(tp.err) check('the cabin can be reached for this test', false, tp.err);
    else { await sleep(2200);
      const inCab = await page.evaluate(`__hc.objectives()`);
      check('standing at the cabin ticks it',        inCab.got.indexOf('cabin')>=0, `got ${inCab.got.join(',')}`);
    }

    // ---- the pause ledger, left of the card ----
    await page.evaluate(`(()=>{ if(typeof buildPauseSettings==='function') buildPauseSettings(); const p=document.getElementById('pause'); if(p)p.style.display='flex'; })()`)
      .catch(()=>page.evaluate(`document.exitPointerLock&&document.exitPointerLock()`));
    await sleep(800);
    const panel = await page.evaluate(`(()=>{ const o=__hc.objectives(), p=document.getElementById('objpanel'), card=document.querySelector('#pause > div:not(#objpanel)');
      const pr=p?p.getBoundingClientRect():null, cr=card?card.getBoundingClientRect():null;
      return { rows:o.panelRows, text:o.panelText, panelRight:pr?Math.round(pr.right):null, cardLeft:cr?Math.round(cr.left):null,
               visible:!!(pr&&pr.width>10) }; })()`);
    console.log('  ledger: '+JSON.stringify(panel));
    check('the pause ledger lists every objective',  panel.rows===o0.n, `${panel.rows} rows for ${o0.n} objectives`);
    check('and it sits LEFT of the pause card',      panel.panelRight!=null && panel.cardLeft!=null && panel.panelRight<=panel.cardLeft+2,
      `panel ends at ${panel.panelRight}, card starts at ${panel.cardLeft}`);
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
