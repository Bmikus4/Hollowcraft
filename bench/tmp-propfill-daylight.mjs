// WHAT ELSE DID THE PROP FILL TOUCH? It is on every non-atlas lit material in the game, so the two frames that can regress
// are open sunlit ground (blocks excluded, so nothing should move) and the VIEWMODEL, which is a prop held 40 cm from the eye.
//   node bench/tmp-propfill-daylight.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core'; import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const stat=(file,cx,cy,w,h)=>{ const P=decodePNG(fs.readFileSync(file)); let s=0,n=0;
  for(let y=cy;y<cy+h;y++) for(let x=cx;x<cx+w;x++){ const i=(y*P.w+x)*P.ch; s+=0.2126*P.data[i]+0.7152*P.data[i+1]+0.0722*P.data[i+2]; n++; }
  return +(s/n).toFixed(2); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    const page=await ctx.newPage(); page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,160)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:180000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.hold('ar15'); __hc.cam({yaw:0.6, pitch:-0.1});`);
    const S=await page.evaluate(`__hc.st()`);
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, 96, ${S.sz}+0.5)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    const pin=async()=>{ await page.evaluate(`__hc.setTime(0.25)`); await sleep(400); await page.evaluate(`__hc.setTime(0.25)`); await sleep(200); };
    for(const [tag,set] of [['off',`__hc.propFill({on:false})`],['on',`__hc.propFill({k:0.30})`]]){
      await page.evaluate(set); await sleep(300); await pin();
      const f=path.join(OUT,`propfill-${tag}.png`); await page.screenshot({path:f});
      console.log(`  ${tag}: whole frame ${stat(f,0,0,1000,470)}   sky-free ground band ${stat(f,120,300,760,120)}   viewmodel ${stat(f,700,330,280,150)}`);
    }
    // ---- AND THE FOREST FLOOR, which is where Ben saw the "random dark/black blocks". The floor itself is atlas voxels and is
    // excluded from the fill; what stands ON it -- ground cover, mushrooms, stones, every cat:'model' block -- is a prop in
    // canopy shade, so if those were the black things, they change here and the ground does not.
    await page.evaluate(`__hc.holdNone&&__hc.holdNone()`);
    const at=await page.evaluate(`(()=>{ const st=__hc.st(); let gy=null; for(let y=120;y>0;y--){ if(__hc.blockAt(st.sx+6,y,st.sz+6)!==0){ gy=y+1; break; } }
      __hc.tpAt(st.sx+6.5, gy+1.7, st.sz+6.5); __hc.cam({yaw:0.9, pitch:-0.55}); return {gy}; })()`);
    await sleep(1400);
    for(const [tag,set] of [['floor-off',`__hc.propFill({on:false})`],['floor-on',`__hc.propFill({k:0.30})`]]){
      await page.evaluate(set); await sleep(300); await pin();
      const f=path.join(OUT,`propfill-${tag}.png`); await page.screenshot({path:f});
      const P=decodePNG(fs.readFileSync(f)); let blk=0,n=0;
      for(let y=120;y<440;y++) for(let x=60;x<940;x++){ const i=(y*P.w+x)*P.ch; const l=0.2126*P.data[i]+0.7152*P.data[i+1]+0.0722*P.data[i+2]; n++; if(l<8) blk++; }
      console.log(`  ${tag}: floor crop ${stat(f,60,120,880,320)}   pure-black share ${(100*blk/n).toFixed(2)}%   (ground at y=${at.gy})`);
    }
    console.log('  frames bench/results/propfill-*.png');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
