// WHERE DOES NIGHT WATER GO BLACK? Ben: "kelp and nighttime water is blackened when I am close to it at night".
// The first assert vantage (pitch -0.62, 3 blocks up) read median 34 with the fix OFF and looked BRIGHT teal — so it did not
// reproduce the report at all, and tuning against it would have been tuning against the wrong frame. The mechanism says the
// collapse is a VIEW-ANGLE one: F is 0.02 looking straight down and 1.0 at grazing, and min(F,uFresCap) is the only route the
// sky reflection has into the colour, so the steeper you look the more of the near-black depth constant you see. Close to water
// IS looking steeply down at it. This sweeps pitch at a low, close vantage and prints the water median with the term off and on,
// so the assert can be aimed at the angle that actually reproduces the bug rather than one that flatters the fix.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
function stat(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const L=[]; let R=0,G=0,B=0,n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    R+=r;G+=g;B+=b;n++; L.push(0.2126*r+0.7152*g+0.0722*b); }
  L.sort((a,b)=>a-b);
  return { med:+L[(L.length*0.5)|0].toFixed(2), black:+(100*L.filter(v=>v<3).length/L.length).toFixed(1),
           rgb:[+(R/n).toFixed(1),+(G/n).toFixed(1),+(B/n).toFixed(1)] };
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
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    const shore=await page.evaluate(`(()=>{ const W=__hc.bid('water'); let best=null;
      for(let a=0;a<24;a++){ const th=a*Math.PI/12;
        for(let d=10; d<=240; d+=2){ const x=Math.round(${S.sx}+Math.cos(th)*d), z=Math.round(${S.sz}+Math.sin(th)*d);
          let run=0; for(let k=0;k<7;k++){ const xx=Math.round(x+Math.cos(th)*k*2), zz=Math.round(z+Math.sin(th)*k*2);
            let wet=false; for(let y=38;y<=42;y++) if(__hc.blockAt(xx,y,zz)===W){ wet=true; break; }
            if(wet) run++; else break; }
          if(run>=6){ if(!best||d<best.d) best={d,x,z,th,g:__hc.groundY(x,z)}; break; } } }
      return best; })()`);
    console.log(`  shore ${JSON.stringify(shore)}`);
    const CROP=[0.36,0.64,0.52,0.78];
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(460); await page.evaluate(`__hc.setTime(${t})`); await sleep(200); };
    const shot=async tag=>{ const f=path.join(OUT,`nwangle-${tag}.png`); await page.screenshot({path:f}); return f; };
    // WELL OUT OVER OPEN WATER so the crop cannot catch the beach, and LOW, because "close to it" is a low eye a block or two
    // over the surface. CFG.SEA is 40.
    const wx=shore.x+Math.cos(shore.th)*24, wz=shore.z+Math.sin(shore.th)*24;
    // THE ARTEFACT IS SALT-AND-PEPPER, NOT A DIM SURFACE. The pitch sweep showed the MEDIAN never collapses (37-54 at every
    // angle) while the share of pure-black pixels climbs 2.5% -> 20.2% as the view steepens, and the frame
    // (nwangle-h41.6-p150-off.png) shows why: hard black square texels scattered through the water beside moonglade-lit ones.
    // On a facet where the ripple normal takes F toward 0 and the moon's lobe misses, col is the deep constant (~0.015 linear)
    // and AgX's toe takes that to zero, while its neighbour catches the glint and reads white. So the number to drive down is
    // BLACK PERCENT, and the cost to keep small is the median lift — amt 1 removed the black everywhere but took the median
    // 37 -> 59, which is a 60% brightening of the whole night sea and far more than the report asks for.
    await page.evaluate(`__hc.tpAt(${wx}, 41.6, ${wz})`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1500);
    for(const p of [-1.30,-0.70]){
      await page.evaluate(`__hc.cam({yaw:${shore.th+Math.PI}, pitch:${p}})`); await sleep(320); await pin(0.94);
      console.log(`\n  === pitch ${p.toFixed(2)} — the smallest in-scatter that kills the black texels ===`);
      for(const amt of [0,0.10,0.15,0.20,0.30,0.50,1.00]){
        await page.evaluate(`__hc.seaNight({amt:${amt}})`); await sleep(380);
        const s=stat(await shot(`amt-p${Math.abs(p*100)|0}-${String(amt).replace('.','p')}`),CROP);
        console.log(`    amt ${amt.toFixed(2)}  med ${String(s.med).padStart(6)}  black ${String(s.black).padStart(5)}%  rgb ${JSON.stringify(s.rgb)}`);
      }
    }
    console.log(`\n  Pick the smallest amt whose black percent is ~0, and report what it costs the median.`);
    console.log(`  frames: bench/results/nwangle-*.png`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
