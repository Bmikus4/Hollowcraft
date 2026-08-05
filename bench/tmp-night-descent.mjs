// IS THERE ANY DARKNESS IN THIS GAME? Ben, 08-05: "even IN COVERED forests, closed non-lit spaces and caves there is NO
// darkness, just one consistent grey wash over an otherwise somehow lit game."
// Three places that must be dark and one that must not, at midnight, across the descent floor:
//   open night field / under a full canopy / inside a sealed stone box / the same box with a lantern in it.
// The floor sweep includes 1.0, which IS the pass as it was for every one of these except the sealed box — the old gate was
// `1.0-_open` and vSky is ~1 in all three of the first cases, because leaves and glass are not sky occluders.
// Reported per crop: mean luma, the mean MIN CHANNEL (the counter-metric — the wash preserves luma by construction, so luma
// cannot see it), the pure-black share, and the mean saturation, which is what must survive next to a lamp.
//   node bench/tmp-night-descent.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core'; import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// THE CROP SKIPS THE HUD, which is the brightest and most static thing in a night frame (the compass alone would carry a
// bench's whole result — this family has been fooled by it once already).
function shot(file){ const P=decodePNG(fs.readFileSync(file)); let s=0,mn=0,blk=0,sat=0,n=0;
  for(let y=90;y<420;y++) for(let x=140;x<860;x++){ const i=(y*P.w+x)*P.ch; const r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    const l=0.2126*r+0.7152*g+0.0722*b, lo=Math.min(r,g,b), hi=Math.max(r,g,b);
    s+=l; mn+=lo; sat+=hi>0?(hi-lo)/hi:0; if(l<8)blk++; n++; }
  return { lum:+(s/n).toFixed(2), min:+(mn/n).toFixed(2), black:+(100*blk/n).toFixed(1), sat:+(sat/n).toFixed(3) }; }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage(); page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:180000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); if(__hc.holdNone)__hc.holdNone();`);
    const S=await page.evaluate(`__hc.st()`);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(420); await page.evaluate(`__hc.setTime(${t})`); await sleep(200); };
    // ---- THE FOUR VANTAGES. Each returns a setup thunk run in the page; the sealed box is built out of stone around the eye.
    const vantages={
      field:`(()=>{ const st=__hc.st(); let gy=null; for(let y=120;y>0;y--){ if(__hc.blockAt(st.sx+40,y,st.sz+40)!==0){ gy=y+1; break; } }
        __hc.tpAt(st.sx+40.5, gy+1.7, st.sz+40.5); __hc.cam({yaw:0.7,pitch:-0.5}); return {gy}; })()`,
      canopy:`(()=>{ const st=__hc.st(); let best=null;
        // A COLUMN WITH LEAVES OVER IT, found rather than assumed: 'under a tree' is the whole vantage, and the wood is not
        // uniform. Walks out from spawn for a ground cell with at least three leaf cells in the twelve above it.
        for(let d=4; d<48 && !best; d+=2) for(let a=0; a<8 && !best; a++){
          const x=st.sx+Math.round(Math.cos(a*0.785)*d), z=st.sz+Math.round(Math.sin(a*0.785)*d);
          let gy=null; for(let y=120;y>0;y--){ if(__hc.blockAt(x,y,z)!==0){ gy=y+1; break; } } if(gy==null) continue;
          let lv=0; for(let k=1;k<=12;k++){ const b=__hc.blockAt(x,gy+k,z); if(b&&__hc.blockInfo&&__hc.blockInfo(b)&&/leaf|leaves/.test(__hc.blockInfo(b).name||'')) lv++; }
          if(lv>=3) best={x,z,gy,lv}; }
        if(!best) return {none:true};
        __hc.tpAt(best.x+0.5, best.gy+1.7, best.z+0.5); __hc.cam({yaw:0.4,pitch:-0.35}); return best; })()`,
      sealed:`(()=>{ const p=__hc.pos(); const bx=Math.round(p.x), by=Math.round(p.y), bz=Math.round(p.z);
        for(let dx=-3;dx<=3;dx++)for(let dy=-2;dy<=3;dy++)for(let dz=-3;dz<=3;dz++){
          const shell=(Math.abs(dx)===3||Math.abs(dz)===3||dy===-2||dy===3);
          __hc.cmdRun('/setblock '+(bx+dx)+' '+(by+dy)+' '+(bz+dz)+' '+(shell?'stone':'air')); }
        __hc.tpAt(bx+0.5, by+0.5, bz+0.5); __hc.cam({yaw:0.0,pitch:0.0}); return {bx,by,bz}; })()`,
      lantern:`(()=>{ const p=__hc.pos(); __hc.cmdRun('/setblock '+(Math.round(p.x)+1)+' '+(Math.round(p.y)-1)+' '+Math.round(p.z)+' lantern'); return {lit:true}; })()`
    };
    const FLOORS=[1.0, 0.15, 0.06, 0.02];
    for(const name of ['field','canopy','sealed','lantern']){
      const info=await page.evaluate(vantages[name]);
      await sleep(name==='sealed'?1600:1200); await pin(0.75);
      console.log(`  ${name}  ${JSON.stringify(info)}`);
      for(const fl of FLOORS){
        await page.evaluate(`__hc.scot({floor:${fl}})`); await sleep(260); await pin(0.75);
        const f=path.join(OUT,`descent-${name}-${fl}.png`); await page.screenshot({path:f});
        const s=shot(f);
        console.log(`    floor ${String(fl).padEnd(5)} lum ${String(s.lum).padStart(6)}  minChan ${String(s.min).padStart(6)}  black ${String(s.black).padStart(5)}%  sat ${s.sat}`);
      }
    }
    // ---- AND THE DAYLIGHT FRAME, which must not have moved at all: at day=1 the new gate collapses to the old one.
    await page.evaluate(`__hc.scot({floor:0.15})`);
    await page.evaluate(vantages.field); await sleep(1200); await pin(0.25);
    const df=path.join(OUT,'descent-day-field.png'); await page.screenshot({path:df});
    console.log(`  noon field: ${JSON.stringify(shot(df))}`);
    console.log('  frames bench/results/descent-*.png');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
