// WHERE IS THE RANGE, AND HOW MUCH OF THE FRAME IS IT? tmp-horizon-dom's crop [0.333,0.400] was profiled before the
// range's height and gain were rebuilt (b3c73f7, 3ae450d, d7f5e3c), and a clamp taken to 0.30 moved that crop by 0.00 —
// which is a crop with no mountain in it, not a clamp that does nothing. __hc.mtn(false) removes the layer at runtime,
// so whatever changes between the two frames IS the range: sweep the yaw to find the bearing that has one, then print
// the rows it occupies at that bearing.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const rowDiff=(a,b)=>{ const A=decodePNG(fs.readFileSync(a)), B=decodePNG(fs.readFileSync(b)); const rows=[];
  for(let y=0;y<A.h;y++){ let s=0; for(let x=0;x<A.w;x++){ const i=(y*A.w+x)*A.ch;
      s+=(Math.abs(A.data[i]-B.data[i])+Math.abs(A.data[i+1]-B.data[i+1])+Math.abs(A.data[i+2]-B.data[i+2]))/3; }
    rows.push(s/A.w); } return { rows, h:A.h, mean:rows.reduce((x,y)=>x+y,0)/A.h, max:Math.max(...rows) }; };
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  // OFFSHORE AT SEA LEVEL, and both halves of that matter. goShore leaves the camera inside the wood (every frame
  // black), and lifting it 38 blocks — what tmp-horizon-dom does — flattens the range to a 3-degree sliver: the mask
  // says the peaks reach 110 world against an apparent distance of 320, so a camera at 94.6 sees 2.7 degrees of
  // mountain and a camera at 46 sees 12. The sweep found "no mountain at any bearing" both times, for two different
  // wrong reasons. -x is open water from goShore (bench/results/mw-on-3-0.png).
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(900); await pin(W,0.25);
  console.log('mtn dials:', JSON.stringify(await W.ev(`__hc.mtn(true)`)));
  console.log('mtn mask :', JSON.stringify(await W.ev(`__hc.mtnMask()`)));
  let best=null;
  for(let k=0;k<12;k++){
    const yaw=+(k*Math.PI/6).toFixed(3);
    await W.ev(`H.cam({yaw:${yaw}, pitch:0.02})`); await sleep(500);
    const a=(await shots(W,`mw-on-${k}`,0.25,1))[0];
    await W.ev(`__hc.mtn(false)`); await sleep(450);
    const b=(await shots(W,`mw-off-${k}`,0.25,1))[0];
    await W.ev(`__hc.mtn(true)`); await sleep(300);
    const d=rowDiff(a,b);
    const hit=d.rows.map((v,y)=>[y,v]).filter(r=>r[1]>1.5);
    console.log(`yaw ${(yaw*180/Math.PI).toFixed(0).padStart(4)}deg  meanDiff ${d.mean.toFixed(2).padStart(6)}  maxRow ${d.max.toFixed(1).padStart(6)}  rows ${hit.length?hit[0][0]+'..'+hit[hit.length-1][0]:'none'}`);
    if(!best||d.mean>best.mean) best={yaw,...d,hit};
  }
  if(best) console.log(`\nBEST yaw ${(best.yaw*180/Math.PI).toFixed(0)}deg  crop y [${(best.hit[0][0]/best.h).toFixed(3)}, ${(best.hit[best.hit.length-1][0]/best.h).toFixed(3)}]  maxRow ${best.max.toFixed(1)}`);
}finally{ await W.close(); }
