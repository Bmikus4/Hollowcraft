// DOES DAYLIGHT WATER CRUSH TO BLACK AT A STEEP VIEW ANGLE, THE WAY NIGHT WATER DID?
//
// The one-line lead left from the night fix (61fe516): "daytime near water crushes to pure black at steep view angles — a 37.7-level
// hard edge at row 320, unaffected by the wash, unrelated to the handover". Never followed up, and the night fix cannot have covered
// it: `col += uSeaNight * (1.0 - uDay)` is night-only by construction, so whatever daylight does at a steep angle it still does.
//
// THE MECHANISM WOULD BE THE SAME ONE, minus the cure. F is 0.02 looking straight down, so `min(F,uFresCap)` lets almost none of the
// sky reflection into the colour; `base` is `mix(deep,shallow,uDay*0.5)`, which in full daylight is only halfway to the shallow
// constant; and the Beer term then sinks that 97% toward uBody wherever the water is deep. Nothing in that chain is view-independent
// in daylight the way the night in-scatter is.
//
// WHAT THIS MEASURES, sweeping pitch from level to straight down over open water at uDay 1:
//   med        the water's own median — a dim surface would show here
//   black      share of pixels under luminance 3, which is the statistic the night bug actually moved (2.5% -> 20.2%)
//   edge       the strongest row-to-row step in the crop's row medians, and the row it sits on. A "hard edge at row 320" is a STEP,
//              and a step is what tells a threshold apart from the smooth darkening a steep view is supposed to produce.
//
// RESULT, 2026-08-05: IT DOES NOT REPRODUCE. Over genuinely deep water at uDay 1, sweeping pitch from level to straight down:
//   pitch  -0.20   -0.45   -0.70   -1.00   -1.30   -1.50
//   med     56.8    66.0    69.5    81.1    96.5   118.4      <- it gets BRIGHTER as the view steepens, not darker
//   black   0.12%   0.40%   0.07%    0%      0%      0%       <- against the night bug's own statistic of 20.2%
//   step     4.1     7.5     6.1     7.3     5.3     7.6      <- biggest row-to-row step, against the reported 37.7 hard edge
// No crush, no threshold, and the darkening the mechanism predicts is not even the sign the lead claims. Night reads the same way
// (medians 70-139, zero black), so the in-scatter added in 61fe516 is holding. The lead is closed as not-reproducible in this build.
// AND AT THE SIGHTING'S OWN VANTAGE — eye 8 blocks over the sea looking LEVEL out, which is where tmp-sea-handover saw it, not the
// low steep eye above — there is no such edge either. Scanning the same column with the HUD excluded, the biggest genuine row steps
// are day 9.2 at row 312 and night 11.7 at row 296, against a median step of 0.78 and 0.36, and the rows at and below 320 read a
// median of 50.8 by day where the report says the frame reads 0. Nothing at row 320, nothing of the size reported, at either hour.
//
// THE FIRST RUN OF THIS FILE WAS OF A BEACH. Copying the night file's "shore plus 24 blocks along the same bearing" put the camera
// over wet SAND — the frame is a beach with a corner of sea in it — and it read median 110-130 with zero black, which would have
// closed the lead for entirely the wrong reason. The vantage now walks out until the column under the eye is water, the seabed is six
// or more blocks down, and seven of eight probes at 10 blocks around are also water; if it cannot find that it refuses to measure.
//
//   node bench/tmp-daywater-black.mjs
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
  const all=[]; const rows=[];
  for(let y=y0;y<y1;y++){ const r=[];
    for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch; const l=0.2126*P.data[i]+0.7152*P.data[i+1]+0.0722*P.data[i+2]; r.push(l); all.push(l); }
    r.sort((a,b)=>a-b); rows.push({y, med:r[r.length>>1]}); }
  all.sort((a,b)=>a-b);
  let edge=0, edgeRow=0;
  for(let i=1;i<rows.length;i++){ const d=Math.abs(rows[i].med-rows[i-1].med); if(d>edge){ edge=d; edgeRow=rows[i].y; } }
  return { med:+all[(all.length*0.5)|0].toFixed(2), p10:+all[(all.length*0.10)|0].toFixed(2),
           black:+(100*all.filter(v=>v<3).length/all.length).toFixed(2),
           edge:+edge.toFixed(2), edgeRow };
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
    await page.goto(base+'/'+String(process.env.HC_PAGE||'index.html')+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone();`);
    const S=await page.evaluate(`__hc.st()`);
    // The same shore search the night file uses — a run of six wet columns, nearest first.
    const shore=await page.evaluate(`(()=>{ const W=__hc.bid('water'); let best=null;
      for(let a=0;a<24;a++){ const th=a*Math.PI/12;
        for(let d=10; d<=240; d+=2){ const x=Math.round(${S.sx}+Math.cos(th)*d), z=Math.round(${S.sz}+Math.sin(th)*d);
          let run=0; for(let k=0;k<7;k++){ const xx=Math.round(x+Math.cos(th)*k*2), zz=Math.round(z+Math.sin(th)*k*2);
            let wet=false; for(let y=38;y<=42;y++) if(__hc.blockAt(xx,y,zz)===W){ wet=true; break; }
            if(wet) run++; else break; }
          if(run>=6){ if(!best||d<best.d) best={d,x,z,th}; break; } } }
      return best; })()`);
    console.log(`  shore ${JSON.stringify(shore)}`);
    // DEEP WATER, ASSERTED, NOT "the shore plus 24". That step landed the camera over SAND — the frame is a beach with a corner of
    // sea in it (daywater-day-p130.png, first run) and every number below it was of wet sand, which is why nothing read dark.
    // Walk out along the same bearing until the column under the eye is water AND the seabed is at least six blocks down, then say so.
    const spot=await page.evaluate(`(()=>{ const W=__hc.bid('water');
      for(let d=24; d<=400; d+=8){ const x=Math.round(${shore.x}+Math.cos(${shore.th})*d), z=Math.round(${shore.z}+Math.sin(${shore.th})*d);
        if(__hc.blockAt(x,39,z)!==W) continue;
        const g=__hc.groundY(x,z); if(g>34) continue;              // seabed six or more blocks under the surface at CFG.SEA 40
        let wet=0; for(let a=0;a<8;a++){ const xx=Math.round(x+Math.cos(a*Math.PI/4)*10), zz=Math.round(z+Math.sin(a*Math.PI/4)*10);
          if(__hc.blockAt(xx,39,zz)===W) wet++; }                  // and water all round, so no beach can creep into the crop
        if(wet>=7) return {x,z,g,d,wet}; }
      return null; })()`);
    console.log(`  deep-water spot ${JSON.stringify(spot)}`);
    if(!spot){ console.log('  NO DEEP WATER FOUND ON THIS BEARING — refusing to measure a beach'); return; }
    const wx=spot.x, wz=spot.z;
    await page.evaluate(`__hc.tpAt(${wx}, 41.6, ${wz})`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1600);
    const CROP=[0.36,0.64,0.52,0.78];
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(520); await page.evaluate(`__hc.setTime(${t})`); await sleep(240); };
    for(const [tag,t] of [['day',0.30],['night',0.75]]){
      console.log(`\n  === ${tag} (t=${t}) — pitch sweep over open water, eye 1.6 blocks up ===`);
      for(const p of [-0.20,-0.45,-0.70,-1.00,-1.30,-1.50]){
        await page.evaluate(`__hc.cam({yaw:${shore.th+Math.PI}, pitch:${p}})`); await sleep(340); await pin(t);
        const f=path.join(OUT,`daywater-${tag}-p${Math.abs(p*100)|0}.png`); await page.screenshot({path:f});
        const s=stat(f,CROP);
        const d=await page.evaluate(`__hc.scot({}).day`);
        console.log(`    pitch ${p.toFixed(2)}  uDay ${String(d).padEnd(5)}  med ${String(s.med).padStart(6)}  p10 ${String(s.p10).padStart(6)}  black ${String(s.black).padStart(5)}%  biggest row step ${String(s.edge).padStart(6)} at row ${s.edgeRow}`);
      }
    }
    // THE ORIGINAL SIGHTING'S OWN VANTAGE, because closing a lead against a different camera closes nothing. tmp-sea-handover saw the
    // 37.7-level edge at row 320 from EIGHT blocks above the sea looking LEVEL out to it, not from a low eye pitched down, and it saw
    // it while scanning a tall band rather than a crop. Same column, same widths, top three row steps.
    console.log(`\n  === the tmp-sea-handover vantage: eye 8 blocks over the sea, looking level out ===`);
    await page.evaluate(`__hc.tpAt(${wx}, 48, ${wz})`); await sleep(900);
    for(const [tag,t] of [['day',0.30],['night',0.75]]){
      await page.evaluate(`__hc.cam({yaw:${shore.th+Math.PI}, pitch:0})`); await sleep(320); await pin(t);
      const f=path.join(OUT,`daywater-handover-${tag}.png`); await page.screenshot({path:f});
      const P=decodePNG(fs.readFileSync(f));
      // STOPS AT 0.74, AND BOTH CUTS ARE THE SAME TRAP TWICE. Scanning to 0.90 put the three biggest row steps at rows 494-496 — the
      // HOTBAR's top edge. Stopping at 0.82 then put them at rows 428-436, night 123.6 and 77.1, which is the OBJECTIVE TEXT banner
      // ("OBJECTIVE - Survive the first night") lying straight across the middle of the column. Neither is the sea. The compass, the
      // crosshair, the hotbar, the held item and now the objective line: every one of them has faked a measurement in this bench.
      const x0=(P.w*0.36)|0, x1=(P.w*0.64)|0, y0=(P.h*0.45)|0, y1=(P.h*0.74)|0;
      const rows=[]; for(let y=y0;y<y1;y++){ const r=[];
        for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch; r.push(0.2126*P.data[i]+0.7152*P.data[i+1]+0.0722*P.data[i+2]); }
        r.sort((a,b)=>a-b); rows.push({y, med:r[r.length>>1]}); }
      const steps=[]; for(let i=1;i<rows.length;i++) steps.push({row:rows[i].y, d:+Math.abs(rows[i].med-rows[i-1].med).toFixed(2), from:+rows[i-1].med.toFixed(1), to:+rows[i].med.toFixed(1)});
      const top=[...steps].sort((a,b)=>b.d-a.d).slice(0,3);
      const med=[...steps].map(s=>s.d).sort((a,b)=>a-b)[steps.length>>1];
      const below=rows.filter(r=>r.y>=320).map(r=>r.med).sort((a,b)=>a-b);
      console.log(`    ${tag.padEnd(6)} top row steps ${JSON.stringify(top)}   median step ${med.toFixed(2)}   median of rows at/below 320: ${below.length?below[below.length>>1].toFixed(2):'n/a'}`);
    }
    console.log(`\n  READ IT LIKE THIS: a steep view of deep water SHOULD darken — that is the Fresnel term doing its job. What would be`);
    console.log(`  a defect is pure black (the night bug's own statistic) or a hard row STEP, which is a threshold rather than a curve.`);
    console.log(`  frames: bench/results/daywater-*.png`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
