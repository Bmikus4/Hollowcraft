// DO THE COAST PINES HAVE BEN'S SIX FAULTS SEPARATELY? His 00:25 frame is the mountains — the slab is topped by a
// snow line — but A1 is titled SKYBOX PINES and the quad is still on by default (?pines=0 is the switch), so the
// question stands on its own. Same test as the range: toggle the layer, measure what changes, and look at it from the
// sand at eye height rather than from a bench vantage nobody plays at.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const px=f=>decodePNG(fs.readFileSync(f));
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  const spot = await W.ev(`(function(){ goShore(); const p=__hc.pos(); const sea=40; let bx=p.x, bz=p.z;
    for(let r=0;r<200;r+=2){ const x=Math.round(p.x-r), z=Math.round(p.z); const h=H.surfH(x,z); if(h<=sea+1) break; bx=x; bz=z; }
    __hc.tpAt(bx, H.surfH(Math.round(bx),Math.round(bz))+2, bz); return {bx,bz}; })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(900); await pin(W,0.25);
  console.log('pines dial:', JSON.stringify(await W.ev(`__hc.pines(true)`)), 'at', JSON.stringify(spot));
  // the range OFF for all of this: two horizon layers in one crop is how the last set of readings went wrong.
    for(let k=0;k<8;k++){
    const yaw=+(k*Math.PI/4).toFixed(3);
    await W.ev(`H.cam({yaw:${yaw}, pitch:0.02})`); await sleep(350);
    const a=px((await shots(W,`pc-on-${k}`,0.25,1))[0]);
    await W.ev(`__hc.pines(false)`); await sleep(400);
    const b=px((await shots(W,`pc-off-${k}`,0.25,1))[0]);
    await W.ev(`__hc.pines(true)`); await sleep(350);
    let n=0, y0=1e9, y1=-1, cols=new Set();
    for(let y=0;y<a.h;y++) for(let x=0;x<a.w;x++){ const i=(y*a.w+x)*a.ch;
      const d=(Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]))/3;
      if(d>10){ n++; cols.add(x); if(y<y0)y0=y; if(y>y1)y1=y; } }
    console.log(`yaw ${String(Math.round(yaw*57.3)).padStart(3)}deg  changed px ${String(n).padStart(6)}  cols ${String(cols.size).padStart(4)}  rows ${y1<0?'none':y0+'..'+y1}`);
  }
}finally{ await W.close(); }
