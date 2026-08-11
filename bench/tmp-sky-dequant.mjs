// §1 STEP 1: does per-corner sky kill the block-shaped stepping, and does it move anything else?
//
// Two metrics, because they answer different questions and one of them is noise-free:
//   MECHANISM — __hc.skyQuads() reads aSky straight off the GPU buffers. No clock, no wind, no tone mapping.
//               A quad that is "flat" has all four corners equal, which is the old behaviour by construction.
//   PICTURE   — the biggest luminance step between adjacent pixel COLUMNS and ROWS, which is the metric the plan
//               names. Block-shaped stepping is one large step at a block boundary; a gradient is many small
//               ones. So the max step falls and the mean step rises if this worked.
//
// §4 rules honoured: the vantage is not SEARCHED for, it is READ OFF THE BUFFERS — the worst quad's own world
// position and normal, preferring quads whose corners straddle the _open knee, which is where one 4-bit step
// flips the whole scotopic wash (rule 1, by construction). It is shot square-on along that normal at 2.6
// blocks: far enough that the crop spans the quad AND the neighbours it shares its hard seam with, near enough
// to stay at mip 0 on a 16px tile (rule 2). The clock and wind are pinned and the off baseline is repeated at
// the end (rule 3), the A/B toggles exactly one dial with everything else restored (rule 4), and both metrics
// are raw quantities, not ratios over a shrinking denominator (rule 5).
//
// Two earlier versions of this file measured nothing, both for rule-1 reasons, and both are recorded above the
// code that fixes them: one scored its way onto a wall with a single sky level across it, and one cropped the
// interior of a single quad, where by construction there is no seam.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT=path.join(ROOT,'bench/results');
function findBrowser(){ const c=[process.env.HC_CHROME,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean);
  for(const p of c) if(fs.existsSync(p)) return p; return undefined; }
const waitHttp=(url)=>new Promise((res,rej)=>{ let n=0; const t=setInterval(()=>{ http.get(url,r=>{ r.destroy(); clearInterval(t); res(); }).on('error',()=>{ if(++n>200){ clearInterval(t); rej(new Error('no server')); } }); },500); });

// Luminance of a crop, and the adjacent-COLUMN step profile within it.
function colProfile(png, box){
  const {w:W,h:H,ch,data}=png;   // decodePNG returns {w,h,ch,data}; ch is 3 or 4, so it cannot be assumed
  const x0=Math.round(box[0]*W), x1=Math.round(box[1]*W), y0=Math.round(box[2]*H), y1=Math.round(box[3]*H);
  const cols=[];
  for(let x=x0;x<x1;x++){ let s=0,n=0;
    for(let y=y0;y<y1;y++){ const i=(y*W+x)*ch; s+=0.2126*data[i]+0.7152*data[i+1]+0.0722*data[i+2]; n++; }
    cols.push(s/Math.max(1,n)); }
  // ROWS AS WELL AS COLUMNS: on an x- or z-face the sky ramps with HEIGHT (_skyCol is a vertical ramp over the six
  // blocks under a column's top), so a column-only profile is blind to exactly half the orientations.
  const rowsA=[];
  for(let y=y0;y<y1;y++){ let s=0,n=0;
    for(let x=x0;x<x1;x++){ const i=(y*W+x)*ch; s+=0.2126*data[i]+0.7152*data[i+1]+0.0722*data[i+2]; n++; }
    rowsA.push(s/Math.max(1,n)); }
  const prof=(a)=>{ let mx=0,sum=0,big=0; const st=[];
    for(let i=1;i<a.length;i++){ const d=Math.abs(a[i]-a[i-1]); st.push(d); sum+=d; if(d>mx)mx=d; if(d>2.0)big++; }
    st.sort((x,y)=>y-x);
    return { max:+mx.toFixed(2), p2:+(st[1]||0).toFixed(2), mean:+(sum/Math.max(1,st.length)).toFixed(3), over2:big }; };
  const C=prof(cols), R=prof(rowsA);
  const med=[...cols].sort((a,b)=>a-b)[cols.length>>1];
  return { colMax:C.max, col2nd:C.p2, colMean:C.mean, colOver2:C.over2,
           rowMax:R.max, row2nd:R.p2, rowMean:R.mean, rowOver2:R.over2,
           maxStep:Math.max(C.max,R.max), med:+med.toFixed(2), ncols:cols.length, nrows:rowsA.length };
}

