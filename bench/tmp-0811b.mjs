// THE 08-11 SECOND PASS, measured: the held/icon copy of a model block wears the placed block's texture; Jesus and the
// monks have a body under the robe and hair with a map on it; a candle is tallow with a wick; the campfire has no stone
// ring and its light sits above the logs; the menu backdrop is the still key art and not a video.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
let checks=0, fails=0;
const ok=(n,c,d)=>{ checks++; if(!c){fails++; console.log('  FAIL  '+n+'   '+JSON.stringify(d)); } else console.log('  ok    '+n+'   '+JSON.stringify(d===undefined?null:d)); };
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  const errs=[], missed=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
    const page=await (await browser.newContext({viewport:{width:1100,height:660}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
    page.on('response',r=>{ if(r.status()>=400 && /assets\//.test(r.url())) missed.push(r.url().split('/').slice(-2).join('/')+' '+r.status()); });
    // ---- THE MENU BACKDROP, ON A PAGE THAT ACTUALLY SHOWS THE MENU ----
    // ?debug=1 sets `started` and hides #boot at boot (see the DEBUG auto-start), and the backdrop deliberately refuses to
    // appear once you are playing — so probing it on the debug page measures the auto-start, not the backdrop. Its own tab,
    // no debug flag, closed again before the real session starts.
    { const mp=await (await browser.newContext({viewport:{width:900,height:520}})).newPage();
      await mp.goto(base+'/index.html',{waitUntil:'load',timeout:90000});
      await mp.waitForFunction("(()=>{const v=document.getElementById('bgvid'); return v && v.naturalWidth>0;})()",null,{timeout:60000}).catch(()=>{});
      const bg=await mp.evaluate(`(()=>{ const v=document.getElementById('bgvid'), cs=getComputedStyle(v);
        return { tag:v.tagName, src:v.getAttribute('src')||null, shown:cs.display, z:+cs.zIndex,
                 w:v.naturalWidth||0, h:v.naturalHeight||0, bootUp:getComputedStyle(document.getElementById('boot')).display!=='none',
                 loadBg:getComputedStyle(document.getElementById('load')).backgroundImage.indexOf('keyart')>=0 }; })()`);
      console.log('  backdrop '+JSON.stringify(bg));
      ok('the menu backdrop is an image, not a video', bg.tag==='IMG', {tag:bg.tag});
      ok('the key art decoded',                        bg.w>1000 && bg.h>500, {w:bg.w,h:bg.h});
      ok('it is shown behind the menu',                bg.shown==='block' && bg.bootUp===true, {shown:bg.shown,bootUp:bg.bootUp});
      ok('it sits under the menu, over the canvas',    bg.z===19, {z:bg.z});
      ok('the loading screen carries it too',          bg.loadBg===true);
      await mp.screenshot({path:path.join(OUT,'menu-keyart.png')});
      await mp.close(); }

    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await sleep(3500);
    // On the debug page the menu was never up, so the backdrop must simply not be drawn — either torn down or never shown.
    ok('the backdrop is not drawn during play',
       (await page.evaluate("getComputedStyle(document.getElementById('bgvid')).display"))==='none');
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});

    // ---- THE COPY IN YOUR HAND wears what the placed block wears ----
    const held={};
    for(const id of ['fence','door','trapdoor','ladder','candle'])
      held[id]=await page.evaluate(`__hc.itemModelMats(${JSON.stringify(id)})`);
    console.log('  held  '+JSON.stringify(held));
    ok('held fence is barked',    (held.fence.parts||[]).some(p=>p.map==='log_side|0.34|0.34'), held.fence.parts);
    ok('held door is barked',     (held.door.parts||[]).some(p=>p.map==='log_side|1|1'),        held.door.parts);
    ok('held trapdoor is barked', (held.trapdoor.parts||[]).some(p=>p.map==='log_side|1|1'),    held.trapdoor.parts);
    ok('held ladder is barked',   (held.ladder.parts||[]).some(p=>p.map==='log_side|1|1'),      held.ladder.parts);
    // A CANDLE: wax with a map, and a second part dark enough to be a wick
    ok('held candle is tallow',   (held.candle.parts||[]).some(p=>p.map&&p.map.indexOf('candle')===0), held.candle.parts);
    ok('held candle has a wick',  (held.candle.parts||[]).some(p=>p.color==='#1a1410'),               held.candle.parts);

    // ---- THE PLACED CANDLE AND CAMPFIRE ----
    const laid=await page.evaluate(`(()=>{ const p=__hc.pos(), x0=Math.floor(p.x)+3, z0=Math.floor(p.z)+3, gy=Math.floor(__hc.groundY(x0+0.5,z0+0.5));
      return { x0, z0, y:gy, candle:__hc.setBlockAt(x0,gy,z0,'candle'), campfire:__hc.setBlockAt(x0+2,gy,z0,'campfire') }; })()`);
    await sleep(2500);
    const mats=await page.evaluate('__hc.placedMats(null,true)');
    const names=(mats.parts||[]).map(p=>p.col+' '+p.mapName);
    ok('the placed candle is tallow, not a lantern', names.some(n=>/candle\|/.test(n)) && !names.some(n=>/lantern\|/.test(n)&&/#ffffff/.test(n)),
       names.filter(n=>/candle\||lantern\|/.test(n)));
    ok('no cobble ring around the campfire', !names.some(n=>n==='#c1c2c7 cobble|1|1'), names.filter(n=>/cobble/.test(n)));
    // ember 2 IS the campfire (see the emitter's [4]); dy is the light's height above the cell floor, and the logs top out
    // at 0.25, so this number is the whole of "the flame illuminates its own wood".
    const emit=await page.evaluate('__hc.emitterProbe(8)');
    const fires=(emit.emitters||[]).filter(e=>e.ember===2);
    console.log('  emitters '+JSON.stringify({n:emit.n, fires}));
    ok('the campfire light sits above its logs (dy>0.25)', fires.length>0 && fires.every(e=>e.dy>0.25), fires);

    // ---- THE FIGURES ----
    await page.evaluate('__hc.cmdRun("/spawn monk")').catch(()=>{});
    await page.evaluate('__hc.cmdRun("/spawn jesus")').catch(()=>{});
    await sleep(1500);
    const rp=await page.evaluate('__hc.robeProbe()');
    console.log('  robes '+JSON.stringify(rp.robes));
    for(const who of ['jesus','monk']){ const r=(rp.robes||[]).find(x=>x.type===who);
      ok(who+' has a body under the robe', !!r && r.showsFeet===true, r&&{hemLo:r.hemLo,footLo:r.footLo,underHem:r.underHem});
      ok(who+' hair is textured',          !!r && r.hairParts>0,      r&&{hairParts:r.hairParts}); }

    await page.screenshot({path:path.join(OUT,'pass-0811b.png')});
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  if(missed.length) console.log('  MISSING ASSETS: '+JSON.stringify(missed.slice(0,5)));
  if(errs.length)   console.log('  page errors: '+JSON.stringify(errs.slice(0,5)));
  console.log((fails||errs.length||missed.length?'FAIL ':'PASS ')+(checks-fails)+'/'+checks+' checks');
  process.exit(fails||errs.length||missed.length?1:0);
})();
