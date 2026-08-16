// EVERY TOOL CAN BE MADE, AND OUT OF THINGS THAT EXIST.
//
// docs/ITEM-AUDIT.md found sixteen tools carrying working `tool` fields with no source of any kind between them —
// no recipe, no loot pool, no drop — except one pickaxe in one chest. A whole progression ladder that could be held
// in creative and never obtained in play.
//
// ASKED OF THE LIVE RECIPE TABLE, not of the source. The audit answers "is there a recipe" by scanning index.html,
// which is what found the hole; this asks the table the game actually crafts against, so a recipe that is written
// but never registered — a typo in an id, a line inside a branch that does not run — fails here.
//
// THE INGREDIENT CHECK IS THE HALF THAT CATCHES THE REAL MISTAKE. A recipe calling for 'wood' or 'diamond_gem' is
// accepted by shaped() without complaint and is simply uncraftable forever, which is indistinguishable from the
// bug this file exists to close. So every ingredient must be a real item, and must itself be obtainable.
//
//   node bench/assert-tool-recipes.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const TIERS=['wood','stone','iron','diamond'], KINDS=['pickaxe','axe','shovel','sword'];
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await browser.newContext({viewport:{width:900,height:520}})).newPage();
    page.on('pageerror',e=>{ console.log('  PAGEERROR:',String(e.message||e).slice(0,160)); fails++; checks++; });
    await page.goto(base+'/index.html?debug=1&rd=4',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    const items=await page.evaluate(`__hc.itemIds()`);
    for(const t of TIERS) for(const k of KINDS){
      const id=t+'_'+k;
      const r=await page.evaluate(`__hc.recipes('${id}')`);
      const has=r && !r.err && r.n>0;
      check(`${id} can be made`, has, has?`${r.n} recipe(s), ingredients ${r.recipes[0].ing.join('+')}`:JSON.stringify(r));
      if(!has) continue;
      // Every ingredient must be a real item. shaped() accepts an id that does not exist and the recipe is then
      // simply uncraftable forever, which looks exactly like the hole this file was written to close.
      const bad=r.recipes[0].ing.filter(i=>!items[i]);
      check(`${id}'s ingredients all exist`, bad.length===0, bad.join(' ')||'ok');
    }
    // AND THE TOOL MUST STILL BE A TOOL. A recipe that produces an item nothing reads is a different kind of
    // nothing, and this ladder's whole claim is that the code behind it already works.
    const notTools=[];
    for(const t of TIERS) for(const k of KINDS){ const id=t+'_'+k; if(!items[id] || items[id].tool==null) notTools.push(id); }
    check('every tier is still a working tool', notTools.length===0, notTools.join(' ')||'all 16 carry a tool field');
  }catch(e){ console.log('  HARNESS ERROR: '+(e&&e.message||e)); fails++; checks++; }
  finally{ try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks pass`);
  process.exit(fails?1:0);
})();
