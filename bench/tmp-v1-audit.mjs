// AUDIT OF THE v1 "CLOSED" LIST — measured, not read.
//
// The shrub item was closed against a wrong diagnosis by changing artwork instead of the stated Y offset, so the
// question is how many other closed items are like that. Grep alone cannot answer it: a first pass here reported
// "backpacks have no recipe" because it searched for out:'backpack' when the recipe is declared with shaped(), and
// "doorframes are gone" because the framed: flag was replaced by a separate BR.frames array. Presence of a string
// proves nothing either way. So each claim is turned into a NUMBER the game itself reports through its QA hooks.
// usage: node bench/tmp-v1-audit.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const OUT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/b81b0b86-2fc5-472c-bd08-724753d453f0/scratchpad';
fs.mkdirSync(OUT, { recursive:true });
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  const R={};
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl=`(()=>{try{const c=document.createElement('canvas');const g=c.getContext('webgl2')||c.getContext('webgl');if(!g)return 'NO';const e=g.getExtension('WEBGL_debug_renderer_info');return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):'?';}catch(e){return 'E';}})()`;
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,780']) });
      ctx=await browser.newContext({ viewport:{width:1280,height:720} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1&rd=6&brseed=987654', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`,null, {timeout:90000});
    await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null, {timeout:90000});

    // ---- #1 BACKPACKS: item exists, is CRAFTABLE by the real matcher, opens, and survives a save round-trip ----
    R.backpacks = await page.evaluate(`(()=>{
      const craft=__hc.canCraft('backpack');
      __hc.giveItem('backpack',1);
      const bp=__hc.backpack({id:'stick',n:3}, 0);
      const before=(bp.slots||[]).join(',');
      // REAL round-trip: write the save, wipe the live store, load it back, read the slots again. The first version
      // substring-searched saveInfo() for 'backpack', which saveInfo does not report at all — that would have been a
      // false FAIL on the one item whose spec called out the save format as the risk.
      __hc.save();
      __hc.backpack({id:'stone',n:1}, 1);                     // mutate AFTER saving, so a load must overwrite it
      const dirty=(__hc.backpack().slots||[]).join(',');
      const loaded=__hc.loadNow();
      const restored=(__hc.backpack().slots||[]).join(',');
      return { craftable:!!(craft&&craft.found&&craft.out), craftOut:craft&&craft.out, pattern:craft&&craft.pat,
               has:bp.has, beforeSave:before, dirtiedTo:dirty, loadResult:loaded, afterLoad:restored,
               roundTripOK: restored===before };
    })()`);
    console.log('#1 backpacks       ', JSON.stringify(R.backpacks));

    // ---- #6 TREE FOG: "BLACK at night, WHITE by day". fogInfo() already reports the pine-fog target and its
    // luminance, which is the exact quantity the claim is about — no need to infer it from a screenshot.
    R.treeFog = {};
    for(const [n,f] of [['day',0.42],['night',0.72]]){
      await page.evaluate(`__hc.setTime(${f})`); await sleep(1600);
      R.treeFog[n] = await page.evaluate(`__hc.fogInfo()`);
      console.log('#6 pine fog '+n.padEnd(6), JSON.stringify(R.treeFog[n]));
    }

    // ---- ARCHES + DOORFRAMES, inside the Backrooms, from the game's own registries ----
    await page.evaluate(`__hcBR.enter()`); await sleep(8000);
    R.rooms = await page.evaluate(`__hcBR.rooms()`);
    R.arches = await page.evaluate(`(()=>{ const a=__hcBR.arches();
      return { total:a.length, withDoor:a.filter(x=>x.doorInIt).length, withFrame:a.filter(x=>x.frameInIt).length,
               spans:a.slice(0,6).map(x=>x.span) }; })()`);
    R.doors = await page.evaluate(`__hcBR.doorFrames()`);
    console.log('   BR rooms        ', JSON.stringify(R.rooms));
    console.log('#9 arches          ', JSON.stringify(R.arches), '  <- Ben: arches must be ROUND with NO doors in them');
    console.log('#10 doors          ', JSON.stringify(R.doors), '  <- Ben: ALL actual doors need a doorframe');

    fs.writeFileSync(path.join(OUT,'v1-audit.json'), JSON.stringify(R,null,1));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
