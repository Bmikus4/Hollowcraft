// A LANTERN IN YOUR HAND MUST LIGHT A CAVE — Ben 08-05: "in dark caves a held light shows nothing."
//
// THE SUSPECT is my own global scotopic pass. The descent is `mix(1.0, uScotH.y /*0.15*/, _w*(1.0-_open*uScotG.w))` and in a carved
// cave `_open` is 0, so every fragment whose DELIVERED light sits under the wash's `uScotG.z` knee is taken to 15% of its own
// luminance — and the faint outer part of a hand light's pool is exactly that. A PLACED lantern does not suffer it nearly as much,
// because it also writes the chunk's baked volume and `_bl` carries the whole pool over the knee; a held light writes nothing baked
// and lives or dies on `_dlit` alone. assert-cave-black's own lit case is a PLACED lantern at close range, which is why it is 16/18
// and still misses this.
//
// THE MEASUREMENT, three crops at three ranges down the same carved corridor, held lantern only, no placed light anywhere:
//   floor 1     the descent OFF   (the A/B: what the pool would look like without it)
//   floor 0.15  the shipped build
// If the shipped build reads dark where floor 1 reads lit, the descent is eating the hand light and the fix belongs in the descent
// gate, not in the pool's intensity. If the two read the SAME, the descent is innocent and the hand light is simply too weak.
//
//   node bench/tmp-cave-held.mjs
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
function stat(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const mn=[],lu=[]; let n=0,S=0,sn=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    const lo=Math.min(r,g,b), hi=Math.max(r,g,b), l=0.2126*r+0.7152*g+0.0722*b;
    mn.push(lo); lu.push(l); n++; if(l>=14){ S+=hi>0?(hi-lo)/hi:0; sn++; } }
  mn.sort((a,b)=>a-b); lu.sort((a,b)=>a-b);
  return { min:+mn[mn.length>>1].toFixed(2), lum:+lu[lu.length>>1].toFixed(2),
           sat:sn?+(S/sn).toFixed(3):0, litShare:+(100*sn/n).toFixed(1) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    // HC_QS appends to the query, so the SAME site and the SAME crops can be read through a debug view:
    //   HC_QS='&dbg=lit'  the crops report DELIVERED light, clamp(dot(directDiffuse,luma)*litK)
    //   HC_QS='&dbg=cave' the crops report the descent WEIGHT itself, _ww*(1-vSky)
    // The checks below are meaningless in those runs; the printed numbers are the point.
    await page.goto(base+PAGE+'?debug=1&rd=8'+(process.env.HC_QS||''),{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true);`);
    const S=await page.evaluate(`__hc.st()`); const SX=Math.round(S.sx), SZ=Math.round(S.sz);
    // SOLID ROCK FIRST — the island has real cave systems and a "wall" open into a cavern is lit through it (assert-cave-black).
    const site=await page.evaluate(`(()=>{ const cand=[]; const solidity=(cx,cy,cz)=>{ let s=0,n=0;
        for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=26;dz++) for(let y=cy-1;y<=cy+5;y++){ n++; if(__hc.blockAt(cx+dx,y,cz+dz)>0) s++; } return s/n; };
      for(const oy of [14,20,26,32]) for(const ox of [0,20,-20]) for(const oz of [0,20,-20]){
        const cx=${SX}+ox, cz=${SZ}+oz, cy=__hc.groundY(cx,cz)-oy; if(cy<8) continue;
        cand.push({ cx, cy, cz, s:+solidity(cx,cy,cz).toFixed(3) }); }
      cand.sort((a,b)=>b.s-a.s); return cand[0]; })()`);
    const CX=site.cx, CY=site.cy, CZ=site.cz;
    console.log(`  corridor site ${CX},${CY},${CZ} — rock solidity ${site.s}`);
    check('the site is solid rock, not an existing cavern', site.s>0.98, `solidity ${site.s}`);
    // A CORRIDOR, NOT A ROOM: the hand light's reach is 26 blocks and the whole question is what its FAINT end looks like, so the
    // measurement needs range. Carved (never built) so every wall's column is still capped by the hillside and vSky is truly 0.
    await page.evaluate(`(()=>{ for(let dz=-2;dz<=26;dz++) for(let dx=-2;dx<=2;dx++) for(let y=${CY};y<=${CY}+4;y++)
        __hc.cmdRun('/setblock '+(${CX}+dx)+' '+y+' '+(${CZ}+dz)+' air'); })()`);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2000);
    const sealed=await page.evaluate(`({ inside:__hc.blockAt(${CX},${CY}+1,${CZ}+12), wall:__hc.blockAt(${CX}+3,${CY}+1,${CZ}+12),
      roof:__hc.blockAt(${CX},${CY}+5,${CZ}+12), floor:__hc.blockAt(${CX},${CY}-1,${CZ}+12), sky:__hc.skyAt?__hc.skyAt(${CX},${CY}+1,${CZ}+12):null })`);
    check('the corridor is carved and still enclosed', sealed.inside===0 && sealed.wall>0 && sealed.roof>0 && sealed.floor>0, JSON.stringify(sealed));
    // yaw 0 IS NORTH, i.e. -Z: the first run of this file put the camera 1 block from the corridor's end wall and every crop read
    // one brilliantly lit face at point-blank range (lum 87-115 everywhere, "far" brighter than "near"). Pick the yaw by asking
    // where a point 14 blocks down the corridor actually lands, and assert it.
    await page.evaluate(`__hc.tpAt(${CX}+0.5, ${CY}+1.6, ${CZ}-1.0); __hc.cam({yaw:Math.PI, pitch:0.10});`);
    await sleep(600);
    const pin=async()=>{ await page.evaluate(`__hc.setTime(0.75)`); await sleep(480); await page.evaluate(`__hc.setTime(0.75)`); await sleep(240); };
    const aim=await page.evaluate(`__hc.screenOf(${CX}+0.5, ${CY}+0.5, ${CZ}+14.5)`);
    check('the camera looks DOWN the corridor', !!(aim && aim.px>350 && aim.px<650 && aim.dist>13), JSON.stringify(aim));
    // THE CROPS MUST BE LIT ROCK, AND THE FIRST SET WAS NOT. Bottom-centre and bottom-right read the lantern's own additive halo —
    // flameMat and the emitter halo are MeshBasic with fog:false, so they take neither the wash nor a debug view. Proof: under
    // `HC_QS='&dbg=lit'`, which overwrites the chunk's fragment with a GREY, those crops still read saturation 0.72-0.92. They were
    // never measuring the pool, and the floor A/B moved them only through the washed rock showing under the halo.
    // The bottom-left is the compass and the bottom-centre the hotbar, so the clear rock is UP: ceiling, left wall, and the corridor
    // ahead just above the crosshair box.
    const CROPS={ ceiling:[0.30,0.70,0.06,0.22], wall:[0.04,0.24,0.24,0.44], ahead:[0.40,0.60,0.30,0.44] };
    const shot=async tag=>{ const f=path.join(OUT,`caveheld-${tag}.png`); await page.screenshot({path:f});
      const o={}; for(const k in CROPS) o[k]=stat(f,CROPS[k]); return o; };
    const med=async tag=>{ const F=[]; for(let i=0;i<5;i++){ F.push(await shot(`${tag}-${i}`)); await sleep(150); }
      const o={}; for(const k in CROPS){ o[k]={}; for(const m of ['min','lum','sat','litShare']){ const v=F.map(f=>f[k][m]).sort((a,b)=>a-b); o[k][m]=v[2]; } } return o; };

    // READ THE SHIPPED FLOOR, never assume it. The first run of this file wrote `scot({floor:0.15})` for its "shipped" column from
    // an out-of-date note; the shipped value is 0.02, so every shipped reading was of a build 7x brighter at the bottom than the one
    // Ben plays.
    const DEF=await page.evaluate(`__hc.scot({})`);
    console.log(`  dials: ${JSON.stringify(DEF)}`);
    check('the shipped descent floor is what the build ships', DEF.floor!=null && DEF.floor<0.2, `floor ${DEF.floor}`);
    await pin();
    const empty=await med('empty');   // nothing in hand: the corridor's own darkness
    console.log(`  hand EMPTY            ${JSON.stringify(empty)}`);
    const holdRes=await page.evaluate(`__hc.hold('lantern')`);
    await sleep(700); await pin();
    const held=await page.evaluate(`__hc.st().held!==undefined?__hc.st().held:null`);
    console.log(`  hold('lantern') -> ${JSON.stringify(holdRes)}`);
    const lit=await med('held-shipped');
    console.log(`  lantern HELD, shipped ${JSON.stringify(lit)}`);
    await page.evaluate(`__hc.scot({floor:1})`); await sleep(420); await pin();
    const noDesc=await med('held-floor1');   // the CEILING: no descent at all, what the pool could be
    console.log(`  lantern HELD, floor 1 ${JSON.stringify(noDesc)}`);
    // SWEEP THE KNEE AGAINST THE PICTURE. There is no way to read the linear `_dlit` off a graded frame, so the knee is chosen by
    // where the pool comes back — floor 1 above is the ceiling it is aiming at.
    const SWEEP=[0, 0.0023, 0.0045, 0.009, 0.0225, 0.045, 0.09];
    const table={};
    for(const k of SWEEP){ await page.evaluate(`__hc.scot({floor:${DEF.floor}, litKnee:${k}})`); await sleep(400); await pin();
      const r=await med(`sweep-${k}`); table[k]=r;
      console.log(`  litKnee ${String(k).padEnd(6)} wall lum ${String(r.wall.lum).padEnd(7)} min ${String(r.wall.min).padEnd(4)} | ceiling ${String(r.ceiling.lum).padEnd(7)} min ${String(r.ceiling.min).padEnd(4)} | ahead ${String(r.ahead.lum).padEnd(7)} min ${r.ahead.min}`); }
    const preFix=table[0];   // the A/B: the pre-fix build, descent on and unreleased
    await page.evaluate(`__hc.scot({floor:${DEF.floor}, litKnee:${DEF.litKnee}})`); await sleep(300); await pin();
    const ctl=await med('held-shipped-again');
    console.log(`  control (shipped again)${JSON.stringify(ctl)}`);

    check('a held lantern lights the rock at all', lit.ceiling.lum > empty.ceiling.lum+8, `lum ${empty.ceiling.lum} -> ${lit.ceiling.lum}`);
    check('the litKnee dial exists and ships non-zero', DEF.litKnee>0, `litKnee ${DEF.litKnee}`);
    for(const k of ['ceiling','wall','ahead']){
      const drift=Math.max(Math.abs(lit[k].lum-ctl[k].lum),1.0);
      // WHAT THE FIX HAS TO DO: bring the pool back up from the pre-fix reading toward the no-descent ceiling. The min CHANNEL is the
      // metric that matters here for the same reason it is in assert-cave-black — the descent's whole effect is on the dark channels.
      const gain=lit[k].lum-preFix[k].lum, ceilGap=noDesc[k].lum-lit[k].lum;
      console.log(`  ${k}: lum  pre-fix ${preFix[k].lum} -> shipped ${lit[k].lum} -> ceiling ${noDesc[k].lum}   min  ${preFix[k].min} -> ${lit[k].min} -> ${noDesc[k].min}`);
      check(`${k}: the fix gives the hand light its pool back`, gain > drift+2.0, `+${gain.toFixed(2)} lum (drift ${drift.toFixed(2)})`);
      check(`${k}: and it reaches the no-descent ceiling`, ceilGap <= drift+3.0, `${ceilGap.toFixed(2)} short of ${noDesc[k].lum}`);
    }
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | ').slice(0,200));
    console.log(`\n  frames: bench/results/caveheld-*.png`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
