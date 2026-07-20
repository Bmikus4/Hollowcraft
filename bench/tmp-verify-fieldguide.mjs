// FIELD GUIDE BOOK VERIFIER — the 2D overlay is dead; the guide is now the click-through held book.
//  A. field_guide is book:true, guide plumbing (toggleGuide/_guideEl) fully deleted
//  B. holding the guide shows the 3D book; right-click path turns pages; all pages bake without error
//  C. required content present: sulfur finding/cooking, gunpowder+ammo, water rite, wretch lore, live location log
//  D. dumps every page canvas to bench/results/fieldguide-page-N.png + one in-world screenshot
//   node bench/tmp-verify-fieldguide.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'bench', 'results');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>15000)rej(new Error('no server')); else setTimeout(poll,250); }); })(); }); }

(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try {
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const ctx = await browser.newContext({ viewport:{width:1280,height:720} });
    const page = await ctx.newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(() => { try { return window.__hc && __hc.st().started===true; } catch(e){ return false; } })()`, { timeout:90000 });
    await sleep(2000);
    const fails=[]; const ck=(name,cond,info)=>{ if(!cond) fails.push(name+' :: '+JSON.stringify(info)); };

    // A: overlay is gone, item is a book
    const a = await page.evaluate(`__hc.book()`);
    ck('toggleGuide deleted', a.guideGone===true, a);
    ck('field_guide is book:true', a.isBook===true && a.hasGuideFlag===false, a);
    ck('11 pages', a.pages===11, a);
    ck('still a starter item', a.starter===true, a);

    // B: hold it -> 3D book viewmodel; right-click turns the page
    await page.evaluate(`__hc.gun('field_guide')`); await sleep(500);
    const b = await page.evaluate(`__hc.book()`);
    ck('guide held as open book', b.held==='field_guide' && b.bookHeld===true, b);
    const p1 = await page.evaluate(`__hc.turnPage()`);
    ck('right-click turns the page', p1===(b.page+1)%11, {p0:b.page, p1});

    // C: required content present; bake + dump every page canvas
    for(const want of ['SULFUR','GUNPOWDER & AMMO','THE WATER RITE','THE WRETCH','LOCATION LOG','HOW TO LIVE'])
      ck('page exists: '+want, a.titles.includes(want), a.titles);
    for(const id of ['sulfur','sulfur_powder','flint','gunpowder','iron_ingot','rifle_ammo','bottle_dirty','bottle_water'])
      ck('flow icon uses '+id, a.flows.includes(id), null);
    for(let i=0;i<11;i++){
      await page.evaluate(`__hc.book(${i})`);
      const data = await page.evaluate(`__hc.bookPng()`);
      ck('page '+i+' baked a canvas', typeof data==='string' && data.length>2000, {i, len:data?data.length:0});
      if(data) fs.writeFileSync(path.join(OUT, 'fieldguide-page-'+i+'.png'), Buffer.from(data.split(',')[1], 'base64'));
    }
    const log = await page.evaluate(`__hc.book(10)`);
    ck('location log page bakes (fresh spawn = empty-state fallback)', log.page===10 && typeof log.logN==='number', log);

    // D: in-world screenshot on the sulfur page
    await page.evaluate(`__hc.book(6)`); await sleep(300);
    await page.screenshot({ path: path.join(OUT,'fieldguide-held.png') });

    ck('zero page errors', errors.length===0, errors);
    const pass = fails.length===0;
    console.log(JSON.stringify({ pass, fails, errors:errors.slice(0,5) }, null, 1));
    await browser.close();
    process.exit(pass?0:1);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
