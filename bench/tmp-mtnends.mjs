// THE RUN'S OTHER ENDS, and dusk. Tapering the height by presence fixes the end that was in frame; the risk is that it
// has also sunk the range everywhere the inland gate is merely middling, which would be a horizon that has quietly
// gone flat. Four bearings, two hours, plain frames.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  console.log('mask:', JSON.stringify(await W.ev(`__hc.mtnMask()`)));
  for(const [hour,t] of [['noon',0.25],['dusk',0.46]]){
    await pin(W,t); await sleep(800); await pin(W,t);
    for(const yaw of [3.14,3.665,4.19,5.24]){
      await W.ev(`H.cam({yaw:${yaw}, pitch:0.04})`); await sleep(450);
      await shots(W,`end-${hour}-${Math.round(yaw*57)}`,t,1);
    }
  }
  console.log('shot 8 frames');
}finally{ await W.close(); }
