// BREAKING ONE OF TWO LAMPS IN A CHUNK MUST NOT WASH OUT THE OTHER ONE'S LIGHT.
//
// Ben, 08-05: "when two light sources are placed in a chunk, and the first one placed is broken, the entire chunk becomes white
// washed again."
//
// THE CAUSE, now measured: bakeLight cleared its scratch level buffer LAZILY, inside the test that reads it —
// `if(_lv[pi]<lvl){ if(!_lvLit){ _lv.fill(0); ... } ... }` — so the first emitter was compared against whatever the PREVIOUS bake left
// at that index. A stale level >= this emitter's own rejects it; reject every emitter in the 3x3 and `_lvLit` stays false, bakeLight
// returns false, and buildLightTexture runs `c.light3D.dispose(); c.light3D=null`. The chunk's whole light volume is gone, `_bl` is 0
// for every fragment in it, the scotopic gate reads the chunk unlit, and THE ENTIRE CHUNK WASHES.
//
// WHAT EACH STAGE IS FOR, and this order was arrived at the hard way — stages 1 and 2 PASS on the un-fixed build:
//   1  lamp B's pool in pixels, before and after breaking lamp A. Rescued by the neighbour bakes the break itself queues: a
//      neighbour's frame is shifted 16 blocks, so B's index reads 0 there and the next bake of B's chunk passes.
//   2  two lamps at IDENTICAL chunk-local coords in chunks four apart, so the indices collide exactly. Also rescued, same reason.
//   3  THE ONE THAT FIRES. 14 stops of fly-place-build-break in a streaming world, asserting `__hc.lightVols()` never shows a chunk
//      that holds an emitter and has no volume. Un-fixed: 1 of 14 stops, chunk 15,5, both runs. Fixed: 0 of 14, both runs.
// The fault is an ORDERING, so only a moving world reproduces it; a single controlled bake cannot.
//
// The invariant in stage 3 is the metric worth keeping: pixels cannot tell a destroyed light volume from a dim lamp, `lightVols()` can.
//
// THE SITE IS A PLATFORM IN THE AIR, and that is not tidiness — the first version of this harness built its slab on the spawn
// chunk's own ground, which is a wooded hillside, so the crop read dark foliage and shaded terrain (sat 0.243 / warm 1.32 / lum 30.4
// BEFORE anything was broken, against 0.66-0.70 / 3.0 / 90-132 for a real lamp pool on planks) and BOTH of its readings were of the
// wrong pixels. The slab now goes 20 blocks above the TALLEST column in the chunk, and the volume above it is ASSERTED empty rather
// than cleared, so nothing can stand between the camera and lamp B. The "B's pool is lit and coloured to begin with" check stays as
// the gate: it is the only reason the bad vantage did not report a false positive.
//
//   node bench/assert-two-lamp-wash.mjs                     # against the shipped index.html
//   HC_PAGE=<copy>.html node bench/assert-two-lamp-wash.mjs # against a copy holding the OLD lazy clear, to watch the bug fire
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
function stat(file,px,py,r){
  const P=decodePNG(fs.readFileSync(file));
  const x0=Math.max(0,px-r)|0,x1=Math.min(P.w,px+r)|0,y0=Math.max(0,py-r)|0,y1=Math.min(P.h,py+r)|0;
  let S=0,n=0,R=0,B=0,L=0,tot=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r0=P.data[i],g=P.data[i+1],b=P.data[i+2];
    const l=lum(P.data,i); tot++; L+=l; if(l<12) continue;
    const mx=Math.max(r0,g,b), mn=Math.min(r0,g,b); S+=mx>0?(mx-mn)/mx:0; R+=r0; B+=b; n++; }
  return { sat:n?+(S/n).toFixed(3):0, lum:+(L/tot).toFixed(2), warm:n?+((R/n)/Math.max(1,B/n)).toFixed(2):0, lit:+(100*n/tot).toFixed(1) };
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
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.holdNone(); __hc.freezeAnimals(true);`);
    const S=await page.evaluate(`__hc.st()`);
    // SAME CHUNK for both lamps: floor to the 16-grid and place well inside it.
    const CBX=(Math.round(S.sx)>>4)<<4, CBZ=(Math.round(S.sz)>>4)<<4;
    const AX=CBX+4, AZ=CBZ+4, BX=CBX+11, BZ=CBZ+11;
    // 10 above the highest SOLID CELL in the chunk. `groundY` is terrain height and ignores what grows on it: the first attempt used
    // groundY+20 and landed the slab 66..73 INSIDE a 25-block pine canopy, which is the same class of error as the hillside crop.
    const top=await page.evaluate(`(()=>{ let m=0; for(let dx=0;dx<16;dx++) for(let dz=0;dz<16;dz++) for(let y=127;y>m;y--) if(__hc.blockAt(${CBX}+dx,y,${CBZ}+dz)>0){ m=y; break; } return m; })()`);
    const GY=top+10;
    // ASSERT the site is empty rather than clearing it: a stray leaf between the camera and B is exactly the error that made the
    // first vantage worthless, and 1536 setblocks to clear a volume that should already be air would hide it instead of catching it.
    const solid=await page.evaluate(`(()=>{ let n=0; for(let dx=0;dx<16;dx++) for(let dz=0;dz<16;dz++) for(let dy=0;dy<8;dy++) if(__hc.blockAt(${CBX}+dx,${GY}+dy,${CBZ}+dz)>0) n++; return n; })()`);
    check('the platform site is open air', solid===0, `${solid} solid cells at y ${GY}..${GY+7} (chunk top ${top})`);
    await page.evaluate(`(()=>{ for(let dx=0;dx<16;dx++) for(let dz=0;dz<16;dz++) __hc.cmdRun('/setblock '+(${CBX}+dx)+' ${GY} '+(${CBZ}+dz)+' planks');
      __hc.cmdRun('/setblock ${AX} ${GY+1} ${AZ} lantern');   // A, placed FIRST
      __hc.cmdRun('/setblock ${BX} ${GY+1} ${BZ} lantern'); })()`);   // B, placed second
    for(let i=0;i<24;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(1600);
    const built=await page.evaluate(`({ a:__hc.blockAt(${AX},${GY+1},${AZ}), b:__hc.blockAt(${BX},${GY+1},${BZ}),
      sameChunk:((${AX}>>4)===(${BX}>>4))&&((${AZ}>>4)===(${BZ}>>4)) })`);
    console.log(`  chunk ${CBX>>4},${CBZ>>4}: A at ${AX},${AZ}  B at ${BX},${BZ}  ${JSON.stringify(built)}`);
    check('both lamps placed, in the SAME chunk', built.a>0 && built.b>0 && built.sameChunk===true, JSON.stringify(built));

    // Stand off B and look at its pool, off-centre so the crop cannot hold the crosshair.
    await page.evaluate(`__hc.tpAt(${BX}+0.5, ${GY}+3.2, ${BZ}+10.5)`); await sleep(900);
    let by=0,br=1e9;
    for(let i=0;i<48;i++){ const yaw=i*Math.PI/24; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.26})`); await sleep(45);
      const p=await page.evaluate(`__hc.screenOf(${BX}+0.5, ${GY}+0.5, ${BZ}+0.5)`);
      if(p&&p.onScreen){ const r=Math.hypot(p.px-330,p.py-350); if(r<br){ br=r; by=yaw; } } }
    await page.evaluate(`__hc.cam({yaw:${by}, pitch:-0.26})`); await sleep(500);
    const sp=await page.evaluate(`__hc.screenOf(${BX}+0.5, ${GY}+0.5, ${BZ}+0.5)`);
    const R=55;
    check('lamp B is on screen, clear of the crosshair', sp.onScreen && Math.hypot(sp.px-500,sp.py-280)>R+14,
      `crosshair ${Math.hypot(sp.px-500,sp.py-280).toFixed(0)} px away`);
    const pin=async()=>{ await page.evaluate(`__hc.setTime(0.94)`); await sleep(540); await page.evaluate(`__hc.setTime(0.94)`); await sleep(260); };
    const sample=async tag=>{ const F=[]; for(let i=0;i<5;i++){ const f=path.join(OUT,`twolamp-${tag}-${i}.png`); await page.screenshot({path:f}); F.push(stat(f,sp.px,sp.py,R)); await sleep(140); }
      const p=k=>{ const v=F.map(x=>x[k]).sort((a,b)=>a-b); return v[2]; };
      return { sat:p('sat'), lum:p('lum'), warm:p('warm'), lit:p('lit') }; };

    await pin();
    const both=await sample('both');
    console.log(`  both lamps burning        ${JSON.stringify(both)}`);
    check("B's pool is lit and coloured to begin with", both.sat>0.35 && both.warm>1.5, JSON.stringify(both));

    // BREAK A — the one placed FIRST — and leave B alone.
    await page.evaluate(`__hc.cmdRun('/setblock ${AX} ${GY+1} ${AZ} air')`);
    for(let i=0;i<16;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(350); }
    await sleep(1600); await pin();
    const gone=await page.evaluate(`({ a:__hc.blockAt(${AX},${GY+1},${AZ}), b:__hc.blockAt(${BX},${GY+1},${BZ}) })`);
    check('A is gone and B is still there', gone.a===0 && gone.b>0, JSON.stringify(gone));
    const after=await sample('after-break-A');
    console.log(`  A broken, B untouched     ${JSON.stringify(after)}`);
    // THE CLAIM. B never moved, so its pool must still be lit and warm. If the chunk's light volume was destroyed, the baked light
    // is gone from every fragment in the chunk and B's pool greys out — that is Ben's "the entire chunk becomes white washed".
    check("B's pool is STILL coloured after A is broken", after.sat > both.sat*0.7,
      `sat ${both.sat} -> ${after.sat}`);
    check('and still warm', after.warm > 1.5, `warm ${both.warm} -> ${after.warm}`);
    check('and still lit', after.lum > both.lum*0.6, `lum ${both.lum} -> ${after.lum}`);

    // ---- STAGE 2: THE SAME-LOCAL-COORDS COLLISION, which is the mechanism itself ----------------------------------------------
    // `_lv` is indexed in the CENTRE CHUNK's padded frame, so a lamp at chunk-local (8,8,y) lands on the SAME index no matter which
    // chunk it is in. Give many chunks a lamp at identical local coords and identical level and the lazy clear has to fail: chunk N's
    // bake leaves that index holding exactly that level, chunk N+1's only emitter is `_lv[pi] < lvl` == false, it is rejected, no
    // emitter seeds the frame, bakeLight returns false and buildLightTexture DISPOSES the chunk's whole light volume.
    // The metric is `__hc.lightVols()`: a loaded chunk that HOLDS an emitter but has NO volume. Pixels cannot distinguish that from
    // a dim lamp; this can. Lamps go in mid-air (no platform) because only the bake is under test here, not the picture.
    // THE TWO LAMPS MUST BE ALONE IN THEIR OWN 3x3s AND FOUR CHUNKS APART. Alone, because one passing emitter anywhere in the 3x3
    // clears the buffer and rescues every other emitter with it — a 5x5 grid of lamps was tried first and could not fail for exactly
    // that reason. Four apart, so neither sits in the other's frame, and because an emitter-less chunk's bake returns WITHOUT
    // touching `_lv`, so P's flood survives every empty chunk that bakes between the two placements.
    // Both chunks WELL INSIDE rd 8 — the first attempt put Q nine chunks out, where a chunk is generated but never meshed and so has
    // no light volume for reasons that have nothing to do with the bake. Four chunks north of the platform row so neither 3x3 can
    // contain lamp B.
    const LY=GY+4, PCX=(CBX>>4)-2, QCX=PCX+4, CZ=(CBZ>>4)-4;
    const px=PCX*16+8, qx=QCX*16+8, pz=CZ*16+8, qz=CZ*16+8;
    const near=(vols,cx,cz)=>vols.emitters.filter(k=>{ const [a,b]=k.split(',').map(Number); return Math.abs(a-cx)<=1&&Math.abs(b-cz)<=1; });
    let v0=await page.evaluate(`__hc.lightVols()`);
    check('both target chunks and their neighbours start with no emitter at all',
      near(v0,PCX,CZ).length===0 && near(v0,QCX,CZ).length===0,
      `P ${PCX},${CZ}: ${near(v0,PCX,CZ).join(' ')||'clear'}   Q ${QCX},${CZ}: ${near(v0,QCX,CZ).join(' ')||'clear'}`);
    const drain=async()=>{ for(let i=0;i<25;i++){ const q=await page.evaluate(`__hc.editQ()`); if(q.relight===0&&q.remesh===0) break; await sleep(400); } await sleep(700); };
    // P FIRST, drained, so its flood is the last thing in `_lv`. Then Q, whose lone emitter has the SAME padded index and the SAME
    // level — `_lv[pi] < lvl` is false, it is rejected, and under the lazy clear nothing else can rescue the frame.
    await page.evaluate(`__hc.cmdRun('/setblock ${px} ${LY} ${pz} lantern')`); await drain();
    await page.evaluate(`__hc.cmdRun('/setblock ${qx} ${LY} ${qz} lantern')`); await drain();
    const both2=await page.evaluate(`({p:__hc.blockAt(${px},${LY},${pz}), q:__hc.blockAt(${qx},${LY},${qz})})`);
    check('both isolated lamps exist', both2.p>0&&both2.q>0, JSON.stringify(both2));
    const vols=await page.evaluate(`__hc.lightVols()`);
    console.log(`  P ${PCX},${CZ} then Q ${QCX},${CZ}   emitter chunks ${vols.emitters.length}, dark ${JSON.stringify(vols.dark)}`);
    check('every chunk holding an emitter has a light volume', vols.dark.length===0,
      `${vols.dark.length} of ${vols.emitters.length} emitter chunks have NO volume: ${vols.dark.slice(0,8).join(' ')}`);

    // ---- STAGE 3: THE SOAK, because the fault is an ORDERING and the order comes from streaming --------------------------------
    // The two stages above are single, controlled bakes and both PASS on the un-fixed build: a lone rejected emitter is rescued as
    // soon as any other emitter in the 3x3 passes, and the bake that runs immediately before the victim is usually a NEIGHBOUR, whose
    // frame is shifted 16 blocks so the victim's index reads 0. What is needed is the victim chunk baking straight after a bake in
    // ITS OWN frame — which is what a streaming world does constantly. So: fly, place, break, and watch the invariant.
    const stops=[];
    for(let i=0;i<14;i++){ const a=i*0.9; stops.push([CBX+Math.round(Math.cos(a)*(40+i*6)), CBZ+Math.round(Math.sin(a)*(40+i*6))]); }
    let darkSeen=[], prev=null;
    for(const [sx,sz] of stops){
      const y=await page.evaluate(`(()=>{ const g=__hc.groundY(${sx},${sz}); __hc.tpAt(${sx}+0.5,g+6,${sz}+0.5); return g; })()`);
      for(let i=0;i<12;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(300); }
      await page.evaluate(`__hc.cmdRun('/setblock ${sx} '+(${y}+3)+' ${sz} lantern')`);
      await sleep(260);
      // A SECOND edit in the same chunk one frame later — that is the pair of bakes the queue produces from ordinary building, and
      // the second one's emitter set is a subset of the first's.
      await page.evaluate(`__hc.cmdRun('/setblock '+(${sx}+2)+' '+(${y}+3)+' ${sz} planks')`);
      await sleep(260);
      if(prev) await page.evaluate(`__hc.cmdRun('/setblock ${prev[0]} '+(${prev[1]})+' ${prev[2]} air')`);
      prev=[sx,y+3,sz];
      await sleep(340);
      const v=await page.evaluate(`__hc.lightVols()`);
      if(v.dark.length) darkSeen.push(`@${sx},${sz} dark ${v.dark.join('|')}`);
    }
    console.log(`  soak: ${stops.length} stops, ${darkSeen.length} with a lit chunk holding NO volume`);
    for(const d of darkSeen.slice(0,6)) console.log('    '+d);
    check('no chunk anywhere loses its light volume while building at night', darkSeen.length===0,
      `${darkSeen.length}/${stops.length} stops: ${darkSeen.slice(0,3).join('  ')}`);

    check('no page errors', errs.length===0, errs.slice(0,2).join(' | ').slice(0,200));
    console.log(`\n  frames: bench/results/twolamp-*.png`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
