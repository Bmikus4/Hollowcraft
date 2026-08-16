// WHY DOES THE VOLUMETRIC PASS NOT RUN AT THE PERF SITE IT WAS PRICED AT?
//
// bench/tmp-vol-select.mjs walks to a dungeon interior and finds air 1, one light chosen, and a beam worth 8.70 levels
// against a 0.18 noise floor. bench/perf-flag-ab.mjs at site dungeon_hall reports volLights 0 on BOTH sides of every
// pair - so three cost runs priced a pass that never ran once, and would have called it free.
//
// The two benches reach the dungeon by different routes and boot with different query strings, so the question is which
// half of the gate fails: _volAir (is the camera somewhere that knows it is interior) or the eligibility rule (is there
// a light within VOL_RANGE that clears the intensity floor). __hc.volLights().why answers it in one word, and the same
// probe walks the census helper's own path so the answer is about the site being priced rather than about some other
// dungeon.
//
//   node bench/tmp-vol-at-perf-site.mjs [siteName]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { SITES, HELPERS } from './perf-census.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const SITE=process.argv[2]||'dungeon_hall';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const site=SITES.find(s=>s.name===SITE); if(!site){ console.error('no such site: '+SITE); process.exit(1); }
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    // the SAME query string perf-flag-ab boots with, because ?perf=1 is itself a candidate explanation
    await page.goto(base+'/index.html?perf=1&debug=1&brseed=20260728',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`window.__hcPERF.arm(); window.__benchInfo=1;`);
    await page.evaluate(HELPERS);
    await page.evaluate(`(()=>{ ${site.setup}\n })()`);
    for(let i=0;i<60;i++){ const ok=await page.evaluate(`(()=>{const f=__hc.fill(); return f.meshed>=f.want;})()`); if(ok) break; await sleep(500); }
    await sleep((site.settle||4)*1000);
    const pos=await page.evaluate(`__hc.pos()`);
    // scene, inDungeon and BR are module-scoped in index.html - the __hc surface is the only way in from a bench, and
    // air is the sum of all three anyway: air 0 means neither interior test fired and the fog is clear-air.
    const fog=await page.evaluate(`(()=>{ try{ return __hc.fogInfo(); }catch(e){ return {err:String(e.message)}; } })()`);
    const vl=await page.evaluate(`__hc.volLights()`);
    const v=await page.evaluate(`__hc.vol()`);
    // The pool as the rule sees it: how many lights exist at all, and how far the nearest is. 'none eligible' with a
    // lantern six blocks away means the intensity floor or the frustum test, not the range.
    const pool=await page.evaluate(`(()=>{ try{ const L=__hc.lights(); return { point:L.point }; }catch(e){ return String(e.message); } })()`);
    console.log(`  site ${SITE}`);
    console.log(`  player  ${JSON.stringify({x:Math.round(pos.x),y:Math.round(pos.y),z:Math.round(pos.z)})}`);
    console.log(`  air     fog.density ${fog.density}   (clear-air floor 0.0016, a bank is ten times it)   -> air ${vl.air}`);
    console.log(`  rule    why "${vl.why}"   chosen ${vl.chosen.length}/${vl.budget}   range ${vl.range}   minI ${vl.minI}   pool ${vl.pool} (lights() ${JSON.stringify(pool)})`);
    console.log(`  reject  ${JSON.stringify(vl.rej)}`);
    console.log(`  pass    ${JSON.stringify(v)}`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
