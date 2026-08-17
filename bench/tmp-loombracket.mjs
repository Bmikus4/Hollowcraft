// THE LOOM BRACKET, for Ben's eye. The 20 degrees on the dial was called on a frame in which this shader did not
// compile, so it is not a judgement anyone has actually made yet. The angle is now geometry — the tallest peak the
// mask holds is stood at rise/tan(loom), so the dial IS the ridge line and the crags ride a quarter above it — which
// means these three frames differ by exactly one honest quantity. Also shot from 120 blocks up, because the distance
// is now derived from the camera's height and that is the case where a derived distance can run away.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); H.cam({yaw:3.665, pitch:0.04}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  for(const [hour,t] of [['noon',0.25],['dusk',0.46]]){
    await pin(W,t); await sleep(800); await pin(W,t);
    for(const deg of [14,20,26]){
      const st=await W.ev(`__hc.mtn(true,{deg:${deg}})`); await sleep(700);
      await shots(W,`loom-${hour}-${deg}`,t,1);
      if(hour==='noon') console.log(`${deg}deg -> wall ${Math.round((await W.ev(`__hc.mtnMask()`)).wall)} blocks`);
    }
  }
  // FROM ALTITUDE: rise = peak - camY, so a camera above the peaks would divide by nothing without the floor.
  await W.ev(`__hc.mtn(true,{deg:20})`);
  await W.ev(`(function(){ const p=__hc.pos(); __hc.tpAt(p.x, 300, p.z); H.cam({yaw:3.665, pitch:-0.20}); })()`);
  await sleep(2500); await pin(W,0.25); await sleep(800);
  console.log('from y=300:', JSON.stringify(await W.ev(`__hc.mtnMask()`)));
  await shots(W,'loom-high',0.25,1);
}finally{ await W.close(); }
