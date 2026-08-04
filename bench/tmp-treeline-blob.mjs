// §2 of docs/LIGHT-AND-BEAUTY-PLAN.md: is the dark blob on the treeline the SKYLIGHT BAKE on real trees, or the horizon BAND?
//
// ?dbg=sky patches only the voxel-atlas (chunk) materials — index.html:2604 — so in that mode real terrain renders as
// greyscale vSky while pineLayer/oceanLayer keep drawing normally. That asymmetry IS the test:
//   blob present in dbg=sky as BLACK on grey terrain  ⇒ the bake, a world lighting bug
//   blob still coloured/soft while terrain went grey  ⇒ the band (pineMat / pineUnderMat)
//
// Two passes, both in one page each:
//   A. locate — sweep yaw from an offshore vantage over water and shoot every 15°, so the bearing is found rather than guessed
//   B. bisect — at that bearing: normal, then __hc.horizonDbg(false,true)/(true,false)/(false,false)
// Run B in a second page with ?dbg=sky (the shader is patched at build time, so the mode cannot be toggled live).
//
//   node bench/tmp-treeline-blob.mjs locate
//   node bench/tmp-treeline-blob.mjs bisect <yawRad>
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

// Per-column mean luminance over a horizontal strip, then the darkest run of columns relative to the strip's own median.
// A treeline blob is a COLUMN deficit, not a row one, so this is the shape that finds it without knowing where it is.
function darkColumns(file, strip=[0.34,0.66], cols=64){
  const P=decodePNG(fs.readFileSync(file));
  const y0=(P.h*strip[0])|0, y1=(P.h*strip[1])|0;
  const per=new Array(cols).fill(0);
  const cw=P.w/cols;
  for(let c=0;c<cols;c++){ let s=0,n=0;
    for(let y=y0;y<y1;y++) for(let x=(c*cw)|0;x<((c+1)*cw)|0;x++){ s+=lum(P.data,(y*P.w+x)*P.ch); n++; }
    per[c]=s/n; }
  const sorted=[...per].sort((a,b)=>a-b); const med=sorted[cols>>1];
  let worst=0, wc=0; for(let c=0;c<cols;c++){ const d=med-per[c]; if(d>worst){worst=d; wc=c;} }
  return { med:+med.toFixed(1), worstDrop:+worst.toFixed(1), atCol:wc, atFrac:+(wc/cols).toFixed(3), per:per.map(v=>Math.round(v)) };
}

