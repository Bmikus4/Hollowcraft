// THE BRACKET, at bearings where a coast actually recedes. The flank band-pass puts these trees at the ENDS of a
// coast run, so an inland bearing shows nothing however large they are made — which is what the first attempt at this
// measured. Sea-facing and coast-receding bearings only, range off, three apparent distances.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
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
  for(const [name,yaw] of [['sea90',1.571],['sea113',1.972],['coast293',5.105],['coast315',5.498]])
    for(const d of [2600,700,420]){
      await W.ev(`H.cam({yaw:${yaw}, pitch:0.01}); __hc.pines(true,{d:${d}})`); await sleep(550);
      await shots(W,`pb-${name}-${d}`,0.25,1);
    }
  console.log('shot 12');
  await W.ev(`__hc.pines(true,{d:2600});`);
}finally{ await W.close(); }
