// A1, THE SIX FAULTS IN BEN'S 00:25 FRAME, checked one at a time against the build. That frame is the MOUNTAINS — its
// slab is topped by a jagged white snow line, which is a snow cap and not a pine crown — so these are the mountain
// layer's faults, and 5821d57 at 00:48 was the answer to them that stopped the shader compiling.
// The vantage is his: on the sand at standing eye height, sea to one side, looking along the coast. H.surfH finds the
// beach so the camera is not left inside the wood, which is where goShore lands and why every frame there is black.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const px=f=>decodePNG(fs.readFileSync(f));
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  // walk out from the shore point toward the water and stop on the last dry column: that is the beach.
  const spot = await W.ev(`(function(){ goShore(); const p=__hc.pos(); const sea=40;
    let bx=p.x, bz=p.z;
    for(let r=0;r<200;r+=2){ const x=Math.round(p.x-r), z=Math.round(p.z);
      const h=H.surfH(x,z); if(h<=sea+1) break; bx=x; bz=z; }
    const gy=H.surfH(Math.round(bx),Math.round(bz));
    __hc.tpAt(bx, gy+2, bz); return {bx,bz,gy}; })()`);
  console.log('beach at', JSON.stringify(spot));
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(900); await pin(W,0.25);
  // find the bearing with the most range in it, the way Ben would by turning on the spot
  await W.ev(`__hc.mtnDbg(3)`); await sleep(400);
  let best=null;
  for(let k=0;k<16;k++){ const yaw=+(k*Math.PI/8).toFixed(3);
    await W.ev(`H.cam({yaw:${yaw}, pitch:0.02})`); await sleep(320);
    const P=px((await shots(W,`a1-scan-${k}`,0.25,1))[0]); let n=0;
    for(let y=0;y<P.h;y++) for(let x=0;x<P.w;x++){ const i=(y*P.w+x)*P.ch;
      if(P.data[i]>P.data[i+1]+25 && P.data[i+2]>P.data[i+1]+25) n++; }
    if(!best||n>best.n) best={yaw,n};
  }
  console.log('best bearing', JSON.stringify(best));
  await W.ev(`H.cam({yaw:${best.yaw}, pitch:0.02})`); await sleep(400);
  // FAULT 2 (translucent) and FAULT 3 (floating): with the layer painted flat, how much sky/sea shows through it, and
  // does its lowest row reach the waterline. The waterline is found from the layer-off frame's sea/sky boundary.
  const mag=px((await shots(W,'a1-magenta',0.25,1))[0]);
  await W.ev(`__hc.mtnDbg(0)`); await sleep(300);
  const on=px((await shots(W,'a1-on',0.25,1))[0]);
  await W.ev(`__hc.mtn(false)`); await sleep(500);
  const off=px((await shots(W,'a1-off',0.25,1))[0]);
  await W.ev(`__hc.mtn(true)`);
  let n=0, thr=0, botRow=-1, cols=new Set();
  for(let y=0;y<mag.h;y++) for(let x=0;x<mag.w;x++){
    const i=(y*mag.w+x)*mag.ch;
    if(!(mag.data[i]>mag.data[i+1]+25 && mag.data[i+2]>mag.data[i+1]+25)) continue;
    n++; cols.add(x); if(y>botRow) botRow=y;
    // "see-through" = the pixel still carries what was behind it. Compare the lit frame against the layer-off frame:
    // an opaque mountain has no memory of the sky it covered.
    const d=(Math.abs(on.data[i]-off.data[i])+Math.abs(on.data[i+1]-off.data[i+1])+Math.abs(on.data[i+2]-off.data[i+2]))/3;
    if(d<12) thr++;
  }
  // the waterline: last row of the off-frame whose centre column is sea-blue
  let water=-1;
  for(let y=0;y<off.h;y++){ const i=(y*off.w+(off.w>>1))*off.ch;
    if(off.data[i+2]>off.data[i]+14 && 0.2126*off.data[i]+0.7152*off.data[i+1]+0.0722*off.data[i+2]<120){ if(y>water) water=y; } }
  console.log(`layer px ${n} over ${cols.size} columns   unchanged-from-off ${(100*thr/Math.max(n,1)).toFixed(1)}%   lowest layer row ${botRow}   waterline row ${water}`);
}finally{ await W.close(); }