const MODE=process.argv[2]||'locate';
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    // GRAIN OFF before the composer is built (§7): animated noise at 0.06 moves a sixth of the screen between any two frames.
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    const dbg = MODE==='bisect' ? '&dbg=sky' : '';
    await page.goto(base+'/index.html?debug=1&rd=8'+dbg,{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const T=0.42;   // mid-morning, the hour Ben's shot was taken at; re-pinned at EVERY shot (§7 — the clock keeps running)
    const HOLD=`__hc.setTime(${T});`;
    await page.evaluate(HOLD);

    const P=await page.evaluate(`__hc.probe()`);
    console.log('  probe: '+JSON.stringify({worldSize:P.worldSize, sea:P.sea, spawnX:P.spawnX, spawnZ:P.spawnZ}));
    // WHERE IS THE OPEN SEA? Walk outward from spawn on each of eight bearings and take the one that is under sea level
    // longest — guessing +Z from a screenshot caption is how a run gets spent looking at the wrong horizon.
    const dirs=await page.evaluate(`(()=>{const out=[]; const sx=__hc.probe().spawnX, sz=__hc.probe().spawnZ, sea=__hc.probe().sea;
      for(let i=0;i<16;i++){ const a=i*Math.PI/8; let wet=0, first=null;
        for(let d=60;d<=1200;d+=30){ const x=Math.round(sx+Math.cos(a)*d), z=Math.round(sz+Math.sin(a)*d);
          const g=__hc.groundY(x,z); if(typeof g==='number' && g<sea){ wet++; if(first===null)first=d; } }
        out.push({a:+a.toFixed(3), wet, first}); }
      return out;})()`);
    dirs.sort((p,q)=>q.wet-p.wet);
    console.log('  wettest bearings: '+JSON.stringify(dirs.slice(0,4)));
    const AZ=dirs[0].a;
    // 900 BLOCKS OUT along that bearing, at the height of the plan's offshore frames (a few blocks over the water), then
    // face back at the land: the blob was seen at 900 and 950 offshore.
    const OFF=900;
    const pos=await page.evaluate(`(()=>{const p=__hc.probe(); const x=p.spawnX+Math.cos(${AZ})*${OFF}, z=p.spawnZ+Math.sin(${AZ})*${OFF};
      __hc.tpAt(x, p.sea+6, z); return {x:+x.toFixed(1), z:+z.toFixed(1), sea:p.sea};})()`);
    console.log('  vantage: '+JSON.stringify(pos));
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2500);
    // yaw that FACES the land: the world +X axis is yaw=-PI/2 in this game's convention (lookDir = (-sin y, ., -cos y)),
    // so a bearing az to the sea means looking back along az+PI.
    const backAz=AZ+Math.PI;
    const yawFor=(bearing)=>Math.atan2(-Math.cos(bearing), -Math.sin(bearing));   // world direction (cos b, sin b) → yaw
    console.log('  sun: '+JSON.stringify(await page.evaluate(`__hc.sunDir()`)));

    if(MODE==='locate'){
      const rows=[];
      for(let k=-6;k<=6;k++){                      // ±90° around the land bearing, 15° steps
        const b=backAz + k*Math.PI/12, yaw=yawFor(b);
        await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.02})`); await sleep(700); await page.evaluate(HOLD); await sleep(200);
        const f=path.join(OUT,`blob-loc-${k<0?'m':'p'}${Math.abs(k)}.png`); await page.screenshot({path:f});
        const d=darkColumns(f);
        rows.push({k, bearingDeg:Math.round(b*180/Math.PI), yaw:+yaw.toFixed(4), med:d.med, worstDrop:d.worstDrop, atFrac:d.atFrac});
        console.log(`  k=${k>=0?'+':''}${k}  bearing ${Math.round(((b*180/Math.PI)%360+360)%360)}deg  yaw ${yaw.toFixed(3)}  stripMed ${d.med}  worstColDrop ${d.worstDrop} at x=${d.atFrac}`);
      }
      rows.sort((p,q)=>q.worstDrop-p.worstDrop);
      console.log('\n  darkest columns: '+JSON.stringify(rows.slice(0,3)));
      fs.writeFileSync(path.join(OUT,'blob-locate.json'), JSON.stringify(rows,null,1));
    } else {
      const yaw=+process.argv[3];
      if(!isFinite(yaw)) throw new Error('bisect needs a yaw in radians');
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.02})`); await sleep(900); await page.evaluate(HOLD); await sleep(300);
      const shot=async(n)=>{ const f=path.join(OUT,n); await page.screenshot({path:f}); console.log('   '+n+'  '+JSON.stringify(darkColumns(f))); return f; };
      await shot('blob-dbgsky-all.png');
      await page.evaluate(`__hc.horizonDbg(false,true)`);  await sleep(600); await page.evaluate(HOLD); await shot('blob-dbgsky-pineonly.png');
      await page.evaluate(`__hc.horizonDbg(true,false)`);  await sleep(600); await page.evaluate(HOLD); await shot('blob-dbgsky-oceanonly.png');
      await page.evaluate(`__hc.horizonDbg(false,false)`); await sleep(600); await page.evaluate(HOLD); await shot('blob-dbgsky-nolayers.png');
      await page.evaluate(`__hc.horizonDbg(true,true)`);
    }
    console.log('DONE');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
