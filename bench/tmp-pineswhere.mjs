// WHERE DO THE COAST PINES DRAW AT ALL? At six times their shipped apparent size they are still absent from the sea
// horizon at every bearing where the coast runs off past the wall, and the only bearing whose toggle moved anything
// was an INLAND one. Two possibilities with opposite fixes: they are drawn where nothing can see them, or they are not
// drawn. Crank the gain until they cannot be missed and sweep the whole circle.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const px=f=>decodePNG(fs.readFileSync(f));
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); const sea=40; let bx=p.x, bz=p.z;
    for(let r=0;r<200;r+=2){ const x=Math.round(p.x-r), z=Math.round(p.z); const h=H.surfH(x,z); if(h<=sea+1) break; bx=x; bz=z; }
    __hc.tpAt(bx, H.surfH(Math.round(bx),Math.round(bz))+2, bz); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(900); await pin(W,0.25);
  console.log('dial:', JSON.stringify(await W.ev(`__hc.pines(true,{d:420, gain:6, fogMul:0})`)));
  await sleep(700);
  for(let k=0;k<16;k++){
    const yaw=+(k*Math.PI/8).toFixed(3);
    await W.ev(`H.cam({yaw:${yaw}, pitch:0.03})`); await sleep(330);
    const a=px((await shots(W,`pw-on-${k}`,0.25,1))[0]);
    await W.ev(`__hc.pines(false)`); await sleep(330);
    const b=px((await shots(W,`pw-off-${k}`,0.25,1))[0]);
    await W.ev(`__hc.pines(true)`); await sleep(250);
    // count only pixels that got BRIGHTER by a lot: a gain-6 backdrop appearing is a one-way change, waves are not
    let n=0, y0=1e9, y1=-1;
    for(let y=0;y<a.h;y++) for(let x=0;x<a.w;x++){ const i=(y*a.w+x)*a.ch;
      const la=0.2126*a.data[i]+0.7152*a.data[i+1]+0.0722*a.data[i+2];
      const lb=0.2126*b.data[i]+0.7152*b.data[i+1]+0.0722*b.data[i+2];
      if(la-lb>25){ n++; if(y<y0)y0=y; if(y>y1)y1=y; } }
    console.log(`yaw ${String(Math.round(yaw*57.3)).padStart(3)}deg  brightened px ${String(n).padStart(6)}  rows ${y1<0?'none':y0+'..'+y1}`);
  }
  await W.ev(`__hc.pines(true,{d:2600, gain:0.42, fogMul:0.1}); `);
}finally{ await W.close(); }
