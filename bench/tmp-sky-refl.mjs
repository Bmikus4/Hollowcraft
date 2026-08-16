// IS THERE A SKY, AND IS THERE A REFLECTION — after a while in the game, not on the first frame.
//
// Ben 08-12: "I cannot see the sky Nor can I see any water reflections ... Stay in a game for longer than 12s when
// testing to verify this. if the sky has no clouds, or visible sun and is instead some white washed, it was not fixed."
// So the frame is taken after a full minute of running, and both questions are answered by numbers rather than by eye:
//
//   SKY      - the standard deviation of a sky crop. A sky with cloud and a sun disc in it has structure; a white wash
//              is flat, and flat is what a blown exposure or a dead dome looks like. Reported with its max, because a
//              wash also pins the max at 255.
//   REFLECT  - the same water crop with the mirror pass ON and OFF (__hc.ocean3Refl). If the two frames differ by
//              nothing, the reflection is contributing nothing, whatever the material says.
//
// Exposure and the uniform guard's log come with every row: a white frame with exposure 1.05 is a different fault from
// a white frame at 4.
//
//   node bench/tmp-sky-refl.mjs [page] [warmupSeconds]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const PAGE=process.argv[2]||'index.html';
const WARM=+(process.argv[3]||60);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
  let browser=null;
  try{
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/'+PAGE+'?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const IC=await page.evaluate(`__hc.isleStats()`), SEA=await page.evaluate(`__hc.island().sea`);
    // Out over open water looking back at the island: sky above, sea below, land in the middle for the mirror to catch.
    const x=IC.x-IC.R-80, z=IC.z;
    await page.evaluate(`__hc.tpAt(${x}, ${SEA}+16, ${z}); __hc.cam({yaw:${Math.atan2(-1,-0)}, pitch:-0.10}); __hc.freezeT(0); __hc.setTime(0.28)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    console.log(`  warming up ${WARM}s in game before the first frame`);
    await sleep(WARM*1000);
    const shot=async(tag)=>{
      await page.evaluate(`__hc.setTime(0.28)`); await sleep(500);
      const f=path.join(OUT,`skyrefl-${tag}.png`); await page.screenshot({path:f});
      const buf=fs.readFileSync(f).toString('base64');
      const s=await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
        await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const g=c.getContext('2d'); g.drawImage(im,0,0);
        const stat=(x,y,w,h)=>{ const d=g.getImageData(x,y,w,h).data; let s=0,s2=0,n=0,mx=0,px=[];
          for(let i=0;i<d.length;i+=4){ const L=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; s+=L; s2+=L*L; n++; if(L>mx)mx=L; px.push(L|0); }
          const m=s/n; return { mean:+m.toFixed(1), sd:+Math.sqrt(Math.max(0,s2/n-m*m)).toFixed(1), max:+mx.toFixed(0), px }; };
        return { sky:stat(60,40,1160,220), water:stat(300,395,680,110) }; })()`);
      const st=await page.evaluate(`(()=>{ const o={}; try{ o.exp=__hc.sceneState().exposure; }catch(e){}
        try{ o.nan=__hc.nanWatch().hits.length; }catch(e){} try{ o.o3=__hc.ocean3(); }catch(e){} return o; })()`);
      return { s, st, f };
    };
    await page.evaluate('__hc.ocean3Dbg(1)'); await sleep(1200); await shot('mirror-raw'); await page.evaluate('__hc.ocean3Dbg(0)'); await sleep(800);
    const on=await shot('refl-on');
    console.log(`  reflections ON   sky mean ${on.s.sky.mean} sd ${on.s.sky.sd} max ${on.s.sky.max}   water mean ${on.s.water.mean} sd ${on.s.water.sd}   exposure ${on.st.exp}  nanHits ${on.st.nan}`);
    await page.evaluate('__hc.ocean3Dbg(0,{mirror:0})'); await sleep(1500);
    const off=await shot('refl-off');
    console.log(`  reflections OFF  sky mean ${off.s.sky.mean} sd ${off.s.sky.sd} max ${off.s.sky.max}   water mean ${off.s.water.mean} sd ${off.s.water.sd}`);
    await page.evaluate('__hc.ocean3Dbg(0,{mirror:1})'); await sleep(1500);
    const on2=await shot('refl-on-repeat');
    console.log(`  reflections ON   (repeat, the noise floor)  water mean ${on2.s.water.mean} sd ${on2.s.water.sd}`);
    // How much of the water actually changed when the mirror pass was switched off.
    let diff=0, n=Math.min(on.s.water.px.length, off.s.water.px.length);
    for(let i=0;i<n;i++) diff+=Math.abs(on.s.water.px[i]-off.s.water.px[i]);
    let noise=0; for(let i=0;i<n;i++) noise+=Math.abs(on.s.water.px[i]-on2.s.water.px[i]);
    console.log(`\n  water pixels: mean |ON-OFF| ${(diff/n).toFixed(2)}   noise floor |ON-ON| ${(noise/n).toFixed(2)}`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
