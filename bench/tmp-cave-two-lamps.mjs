// TWO LIGHTS IN A CAVE (Ben, 2026-08-11: "the caves are the problems with two light sources", then "is this because
// of baked lighting?").
//
// THE ANSWER THE CODE ALREADY GIVES. buildLightTexture stores ONE CHANNEL — a level, 0..15, written as lv*17 — and
// bakeLight floods it as a max-minus-one, so two lamps do not ADD anywhere. A cell between them takes the larger of
// the two fields, which means the midpoint of a lit corridor is lit as though only the nearer lamp existed, and the
// place where the two fields cross is a CREASE in the level field: a ridge where the gradient reverses, quantised to
// steps of 1/15. Outdoors the sky fills that crease and nobody sees it. In a cave nothing does, so it sits at a low
// level — which is exactly the level at which the scotopic descent bites and a dark texel crosses zero.
//
// (The same function is explicit about the second half: the chunk carries ONE dominant emitter colour, so two lamps
// of different colours are both drawn in the stronger one's hue. That is a colour fault, not a black one, and this
// harness does not measure it — but it is the other thing "more than one light source" costs in a cave.)
//
// THE MEASUREMENT. A carved room in solid rock, the same vantage throughout, and the crop on the wall BETWEEN the two
// lamp positions. One lamp, then two. If the crease story is right, adding the second lamp does NOT clear the black
// from the band between them the way the first lamp cleared its own pool.
//
//   node bench/tmp-cave-two-lamps.mjs [k/disp,...]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
// minCh is the counter-metric this bench family learned the hard way: the descent crushes the MIN CHANNEL, and a crop
// can read a healthy luminance while its darkest channel is on the floor.
function stat(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  const v=[]; let pure=0, iso=0, n=0, minCh=255, sr=0, sg=0, sb=0;
  const L=(x,y)=>lum(P.data,(y*P.w+x)*P.ch);
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, l=lum(P.data,i); v.push(l); n++;
    sr+=P.data[i]; sg+=P.data[i+1]; sb+=P.data[i+2];
    const mc=Math.min(P.data[i],P.data[i+1],P.data[i+2]); if(mc<minCh) minCh=mc;
    if(l<=2){ pure++;
      let bright=false;
      for(let dy=-2;dy<=2&&!bright;dy++) for(let dx=-2;dx<=2;dx++){ if(!dx&&!dy) continue; const xx=x+dx,yy=y+dy;
        if(xx<x0||xx>=x1||yy<y0||yy>=y1) continue; if(L(xx,yy)>18){ bright=true; break; } }
      if(bright) iso++; } }
  v.sort((a,b)=>a-b);
  const q=f=>+v[Math.min(v.length-1,(v.length*f)|0)].toFixed(1);
  return { med:q(0.5), p10:q(0.10), p90:q(0.90), minCh, rgb:[+(sr/n).toFixed(1),+(sg/n).toFixed(1),+(sb/n).toFixed(1)],
           pureBlack:+(100*pure/n).toFixed(3), isoBlack:+(100*iso/n).toFixed(3) };
}
const ROWS=(process.argv[2]||'0.030/0.008').split(',').map(s=>s.split('/').map(Number));
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true);`);
    const S=await page.evaluate(`__hc.st()`); const SX=Math.round(S.sx), SZ=Math.round(S.sz);
    // SOLID ROCK FIRST — the island has real cave systems, and a "wall" that opens into a cavern is lit through it.
    const site=await page.evaluate(`(()=>{ const cand=[]; const solidity=(cx,cy,cz)=>{ let s=0,n=0;
        for(let dx=-9;dx<=9;dx++) for(let dz=-5;dz<=5;dz++) for(let y=cy-1;y<=cy+6;y++){ n++; if(__hc.blockAt(cx+dx,y,cz+dz)>0) s++; } return s/n; };
      for(const oy of [16,22,28,34]) for(const ox of [0,24,-24]) for(const oz of [0,24,-24]){
        const cx=${SX}+ox, cz=${SZ}+oz, cy=__hc.groundY(cx,cz)-oy; if(cy<8) continue;
        cand.push({ cx, cy, cz, s:+solidity(cx,cy,cz).toFixed(3) }); }
      cand.sort((a,b)=>b.s-a.s); return cand[0]; })()`);
    console.log(`  cave site ${site.cx},${site.cy},${site.cz} — solidity ${site.s}`);
    if(site.s<0.98) throw new Error('site is not solid rock: '+site.s);
    const CX=site.cx, CY=site.cy, CZ=site.cz;
    // A CORRIDOR, not a room: 17 long so the two lamps can sit far enough apart that neither reaches the middle at
    // full level. That gap is the whole subject.
    await page.evaluate(`(()=>{ for(let dx=-8;dx<=8;dx++) for(let dz=-2;dz<=2;dz++) for(let y=${CY};y<=${CY}+4;y++)
        __hc.cmdRun('/setblock '+(${CX}+dx)+' '+y+' '+(${CZ}+dz)+' air'); })()`);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2000);
    const sealed=await page.evaluate(`({ inside:__hc.blockAt(${CX},${CY}+1,${CZ}), wall:__hc.blockAt(${CX},${CY}+1,${CZ}+4),
      roof:__hc.blockAt(${CX},${CY}+6,${CZ}), floor:__hc.blockAt(${CX},${CY}-1,${CZ}) })`);
    console.log(`  carved ${JSON.stringify(sealed)}`);
    // Stand at one end looking down the corridor: both lamp positions and the wall between them are in frame.
    await page.evaluate(`__hc.holdNone(); __hc.tpAt(${CX}-7.5, ${CY}+1.7, ${CZ}+0.5); __hc.cam({yaw:Math.atan2(-1,-0), pitch:0.0});`);
    await sleep(800);
    const pin=async()=>{ await page.evaluate(`__hc.freezeT(0); __hc.setTime(0.75)`); await sleep(500); return await page.evaluate(`__hc.setTime(0.75)`); };
    await pin();
    const WALL=[0.30,0.70,0.30,0.66];
    // THE SECOND LIGHT IS A HELD ONE IN THE LAST TWO ROWS, and that is the case with a known hole in it: a held
    // lantern bakes NOTHING, so it lives entirely on delivered direct light — which the display floor deliberately
    // does not read, because the moon is a directional light and gating on it lifted the whole night sky's ground.
    // So a pool lit only by what is in your hand should still crush its dark texels, and these rows say whether it does.
    const SETUPS=[
      ['dark',      ``],
      ['one lamp',  `__hc.cmdRun('/setblock ${CX-5} ${CY} ${CZ} lantern');`],
      ['two lamps', `__hc.cmdRun('/setblock ${CX+5} ${CY} ${CZ} lantern');`],
      ['held only', `__hc.cmdRun('/setblock ${CX-5} ${CY} ${CZ} air'); __hc.cmdRun('/setblock ${CX+5} ${CY} ${CZ} air'); __hc.hold('lantern');`],
      ['held+placed',`__hc.cmdRun('/setblock ${CX+5} ${CY} ${CZ} lantern');`],
      // TWO LIGHTS OF DIFFERENT COLOURS, which is the case buildLightTexture says out loud that it cannot serve: the
      // level is one channel and the CHUNK carries a single dominant emitter colour, so both pools are drawn in the
      // stronger light's hue. A cold lamp rendered through the crimson entry has its green at 0.16 and its blue at
      // 0.10 of its level — the pool keeps its brightness and loses two channels, which is a black texel by any
      // measure that looks at minCh rather than at luminance.
      ['cold only', `__hc.holdNone(); __hc.cmdRun('/setblock ${CX+5} ${CY} ${CZ} air'); __hc.cmdRun('/setblock ${CX-5} ${CY} ${CZ} air'); __hc.cmdRun('/setblock ${CX-5} ${CY+3} ${CZ} hanging_light');`],
      ['cold+crimson',`__hc.cmdRun('/setblock ${CX+5} ${CY} ${CZ} red_torch');`],
    ];
    // THE HELD CASES NEED THEIR OWN VANTAGE. A held lantern's pool is a couple of blocks across, and the corridor's far
    // wall is seven away: the first run of these rows read median 2.0 and reported the fix doing nothing, when what it
    // was measuring was unlit rock. Facing the END wall from 1.5 blocks puts the pool in the crop.
    const DOWN_CORRIDOR=`__hc.tpAt(${CX}-7.5, ${CY}+1.7, ${CZ}+0.5); __hc.cam({yaw:Math.atan2(-1,-0), pitch:0.0});`;
    const AT_END_WALL  =`__hc.tpAt(${CX}-6.5, ${CY}+1.7, ${CZ}+0.5); __hc.cam({yaw:Math.atan2(1,-0), pitch:0.0});`;
    const AIM={ 'held only':AT_END_WALL, 'held+placed':AT_END_WALL,
                // …and back down the corridor for the colour rows, where both emitters are in frame at once.
                'cold only':DOWN_CORRIDOR, 'cold+crimson':DOWN_CORRIDOR };
    for(const [label,build] of SETUPS){
      if(build) await page.evaluate(build);
      if(AIM[label]) await page.evaluate(AIM[label]);
      await sleep(1800);
      for(const [k,disp] of ROWS){
        await page.evaluate(`__hc.scot({amt:0.85, floor:0.02}); __hc.texFloor({k:${k}, disp:${disp}})`); await sleep(300); await pin();
        const f=path.join(OUT,`cave2-${label.replace(/ /g,'_')}-k${String(k).replace('.','_')}-d${String(disp).replace('.','_')}.png`);
        await page.screenshot({path:f});
        const r=stat(f,WALL);
        // The MEAN CHANNELS as well, because the colour fault does not show in luminance: a cold pool tinted crimson
        // holds its brightness and loses green and blue, so r/g/b is the readout that can see it and med cannot.
        const rgb=await page.evaluate(`__hc.chunkTint?__hc.chunkTint():null`).catch(()=>null);
        console.log(`    ${label.padEnd(12)} k ${String(k).padEnd(6)} disp ${String(disp).padEnd(7)} med ${String(r.med).padEnd(6)} p10 ${String(r.p10).padEnd(6)} p90 ${String(r.p90).padEnd(6)} minCh ${String(r.minCh).padEnd(4)} rgb ${r.rgb.join('/').padEnd(14)} pureBlack ${String(r.pureBlack).padEnd(7)}% isoBlack ${r.isoBlack}%${rgb?'  tint '+JSON.stringify(rgb):''}`);
      }
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
