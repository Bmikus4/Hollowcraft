// The coast with the fringe in place, from the sand at eye height. The census says 131 columns went under and no new
// two-block step opened; this is the picture that has to agree with it — a waterline one block further in, and no
// cliff under the grass.
import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); const sea=40; let bx=p.x, bz=p.z;
    for(let r=0;r<200;r+=2){ const x=Math.round(p.x-r), z=Math.round(p.z); if(H.surfH(x,z)<=sea+1){ bx=x; bz=z; break; } }
    __hc.tpAt(bx+10, 46, bz); H.cam({yaw:Math.atan2(-(bx-(bx+10)), 0), pitch:-0.25}); })()`);
  for(let i=0;i<40;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(2500); await pin(W,0.25); await sleep(600);
  console.log('census here:', JSON.stringify(await W.ev(`__hc.coastCensus(60,1)`)));
  await shots(W,'coast-fringe',0.25,1);
}finally{ await W.close(); }
