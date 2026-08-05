// WHAT DOES A SEALED BOX'S INTERIOR ACTUALLY MEASURE? — the diagnostic behind assert-cave-black's first run.
//
// That run said the interior of a fully sealed stone box reads 37 of 255 at NOON with the wash not firing at all (the floor A/B
// moved nothing), and 36 -> 30 at midnight where a full descent should land near 10. Both are explained by ONE number: the
// baked sky term on those faces. If vSky is ~0.8 inside a sealed box then the gate says "lit" at noon (vSky*uDay > uScotHi) and
// the descent, which is multiplied by (1-vSky), is scaled down to a fifth at midnight.
//
// So this prints the three gate views over the same crop instead of reasoning about the mesher: ?dbg=sky (the baked per-face
// skylight), ?dbg=lit (delivered direct light) and ?dbg=cave (the descent gate itself). Grey 255 = 1.0 in all three.
//
//   node bench/tmp-cave-gate.mjs
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
function med(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const v=[]; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch; v.push((P.data[i]+P.data[i+1]+P.data[i+2])/3); }
  v.sort((a,b)=>a-b);
  return { med:+v[v.length>>1].toFixed(1), p10:+v[(v.length*0.1)|0].toFixed(1), p90:+v[(v.length*0.9)|0].toFixed(1) };
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
    const FY=96, RY=102, WALL=[0.34,0.66,0.32,0.62];
    const run=async(qs,label)=>{
      const page=await ctx.newPage();
      page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
      await page.goto(base+'/index.html?debug=1&rd=8'+qs,{waitUntil:'load',timeout:120000});
      await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:300000});
      await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:420000});
      await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
      const S=await page.evaluate(`__hc.st()`); const BX=Math.round(S.sx)+6, BZ=Math.round(S.sz);
      await page.evaluate(`(()=>{
        for(let dx=-1;dx<10;dx++) for(let dz=-5;dz<=5;dz++){
          __hc.cmdRun('/setblock '+(${BX}+dx)+' ${FY} '+(${BZ}+dz)+' stone');
          __hc.cmdRun('/setblock '+(${BX}+dx)+' ${RY} '+(${BZ}+dz)+' stone'); }
        for(let dz=-5;dz<=5;dz++) for(let y=${FY}+1;y<${RY};y++){
          __hc.cmdRun('/setblock '+(${BX}+9)+' '+y+' '+(${BZ}+dz)+' stone');
          __hc.cmdRun('/setblock '+(${BX}-1)+' '+y+' '+(${BZ}+dz)+' stone'); }
        for(let dx=-1;dx<10;dx++) for(let y=${FY}+1;y<${RY};y++){ __hc.cmdRun('/setblock '+(${BX}+dx)+' '+y+' '+(${BZ}-5)+' stone');
          __hc.cmdRun('/setblock '+(${BX}+dx)+' '+y+' '+(${BZ}+5)+' stone'); }
      })()`);
      for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
      await sleep(2000);
      await page.evaluate(`__hc.holdNone(); __hc.tpAt(${BX}+2.5, ${FY}+3.2, ${BZ}+0.5); __hc.cam({yaw:-1.5708, pitch:0.0});`);
      await sleep(700);
      for(const [t,tag] of [[0.25,'noon'],[0.75,'midnight']]){
        await page.evaluate(`__hc.setTime(${t})`); await sleep(500); await page.evaluate(`__hc.setTime(${t})`); await sleep(260);
        const f=path.join(OUT,`cavegate-${label}-${tag}.png`); await page.screenshot({path:f});
        console.log(`  ${label.padEnd(6)} ${tag.padEnd(9)} ${JSON.stringify(med(f,WALL))}`);
      }
      // the mesher's own number for the face in front of the camera, straight out of the game
      const probe=await page.evaluate(`(function(){ try{ return { face:__hc.skyAt?__hc.skyAt(${BX}+8,${FY}+3,${BZ}):null,
        blk:__hc.blockAt(${BX}+8,${FY}+3,${BZ}), air:__hc.blockAt(${BX}+7,${FY}+3,${BZ}) }; }catch(e){ return {err:String(e.message||e)}; } })()`);
      console.log(`  ${label} probe ${JSON.stringify(probe)}`);
      await page.close();
    };
    await run('&dbg=sky','sky'); await run('&dbg=lit','lit'); await run('&dbg=cave','cave'); await run('','graded');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
