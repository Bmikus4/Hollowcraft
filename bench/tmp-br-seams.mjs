// THE LINES ABOVE DOORWAYS, and WALL EDGES POKING THROUGH WALLS (Ben 07-28). Both are a few pixels wide, so this magnifies
// instead of squinting: it screenshots, crops the region just above an opening, upscales it 5x with smoothing OFF so a 1px
// seam stays 1 block wide, and also takes a per-COLUMN luminance profile of that crop. A vertical seam shows up as a sharp
// column-to-column jump, and its x position says which geometry edge is drawing it.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
// crop [x0,x1]x[y0,y1] in 0..1 of the frame, upscale by k with smoothing off, return {dataUrl, cols:[per-column luminance]}
async function magnify(page, box, k){
  const png=(await page.screenshot({type:'png'})).toString('base64');
  return await page.evaluate(async ({png,box,k})=>{
    const img=new Image(); img.src='data:image/png;base64,'+png; await img.decode();
    const sx=Math.round(box[0]*img.width), sy=Math.round(box[1]*img.height);
    const sw=Math.max(1,Math.round((box[2]-box[0])*img.width)), sh=Math.max(1,Math.round((box[3]-box[1])*img.height));
    const src=document.createElement('canvas'); src.width=sw; src.height=sh;
    const sg=src.getContext('2d'); sg.drawImage(img,sx,sy,sw,sh,0,0,sw,sh);
    const d=sg.getImageData(0,0,sw,sh).data, cols=[];
    for(let x=0;x<sw;x++){ let s=0; for(let y=0;y<sh;y++){ const i=(y*sw+x)*4; s+=d[i]*0.2126+d[i+1]*0.7152+d[i+2]*0.0722; }
      cols.push(+(s/sh/255).toFixed(4)); }
    const big=document.createElement('canvas'); big.width=sw*k; big.height=sh*k;
    const bg=big.getContext('2d'); bg.imageSmoothingEnabled=false; bg.drawImage(src,0,0,sw*k,sh*k);
    return { url:big.toDataURL('image/png'), cols, sw, sh };
  }, {png,box,k});
}
const saveDataUrl=(url,file)=>fs.writeFileSync(file, Buffer.from(url.split(',')[1],'base64'));
// THE SHARPEST HAIRLINE, which is NOT the sharpest column-to-column jump. A doorframe's return face is a shaded RAMP —
// the door variant of this test was reporting a 0.03 "seam" that was really seven columns of smooth gradient down the
// casing, and it survived suppressing shadows, caps, lintels and the arch because it was never any of them. It sent two
// sessions chasing it. A seam is a ONE-COLUMN step; a ramp has a large first difference and almost no second difference.
// So score the second difference — |2c[i] - c[i-1] - c[i+1]| — which a hairline maximises and a gradient cancels.
const worstJump=(cols)=>{ let best=0, at=0;
  for(let i=1;i<cols.length-1;i++){ const j=Math.abs(2*cols[i]-cols[i-1]-cols[i+1]); if(j>best){best=j;at=i;} }
  return { jump:+best.toFixed(4), at, of:cols.length }; };
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e).slice(0,200)); console.log('PAGEERROR:',String(e.message||e).slice(0,200)); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(5500);
    await page.evaluate(`__hc.aim(false)`);

    // ---- 1. ABOVE A DOORWAY ----
    for(const kind of ['empty','door']){
      const op=await page.evaluate(`window.__hcBR.faceOpening('${kind}',3.4)`);
      if(!op){ T('an opening of kind '+kind+' exists', false); continue; }
      await sleep(900);
      // LIT LIKE A TROFFER, which is Ben's condition: a strong point light near the ceiling and offset INTO the room. The first
      // version put the lamp exactly on the wall line — a light inside the masonry — and its shadow boundary fell at the same
      // screen column in every shot, so I was measuring my own lamp. A dim wall proves nothing either: the seam only shows
      // where the masonry is brightly lit, which is exactly under a tube.
      const nx=op.vert?1:0, nz=op.vert?0:1, sg=op.sgn||1;
      await page.evaluate(`__hc.qaAt(${op.cx+nx*2.0*sg},${(op.fy||41)+6.4},${op.cz+nz*2.0*sg},34)`);
      await page.evaluate(`__hc.look(${op.cx},${(op.fy||41)+3.9},${op.cz})`);
      await sleep(800);
      await page.screenshot({path:path.join(OUT,'seam-'+kind+'-frame.png')});
      const m=await magnify(page,[0.30,0.16,0.70,0.46],5);
      saveDataUrl(m.url, path.join(OUT,'seam-'+kind+'-x5.png'));
      const w=worstJump(m.cols);
      console.log(kind, JSON.stringify(op), '  worst column jump:', JSON.stringify(w));
      console.log('   column profile:', JSON.stringify(m.cols));
      // A seam reads as a jump against an otherwise smooth wall. The wall's own texture has grain, so the bar is set against
      // the TYPICAL neighbouring-column difference rather than an absolute number.
      const diffs=m.cols.slice(1).map((v,i)=>Math.abs(v-m.cols[i])).sort((a,b)=>a-b);
      const median=diffs[Math.floor(diffs.length/2)]||1e-4;
      console.log('   median column-to-column difference:', median.toFixed(5), ' worst/median:', (w.jump/median).toFixed(1));
      // Against the wall's OWN grain, with no absolute floor. An earlier version allowed anything under 0.02 outright, which
      // passed a seam standing 20x above the surrounding noise — the exact line being hunted.
      // ABSOLUTE, with the ratio reported alongside. A ratio-only test is unstable here: an unlit wall is almost perfectly
      // flat (median 0.0001), so any real geometry edge is 30x that while being 0.3% of luminance and invisible. The dashed
      // line under a nearby point light measured 0.010-0.015, so the bar sits well under that.
      // ONLY THE 'empty' VARIANT IS AN ASSERTION. Its crop is plain masonry above an open doorway, so any sharp column is a
      // seam. The 'door' variant frames the opening itself — the leaf, the casing's shaded return, and the wall-to-dark
      // silhouette, all antialiased — and its worst column is one of THOSE every time, whatever the masonry is doing. It
      // reported ~0.03 while suppressing shadows, caps, lintels and the arch each left it untouched, because it was never
      // measuring any of them; two sessions read that as "the seam is none of these" when it meant "this crop cannot see the
      // seam". Reported, not asserted, so it stops sending anyone down that road.
      if(kind==='empty') T('above an empty doorway there is no visible seam', w.jump < 0.008,
        {worstJump:w.jump, median:+median.toFixed(5), ratio:+(w.jump/median).toFixed(1), atColumn:w.at, of:w.of});
      else console.log('   [door crop — reported only, it frames the opening and its casing, not clean masonry] worst '
        +w.jump+' at col '+w.at);
      // BISECT. Rebuild the same view with one surface suppressed at a time; whichever removal takes the jump with it is the
      // surface drawing the line. Guessing was 0 for 2.
      const variants=[['shadows off', null, ()=>page.evaluate(`window.__hcBR.shadows(false)`), ()=>page.evaluate(`window.__hcBR.shadows(true)`)],
                      ['no wall caps', {noCaps:true}, null, null],
                      ['caps flush (inset 1.0)', {noCaps:false, capInset:1.0}, null, null],
                      ['no lintels', {noCaps:false, capInset:0.99, noLintels:true}, null, null],
                      ['no arch', {noLintels:false, noArch:true}, null, null]];
      for(const [label, dbg, pre, post] of variants){
        if(pre) await pre();
        if(dbg) await page.evaluate(`window.__hcBR.dbgGeom(${JSON.stringify(dbg)})`);
        await sleep(900);
        const mv=await magnify(page,[0.30,0.16,0.70,0.46],5); const wv=worstJump(mv.cols);
        const dv=mv.cols.slice(1).map((v,i)=>Math.abs(v-mv.cols[i])).sort((a,b)=>a-b);
        const md=dv[Math.floor(dv.length/2)]||1e-4;
        saveDataUrl(mv.url, path.join(OUT,'seam-'+kind+'-'+label.replace(/[^a-z0-9]+/gi,'-')+'-x5.png'));
        console.log('   ['+label+'] worst '+wv.jump+' at col '+wv.at+', median '+md.toFixed(5)+', ratio '+(wv.jump/md).toFixed(1));
        if(post) await post();
      }
      await page.evaluate(`window.__hcBR.dbgGeom({noCaps:false, noLintels:false, noArch:false, capInset:0.99})`); await sleep(700);
    }

    // ---- 2. WALL EDGES POKING THROUGH WALLS ----
    const poke=await page.evaluate(`window.__hcBRX.wallPokes()`);
    console.log('wall-end overshoot audit:', JSON.stringify({walls:poke.walls, pairs:poke.pairs, pokes:poke.pokes, worst:poke.worst}));
    for(const s of poke.sample.slice(0,5)) console.log('   ', JSON.stringify(s));
    T('no wall end pokes out through the far face of the wall it meets', poke.pokes===0, {pokes:poke.pokes, worst:poke.worst, sample:poke.sample.slice(0,4)});
    if(poke.sample.length){
      const s=poke.sample[0];
      const at=await page.evaluate(`window.__hcBR.goPoint(${s.x},${s.z},4.0,${(s.look||0)})`);
      await sleep(900);
      await page.evaluate(`__hc.qaAt(${s.x},${(at&&at.fy||41)+2.2},${s.z},60)`);
      await sleep(700);
      await page.screenshot({path:path.join(OUT,'seam-wallpoke.png')});
      console.log('photographed the worst overshoot at', JSON.stringify(s));
    }

    T('zero page errors', errs.length===0, errs.slice(0,4));
    await browser.close();
  } finally { server.kill(); }
  console.log(fails? ('\n'+fails+' FAILING') : '\nALL PASS');
  process.exit(fails?1:0);
})();
