// DOES THE HORIZON MOVE WHEN YOU DO — measured, because a still frame cannot show parallax and neither can two stills
// looked at by eye.
//
// The method isolates the backdrop before it measures it. At each of two camera positions the frame is grabbed twice,
// with the pines on and off, and the two are subtracted: what is left is a one-dimensional profile of where the coast
// pines put light in that frame and nothing else - no terrain, no sea, no sky, all of which move for their own reasons.
// The two profiles are then cross-correlated over horizontal shifts, and the peak is how far the coast slid.
//
// What the answer should be, if the parallax is real: a feature at distance d, seen from a camera moved L blocks
// perpendicular to the line of sight, shifts by L/d radians, which is (L/d) * width/fov pixels. At render distance 10
// the near band stands at 160 blocks and the far at 736, so a 15-block step should move them about 115 and 25 pixels.
// A skybox moves 0. Those three numbers are far enough apart that the measurement cannot be ambiguous.
//
//   node bench/tmp-parallax.mjs [page] [lateralBlocks]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const PAGE=process.argv[2]||'index.html';
const STEP=+(process.argv[3]||15);
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
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.dayLock(0.25); __hc.fog(0);`);
    const IC=await page.evaluate(`__hc.isleStats()`), SEA=await page.evaluate(`__hc.island().sea`);
    // On the beach, looking 45 degrees off dead-seaward so the coast band crosses the frame rather than hugging its edge,
    // and stepping PERPENDICULAR to that line of sight, which is the direction that produces bearing change rather than
    // range change.
    const shore=await page.evaluate(`(()=>{ const cx=${IC.x}, cz=${IC.z};
      for(let d=Math.round(${IC.R}*1.5); d>40; d-=1){ const x=cx-d, g=__hc.groundY(x,cz); if(g>${SEA}) return {x,z:cz,g}; }
      return null; })()`);
    const yaw=Math.atan2(1,-0)+Math.PI/4;
    const fwd={x:-Math.sin(yaw), z:-Math.cos(yaw)};
    const per={x:-fwd.z, z:fwd.x};                       // perpendicular to the view, in world XZ
    const grab=async(tag)=>{
      const f=path.join(OUT,`px-${tag}.png`); await page.screenshot({path:f});
      const buf=fs.readFileSync(f).toString('base64');
      return await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
        await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
        const g=c.getContext('2d'); g.drawImage(im,0,0);
        const d=g.getImageData(0,300,1280,150).data; const col=new Array(1280).fill(0);
        for(let y=0;y<150;y++) for(let x=0;x<1280;x++){ const i=((y*1280)+x)*4;
          col[x]+=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; }
        return col; })()`);
    };
    const profileAt=async(px,pz,tag)=>{
      const g=await page.evaluate(`__hc.groundY(${Math.round(px)},${Math.round(pz)})`);
      await page.evaluate(`__hc.tpAt(${px}, ${Math.max(g,SEA+1)+3}, ${pz}); __hc.cam({yaw:${yaw}, pitch:-0.02})`);
      for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(2500);
      await page.evaluate(`__hc.pines(1)`); await sleep(800); const on=await grab(tag+'-on');
      await page.evaluate(`__hc.pines(0)`); await sleep(800); const off=await grab(tag+'-off');
      await page.evaluate(`__hc.pines(1)`); await sleep(400);
      return on.map((v,i)=>v-off[i]);                    // the pines' own contribution, column by column
    };
    // PER BAND, because a profile of all three together can only show that SOMETHING moved. The claim is that each band
    // moves at its own rate, so each is isolated and measured against its own prediction.
    const wall0=await page.evaluate(`__hc.pines().wall`);
    const fov0=60*Math.PI/180, ppr=1280/fov0;
    for(const [bi,mult] of [[0,1.0],[1,2.3],[2,4.6],[-1,0]]){
      await page.evaluate(`__hc.pinesBand(${bi})`); await sleep(500);
      const PA=await profileAt(shore.x+0.5, shore.z+0.5, 'a'+bi);
      const PB=await profileAt(shore.x+0.5+per.x*STEP, shore.z+0.5+per.z*STEP, 'b'+bi);
      const cc=(sh)=>{ let n=0,sum=0; for(let x=200;x<1080;x++){ const j=x+sh; if(j<0||j>=1280) continue; sum+=PA[x]*PB[j]; n++; } return n?sum/n:-1e18; };
      let bs=0,bv=-1e18; for(let sh=-300;sh<=300;sh+=2){ const v=cc(sh); if(v>bv){bv=v; bs=sh;} }
      const pred = mult? (STEP/(wall0*mult))*ppr : 0;
      console.log('    band '+(bi<0?'all':bi)+'   measured '+bs+' px   predicted '+(mult?pred.toFixed(0):'mixed')+' px   corr '+bv.toFixed(0)+' vs zero '+cc(0).toFixed(0));
    }
    await page.evaluate(`__hc.pinesBand(-1)`);
    const A=await profileAt(shore.x+0.5, shore.z+0.5, 'a');
    const B=await profileAt(shore.x+0.5+per.x*STEP, shore.z+0.5+per.z*STEP, 'b');
    // Cross-correlate: the shift that best lines the two profiles up.
    const corr=(s)=>{ let n=0, sum=0;
      for(let x=200;x<1080;x++){ const j=x+s; if(j<0||j>=1280) continue; sum+=A[x]*B[j]; n++; }
      return n? sum/n : -1e18; };
    let best=0, bestV=-1e18, curve=[];
    for(let s=-260;s<=260;s+=2){ const v=corr(s); curve.push([s,v]); if(v>bestV){ bestV=v; best=s; } }
    const zero=corr(0);
    const wall=await page.evaluate(`__hc.pines().wall`);
    const fov=60*Math.PI/180, pxPerRad=1280/fov;
    console.log(`  step ${STEP} blocks perpendicular, render wall ${wall}`);
    console.log(`  predicted shift: near band ${(STEP/wall*pxPerRad).toFixed(0)} px, mid ${(STEP/(wall*2.3)*pxPerRad).toFixed(0)} px, far ${(STEP/(wall*4.6)*pxPerRad).toFixed(0)} px, skybox 0 px`);
    console.log(`  MEASURED peak shift ${best} px   (correlation at peak ${bestV.toFixed(0)} vs at zero ${zero.toFixed(0)}, ${(100*(bestV-zero)/Math.abs(zero)).toFixed(1)}% better)`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
