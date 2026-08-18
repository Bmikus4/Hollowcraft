// WHICH BEARINGS THE HORIZON BAND ACTUALLY OCCUPIES, from the four shore vantages Ben judges it from. Seven rejections
// have argued about size and colour; this asks the prior question - is it even drawn where he is looking. Per side it
// prints the mask's own presence/envelope/ground at the LOOK bearing and at +/-30/60/90 degrees off it, and shoots the
// dbg=2 frame that paints magenta wherever the band survived every geometric gate.
//
//   node bench/tmp-pines-where.mjs
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
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.freezeT(0); __hc.setTime(0.25);`);
    const IC=await page.evaluate('__hc.isleStats()'); const SEA=await page.evaluate('__hc.island().sea');
    console.log('  island', JSON.stringify(IC), 'sea', SEA, 'pines', JSON.stringify(await page.evaluate('__hc.pines()')));
    const SIDES=[['W',-1,0],['E',1,0],['N',0,-1],['S',0,1]];
    for(const [name,dx,dz] of SIDES){
      const found=await page.evaluate(`(()=>{ const cx=${IC.x}, cz=${IC.z};
        for(let d=Math.round(${IC.R}*2.2); d>30; d-=1){ const x=Math.round(cx+${dx}*d), z=Math.round(cz+${dz}*d);
          if(__hc.groundY(x,z)>${SEA}) return {x,z,g:__hc.groundY(x,z),d}; }
        return null; })()`);
      if(!found) { console.log(`  ${name}: no shore`); continue; }
      const yaw=Math.atan2(-dx,-dz);
      await page.evaluate(`__hc.tpAt(${found.x}+0.5, ${found.g}+1, ${found.z}+0.5); __hc.cam({yaw:${yaw}, pitch:0});`);
      for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(2500);
      // The mask row, read at the bearings this vantage is actually looking along. az is the mask's own convention:
      // atan2(dz,dx) over the outward direction, so 0 off is dead ahead.
      const row=await page.evaluate(`(()=>{ const out=[]; const az0=Math.atan2(${dz},${dx});
        for(const off of [0,30,60,90,120,180]){ for(const s of (off===0||off===180?[1]:[1,-1])){
          const az=az0+s*off*Math.PI/180; let i=Math.round(((az+Math.PI)/(2*Math.PI))*384)%384; if(i<0) i+=384;
          const c=__hc.pineCell?__hc.pineCell(i):null; out.push({off:s*off, i, c}); } }
        return out; })()`);
      console.log(`  ${name} shore(${found.x},${found.z}) g=${found.g}`);
      for(const r of row) console.log(`    ${String(r.off).padStart(5)} deg  cell ${String(r.i).padStart(3)}  ${JSON.stringify(r.c)}`);
      await page.evaluate('__hc.pinesAll(2)'); await sleep(700);
      await page.screenshot({path:path.join(OUT,`pw-${name}-dbg2.png`)});
      await page.evaluate('__hc.pinesAll(0)'); await sleep(500);
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
