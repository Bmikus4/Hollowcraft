import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); const sea=40; let bx=p.x, bz=p.z;
    for(let r=0;r<220;r+=2){ const x=Math.round(p.x-r), z=Math.round(p.z); if(H.surfH(x,z)<=sea+1){ bx=x+2; bz=z; break; } }
    __hc.tpAt(bx, H.surfH(Math.round(bx),Math.round(bz))+2, bz); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(2500); await pin(W,0.25); await sleep(500);
  const p=await W.ev(`__hc.pinesProbe()`);
  console.log('canopyDeg', p.canopyDeg, 'lookYaw', p.strongestBearing.lookYaw, 'flank', p.strongestBearing.flank);
  await W.ev(`H.cam({yaw:${p.strongestBearing.lookYaw}, pitch:0.05}); __hc.pinesAll(0);`); await sleep(900);
  await shots(W,'pines-all',0.25,1);
}finally{ await W.close(); }