(async()=>{
  const PORT=+(process.env.HC_PORT||8123); const base='http://127.0.0.1:'+PORT;
  await waitHttp(base+'/index.html');
  const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
  const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
  await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
  const page=await ctx.newPage();
  const errs=[];
  page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
  page.on('console',m=>{ const t=m.text(); if(/ERROR: 0:|GL_INVALID|shader/i.test(t)){ errs.push(t); console.log('  GLSL:',t.slice(0,300)); } });
  await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
  await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
  for(let i=0;i<300;i++){ if(await page.evaluate(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`)) break; await sleep(1000); }
  await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true);`);
  for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
  await sleep(1500);
  // PIN THE CLOCK AND THE WIND, or the sea and the foliage move 20% of the frame between the two halves of the A/B.
  await page.evaluate(`__hc.freezeT(0)`);
  const pin=async(t)=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(400); await page.evaluate(`__hc.setTime(${t})`); await sleep(300); };

  // ---- ASK THE GEOMETRY WHERE THE STEPPING IS, do not search for a vantage ----------------------------------
  // The first version of this harness searched for a wall by scoring candidates and landed on one with a SINGLE
  // 4-bit sky level across it — a crop that could not contain the fault, so its "no change" meant nothing. The
  // buffers already know: with smoothing on, every quad's corner spread is a number, so the worst quad's world
  // position IS the vantage. Rule 1 by construction rather than by hope.
  // PROBE IN ONE FIXED MODE, ALWAYS. The worst-quad list depends on the mode, so probing in whichever mode is
  // about to be measured picks a DIFFERENT vantage per row and the rows stop being comparable — one run of this
  // harness reported colMax 8.63 -> 6.23 and the next 13.77 -> 14.08 because they were photographing different
  // quads. Mode 1 selects; HC_QUAD=x,y,z pins it outright across runs.
  await page.evaluate(`__hc.skySmooth(1)`);
  for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
  await sleep(1200);
  const probe=await page.evaluate(`__hc.skyQuads()`);
  console.log(`  quads with a corner spread over 0.05: ${probe.steppy} of ${probe.quads};  straddling the _open knee: ${probe.kneeQuads}`);
  if(!probe.worst||!probe.worst.length){ console.log('  NO STEPPY QUAD ANYWHERE — nothing to measure; aborting'); await browser.close(); process.exit(2); }
  // Pick the worst quad that a camera can actually get 1.5 blocks in front of: step outward along whichever axis
  // has air, and require the two cells between eye and surface to be air so nothing occludes the crop.
  // AIM ALONG THE QUAD'S OWN NORMAL, and view it square-on. Stand 1.5 blocks out along +n, look back down -n.
  // For a y-face that means standing above and pitching down; the first run of this harness stood beside one at
  // pitch 0 and photographed an edge-on, invisible surface.
  // THE SEAM IS BETWEEN QUADS, NOT INSIDE ONE. Under face-flat sky a quad is uniform and its NEIGHBOUR is uniform
  // at a different value, so the hard edge sits on the shared boundary. The previous run cropped the interior of a
  // single 1x1 quad at 1.5 blocks and therefore contained no seam at all — which is why it read 9 -> 9 steps.
  // 2.6 blocks puts the quad and a ring of its neighbours in the crop; the texture is 16px so this is still mip 0.
  const DIST=2.6;
  const PIN=(process.env.HC_QUAD||'').split(',').map(Number);
  const eye=await page.evaluate(`(()=>{ const W=${JSON.stringify(probe.worst)}; const PIN=${JSON.stringify(PIN.length===3&&PIN.every(v=>!isNaN(v))?PIN:null)};
    // Prefer quads STRADDLING the _open knee: that is where one 4-bit step flips the whole scotopic wash.
    let ranked=W.slice().sort((a,b)=>(b.knee-a.knee)||(b.sp-a.sp));
    if(PIN){ const near=W.filter(q=>Math.abs(q.x-PIN[0])<0.6&&Math.abs(q.y-PIN[1])<0.6&&Math.abs(q.z-PIN[2])<0.6);
      if(!near.length) return {err:'HC_QUAD not among the steppy quads: '+PIN.join(',')};
      ranked=near; }
    for(const q of ranked){
      const n=q.n||[0,0,0]; const ext=q.ext||[0,0,0];
      // A sliver covers no pixels at any range. Demand at least one block across in both in-plane axes.
      const inPlane=[0,1,2].filter(a=>Math.abs(n[a])<0.5);
      if(inPlane.some(a=>ext[a]<1)) continue;
      const cx=q.x+n[0]*${DIST}, cy=q.y+n[1]*${DIST}, cz=q.z+n[2]*${DIST};
      // the whole run between eye and face must be air, or something nearer fills the crop
      let clear=true;
      for(let t=0.5;t<=${DIST}+0.01;t+=0.5){ if(__hc.blockAt(Math.floor(q.x+n[0]*t),Math.floor(q.y+n[1]*t),Math.floor(q.z+n[2]*t))>0){ clear=false; break; } }
      if(!clear) continue;
      // look back along -n. forward is (-sin yaw, -cos yaw), so to face (dx,dz) yaw = atan2(-dx,-dz); pitch is
      // positive-up, and for a pure y-face the yaw is irrelevant so any value works.
      const dx=-n[0], dy=-n[1], dz=-n[2];
      const yaw=Math.atan2(-dx,-dz);
      const pitch=Math.asin(Math.max(-1,Math.min(1,dy)));
      __hc.holdNone(); __hc.tpAt(cx,cy,cz); __hc.cam({yaw:yaw,pitch:pitch});
      return {q,n,ext,cx,cy,cz,yaw:+yaw.toFixed(3),pitch:+pitch.toFixed(3)};
    }
    return null; })()`);
  if(!eye||eye.err){ console.log('  NO REACHABLE STEPPY QUAD — aborting rather than cropping something else'+(eye&&eye.err?': '+eye.err:'')); await browser.close(); process.exit(2); }
  console.log(`  vantage: quad at ${eye.q.x},${eye.q.y},${eye.q.z} spread ${eye.q.sp} normal ${JSON.stringify(eye.n)} extent ${JSON.stringify(eye.ext)}`);
  console.log(`           eye ${eye.cx.toFixed(1)},${eye.cy.toFixed(1)},${eye.cz.toFixed(1)} yaw ${eye.yaw} pitch ${eye.pitch}`);
  await sleep(900);

  const WALL=[0.20,0.80,0.18,0.72];   // wide enough to span the quad and its neighbours, clear of the HUD
  const shoot=async(tag)=>{ const p=path.join(OUT,'skydq-'+tag+'.png'); await page.screenshot({path:p}); return colProfile(decodePNG(fs.readFileSync(p)),WALL); };

  const rows=[];
  const run=async(label,on,t)=>{
    const mesh=await page.evaluate(`__hc.skySmooth(${on})`);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(900);
    await pin(t);
    const q=await page.evaluate(`__hc.skyQuads()`);
    const px=await shoot(label);
    rows.push({label,on,t,q,px,mesh});
    console.log(`  ${label.padEnd(22)} remesh  ${JSON.stringify(mesh)}`);
    console.log(`  ${label.padEnd(22)} buffers ${JSON.stringify(q)}`);
    console.log(`  ${''.padEnd(22)} pixels  ${JSON.stringify(px)}`);
  };

  // INTERLEAVED, never blocked: this box has a failing cooling fan, so off/on/off measures drift as well as the dial.
  await run('noon-off',      0, 0.25);
  await run('noon-mean',     1, 0.25);
  await run('noon-max',      2, 0.25);
  await run('noon-off-again',0, 0.25);   // the repeated baseline row (§4 rule 3)
  await run('night-off',     0, 0.75);
  await run('night-mean',    1, 0.75);
  await run('night-max',     2, 0.75);

  const g=(l)=>rows.find(r=>r.label===l);
  const noise=Math.abs(g('noon-off').px.maxStep - g('noon-off-again').px.maxStep);
  console.log('');
  console.log(`  NOISE FLOOR (off vs off again, same dial): maxStep ${noise.toFixed(2)}  colMax ${Math.abs(g('noon-off').px.colMax-g('noon-off-again').px.colMax).toFixed(2)}  rowMax ${Math.abs(g('noon-off').px.rowMax-g('noon-off-again').px.rowMax).toFixed(2)}`);
  console.log('  MECHANISM (off / mean / max)');
  for(const k of ['flatPct','onLatticePct','spreadMax','spreadP90','kneeQuads'])
    console.log(`    ${k.padEnd(14)} ${g('noon-off').q[k]}  /  ${g('noon-mean').q[k]}  /  ${g('noon-max').q[k]}`);
  console.log('  REMESH COST, whole loaded world (off / mean / max)');
  console.log(`    ms            ${g('noon-off').mesh.ms}  /  ${g('noon-mean').mesh.ms}  /  ${g('noon-max').mesh.ms}   over ${g('noon-off').mesh.remeshed} chunks`);
  console.log(`    ms per chunk  ${g('noon-off').mesh.msPerChunk}  /  ${g('noon-mean').mesh.msPerChunk}  /  ${g('noon-max').mesh.msPerChunk}`);
  console.log('  PICTURE at the worst quad, square-on at 2.6 blocks (off / mean / max)');
  for(const t of ['noon','night']){
    const o=g(t+'-off'), me=g(t+'-mean'), mx=g(t+'-max'); if(!o||!me||!mx) continue;
    console.log(`    ${t.padEnd(6)} colMax ${o.px.colMax} / ${me.px.colMax} / ${mx.px.colMax}     rowMax ${o.px.rowMax} / ${me.px.rowMax} / ${mx.px.rowMax}     med ${o.px.med} / ${me.px.med} / ${mx.px.med}`);
  }
  console.log(`  page/GLSL errors: ${errs.length}`);
  console.log('  frames: bench/results/skydq-*.png');
  fs.writeFileSync(path.join(OUT,'skydq.json'), JSON.stringify(rows,null,1));
  await browser.close();
})();
