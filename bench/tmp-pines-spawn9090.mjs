// BEN'S CALL, FROM SPAWN, READ OFF THE RULER: "at c288 90, and c96 -90 the pines should be placed."
//
// Those are world bearings +90 and -90 degrees, cells 288 and 96 of the 384 the mask holds, and they are the two
// FLANKS from spawn -- the coast running left and right -- which is where the treeline belongs and where there is
// none. This stands at spawn, prints what the mask actually holds on and around both cells, and photographs both.
//
//   node bench/tmp-pines-spawn9090.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    // THE LOOP SWALLOWS EXCEPTIONS AND FREEZES THE CANVAS while every probe keeps answering, which is how a dead
    // frame was read as a render fault for half a session. Watch for it explicitly.
    const errs=[];
    page.on('pageerror',e=>errs.push('THROW: '+String(e.message||e).slice(0,200)));
    page.on('console',m=>{ const t=m.text(); if(/\[loop\] exception|shader|VALIDATE|undeclared/i.test(t)) errs.push('CONSOLE: '+t.slice(0,200)); });
    await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.freezeT(0); __hc.setTime(0.25);`);
    // SPAWN, exactly: the game's own spawn is where it drops you, so just stay there and settle the world.
    for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(2500);
    const pos=await page.evaluate('__hc.pos()');
    console.log('spawn', JSON.stringify({x:+pos.x.toFixed(1),y:+pos.y.toFixed(1),z:+pos.z.toFixed(1)}));
    console.log('pines', JSON.stringify(await page.evaluate('__hc.pines()')));

    // WHAT THE MASK HOLDS ON BEN'S TWO BEARINGS, and either side of them, so "there is nothing there" can be told
    // apart from "there is something there and a gate is eating it".
    for(const [name,cell] of [['c96  (-90)',96],['c288 (+90)',288]]){
      const rows=await page.evaluate(`(()=>{ const o=[]; for(let d=-24; d<=24; d+=6){ const i=((${cell}+d)%384+384)%384;
        const c=__hc.pineCell(i); o.push({i, d, vis:c.vis, gh:c.gh, taper:c.taper, env:c.env}); } return o; })()`);
      console.log('  '+name);
      for(const r of rows) console.log(`     cell ${String(r.i).padStart(3)} (${r.d>=0?'+':''}${r.d})  vis ${String(r.vis).padStart(5)}  env ${String(r.env).padStart(5)}  taper ${String(r.taper).padStart(5)}  gh ${r.gh}`);
    }
    // AND THE TWO FRAMES. lookYaw for a world azimuth is the same expression pinesProbe uses.
    for(const [tag,az] of [['neg90',-Math.PI/2],['pos90',Math.PI/2]]){
      const yaw=Math.atan2(-Math.cos(az), -Math.sin(az));
      await page.evaluate('__hc.cam({yaw:'+yaw+', pitch:0});'); await sleep(1200);
      const f=path.join(OUT,`spawn-${tag}.png`); await page.screenshot({path:f});
      console.log(`  looking ${tag} (yaw ${yaw.toFixed(3)}) -> ${path.basename(f)}`);
    }
    console.log(errs.length? 'ERRORS: '+errs.slice(0,3).join(' | ') : 'no loop exceptions, canvas is live');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
