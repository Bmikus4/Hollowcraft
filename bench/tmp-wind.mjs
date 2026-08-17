import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS); await W.ev(`goForest&&goForest(); H.cam({yaw:0.7,pitch:0.12});`); await sleep(1500);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(2500); await pin(W,0.25); await sleep(500);
  // two frames a second apart with the clock pinned: anything that moves is the wind
  const a=(await shots(W,'wind-a',0.25,1))[0];
  await sleep(1100);
  const b=(await shots(W,'wind-b',0.25,1))[0];
  const A=decodePNG(fs.readFileSync(a)), B=decodePNG(fs.readFileSync(b));
  let moved=0, n=0;
  for(let y=0;y<A.h*0.6;y++) for(let x=0;x<A.w;x++){ const i=(y*A.w+x)*A.ch;
    const d=(Math.abs(A.data[i]-B.data[i])+Math.abs(A.data[i+1]-B.data[i+1])+Math.abs(A.data[i+2]-B.data[i+2]))/3;
    n++; if(d>6) moved++; }
  console.log('canopy pixels that moved between two frames:', (100*moved/n).toFixed(2)+'%');
}finally{ await W.close(); }
