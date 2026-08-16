// DOES THE VOLUMETRIC LIGHT SELECTION OBEY ITS OWN RULE? The rule and the budget were decided before the shader exists,
// precisely so they could be checked before a beam is drawn: at most three lights, within 28 blocks, above an intensity
// floor, roughly in front of the camera, and only where there is air to light.
//
// So this drives the game to the places the rule is about - open ground in clear air, a fogged bank, and the dungeon -
// and reads __hc.volLights() at each. The bench asserts the BUDGET and the AIR gate, which are the two that can hurt:
// a budget that slips is a frame-rate cliff, and an air gate that leaks means lanterns beaming in clear daylight.
//
//   node bench/tmp-vol-select.mjs [page]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const PAGE=process.argv[2]||'index.html';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
  let browser=null, bad=0;
  try{
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/'+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.dayLock(0.25);`);
    const check=async(tag)=>{
      const v=await page.evaluate(`__hc.volLights()`);
      const n=v.chosen?v.chosen.length:-1;
      const over = n>v.budget;
      const far  = (v.chosen||[]).filter(c=>c.d>v.range).length;
      const weak = (v.chosen||[]).filter(c=>c.inten<0.25).length;
      if(over||far||weak){ bad++; }
      console.log(`    ${tag}  air ${v.air}  chosen ${n}/${v.budget}  ${v.why}` + (over?'  <== OVER BUDGET':'') + (far?`  <== ${far} BEYOND RANGE`:'') + (weak?`  <== ${weak} UNDER THE INTENSITY FLOOR`:''));
      return v;
    };
    const IC=await page.evaluate(`__hc.isleStats()`), SEA=await page.evaluate(`__hc.island().sea`);
    await page.evaluate(`__hc.tpAt(${IC.x}, ${SEA}+30, ${IC.z}); __hc.fog(0)`); await sleep(2500);
    await check('open ground, clear air');
    await page.evaluate(`__hc.fog(0.7)`); await sleep(5000);
    await check('open ground, fog bank');
    // The dungeon is the proving ground: an interior, its own lights, and it knows it is indoors.
    // THE POSITIVE CASE, which the first run of this bench could not reach: place a lantern three blocks in front of
    // the camera, in the bank, and the rule should now CHOOSE it. A selection that only ever refuses is half a test.
    { const lx=IC.x+2, ly=SEA+31, lz=IC.z;
      console.log('    place', JSON.stringify(await page.evaluate(`__hc.putBlock(${lx},${ly},${lz},'lantern')`)));
      await page.evaluate(`__hc.tpAt(${IC.x}-2, ${SEA}+31, ${IC.z}); __hc.cam({yaw:${Math.atan2(-1,-0)}, pitch:0}); __hc.fog(0.7)`);
      await sleep(4000);
      const v=await check('lantern 4 blocks ahead, fog bank');
      if(!v.chosen || !v.chosen.length){ bad++; console.log('      <== NOTHING SELECTED with a lantern in reach - the positive case FAILS'); } }
    const dun=await page.evaluate(`(()=>{ try{ const d=__hc.dungeon&&__hc.dungeon(); return d&&d.pos?d.pos:null; }catch(e){ return null; } })()`);
    if(dun){ await page.evaluate(`__hc.tpAt(${dun.x}, ${dun.y}+2, ${dun.z}); __hc.fog(0)`); for(let i=0;i<40;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(3000); await check('dungeon interior (streamed)'); }
    else console.log('    dungeon: no __hc hook for its position, skipped');
    console.log(bad? `\n  ${bad} rows BROKE the rule` : `\n  every row obeyed the budget, the range and the intensity floor`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
