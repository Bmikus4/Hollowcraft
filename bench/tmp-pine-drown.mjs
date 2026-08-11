// WHERE THE TREELINE'S TAPER ACTUALLY DRAWS, and what changing its haze TARGET is worth there.
//
// The taper — `1.0 - smoothstep(0.0, 0.22, hs)` — pins the band to the haze colour wherever the phantom coastline runs
// past the real forest. It was drowning toward uFogCol, a near-white; it now drowns toward uSky*0.78 like the mountains
// do. This finds the pixels that changed rather than assuming a crop holds them, which is the trap the mountains cost
// two rounds of tuning to learn: their first two passes were tuned against a band that moved 0.04 of 255.
//
//   node bench/tmp-pine-drown.mjs
import { openWorld, shots, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
function load(f){ const P=decodePNG(fs.readFileSync(f)); return P; }
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x,p.y+38,p.z); H.cam({pitch:-0.16}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120); __hc.setTime(0.42)`);
  await sleep(1200); await W.ev(`__hc.setTime(0.42)`); await sleep(1500);
  const grab=async(v)=>{ await W.ev(`__hc.pines({drownSky:${v}})`); await sleep(700);
    return load((await shots(W,`pd-${v}`,null,1))[0]); };
  // A, B, THEN A AGAIN. The sea, the foliage and the cloud field all move between two screenshots taken a second apart,
  // and at midday the sea is the brightest thing in the frame, so a raw A/B says 20% of the frame changed whatever the
  // dial did. A2 against A is that noise with the dial held still, and nothing under it can be claimed.
  const A=await grab(0), B=await grab(1), A2=await grab(0);
  const w=A.w, h=A.h;
  // Row and column profiles of |B-A|, so the region announces itself.
  const rows=new Float64Array(h), cols=new Float64Array(w); let moved=0, tot=0, sumA=0, sumB=0, noise=0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=(y*w+x)*A.ch, la=lum(A.data,i), lb=lum(B.data,i), l2=lum(A2.data,i);
    const d=Math.abs(lb-la), dn=Math.abs(l2-la);
    rows[y]+=Math.max(0,d-dn); cols[x]+=Math.max(0,d-dn); tot++;
    if(dn>2) noise++;
    if(d>2 && dn<=2){ moved++; sumA+=la; sumB+=lb; } }
  console.log(`  frame-to-frame noise with the dial held still: ${(100*noise/tot).toFixed(3)}% of pixels`);
  const top=(arr,n,label)=>{ const idx=[...arr.keys()].sort((a,b)=>arr[b]-arr[a]).slice(0,n);
    console.log(`  strongest ${label}: ${idx.map(i=>`${i}(${(arr[i]/(label==='rows'?w:h)).toFixed(1)})`).join(' ')}`); };
  console.log(`  pixels moved by more than 2 of 255: ${(100*moved/tot).toFixed(3)}%  (${moved})`);
  if(moved) console.log(`  those pixels: fogCol target ${(sumA/moved).toFixed(1)} -> sky target ${(sumB/moved).toFixed(1)}`);
  top(rows,6,'rows'); top(cols,6,'cols');
  // And the same frame's REAL wood, to keep the comparison the resume file uses.
  const wood=[0.02,0.34,0.60,0.667];
  const crop=(P,c)=>{ const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0; let s=0,n=0;
    for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ s+=lum(P.data,(y*P.w+x)*P.ch); n++; } return +(s/n).toFixed(2); };
  console.log(`  real wood crop: ${crop(A,wood)} -> ${crop(B,wood)}   (must not move: the drown is gated off over real forest)`);
}finally{ await W.close(); }
