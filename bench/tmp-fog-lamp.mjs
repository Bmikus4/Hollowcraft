// WHAT DOES A NIGHT FOG BANK ACTUALLY DO TO A LAMP? — the measurement before the fix.
//
// Ben, 08-05: "light should be visible through nighttime black fog."
//
// The pieces are not obviously guilty and that is why this exists. The flame quad (flameMat) is additive with fog:false. The
// remembered-emitter halo (_lampReg / __hc.lampHalos) is additive with fog:false and sizeAttenuation:false. Neither is multiplied
// by the fog. What IS fogged is everything the lamp LIGHTS — the pool on the ground and the walls, which are atlas materials that
// three mixes toward scene.fog.color, and at night that colour is 0.0018/0.0022/0.0034, i.e. black. So the prediction is that the
// glow survives and the lit pool is erased, and the number that matters is at what distance.
//
// Measured per distance: the 99th percentile of the crop (the glow's own core, which a median would never see) and the median (the
// lit surroundings). Fog toggled at each station with nothing else changed, and the halo toggled separately so the two additive
// contributions can be told apart.
//
//   node bench/tmp-fog-lamp.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
function stat(file,px,py,r){
  const P=decodePNG(fs.readFileSync(file));
  const x0=Math.max(0,px-r)|0, x1=Math.min(P.w,px+r)|0, y0=Math.max(0,py-r)|0, y1=Math.min(P.h,py+r)|0;
  const v=[]; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) v.push(lum(P.data,(y*P.w+x)*P.ch));
  v.sort((a,b)=>a-b);
  return { med:+v[v.length>>1].toFixed(2), p99:+v[Math.min(v.length-1,(v.length*0.99)|0)].toFixed(2),
           max:+v[v.length-1].toFixed(2), warm:0 };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone();`);
    const S=await page.evaluate(`__hc.st()`);
    const LX=Math.round(S.sx), LZ=Math.round(S.sz);
    const LGY=await page.evaluate(`__hc.groundY(${LX},${LZ})`);
    await page.evaluate(`__hc.cmdRun('/setblock ${LX} ${LGY+1} ${LZ} lantern')`);
    // A pale surface under the lamp, so "what the lamp lights" is a real signal and not dark grass.
    await page.evaluate(`(()=>{ for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) __hc.cmdRun('/setblock '+(${LX}+dx)+' ${LGY} '+(${LZ}+dz)+' planks'); })()`);
    for(let i=0;i<20;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1200);
    console.log(`  lamp at ${LX},${LGY+1},${LZ}: blockAt ${JSON.stringify(await page.evaluate(`__hc.blockAt(${LX},${LGY+1},${LZ})`))}`);
    const pin=async(f)=>{ await page.evaluate(`__hc.setTime(0.94); __hc.fog(${f});`); await sleep(560); await page.evaluate(`__hc.setTime(0.94); __hc.fog(${f});`); await sleep(260); };
    for(const D of [20,45,80,140]){
      await page.evaluate(`__hc.tpAt(${LX}+0.5, ${LGY}+3.0, ${LZ}+${D}+0.5)`);
      for(let i=0;i<16;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(350); }
      await sleep(1000);
      let by=0,br=1e9;
      for(let i=0;i<48;i++){ const yaw=i*Math.PI/24; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.03})`); await sleep(45);
        const p=await page.evaluate(`__hc.screenOf(${LX}+0.5, ${LGY}+1.5, ${LZ}+0.5)`);
        if(p&&p.onScreen){ const r=Math.hypot(p.px-500,p.py-280); if(r<br){ br=r; by=yaw; } } }
      await page.evaluate(`__hc.cam({yaw:${by}, pitch:-0.03})`); await sleep(400);
      const sp=await page.evaluate(`__hc.screenOf(${LX}+0.5, ${LGY}+1.5, ${LZ}+0.5)`);
      if(!sp||!sp.onScreen){ console.log(`  d=${D}: lamp not on screen (r ${br.toFixed(0)}) — skipped`); continue; }
      const R=Math.max(24, Math.round(900/Math.max(6,D)));
      const rows=[];
      for(const [fg,hal,tag] of [[0,true,'clear'],[0.85,true,'fog'],[0.85,false,'fog,no halo'],[0,false,'clear,no halo']]){
        await page.evaluate(`__hc.lampHalos({on:${hal}})`); await pin(fg);
        const f=path.join(OUT,`foglamp-${D}-${tag.replace(/[ ,]/g,'')}.png`); await page.screenshot({path:f});
        rows.push(`${tag.padEnd(12)} ${JSON.stringify(stat(f,sp.px,sp.py,R))}`);
      }
      await page.evaluate(`__hc.lampHalos({on:true})`);
      const hl=await page.evaluate(`__hc.lampHalos({})`);
      console.log(`  d=${D}  crop r=${R} at ${sp.px|0},${sp.py|0}   halos live ${hl.live!=null?hl.live:JSON.stringify(hl).slice(0,80)}`);
      for(const r of rows) console.log(`      ${r}`);
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
