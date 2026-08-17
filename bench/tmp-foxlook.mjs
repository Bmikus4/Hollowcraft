// HER AT 7.2 BLOCKS, ALL ROUND — the eye check A2 asks for: textured everywhere, no holes where the bikini and bra
// were, feet on the ground. Four bearings at 12 blocks with the camera at her mid-height, because from 7.2 blocks a
// 7.2-block body does not fit in a 74-degree frame and "no holes" cannot be judged on a crop of her waist.
// CAMERA FORWARD IS (-sin yaw, -cos yaw), so looking AT a target is yaw = atan2(-(tx-px), -(tz-pz)). Both deltas are
// negated. atan2(dx, dz) — the version that looks right and is used elsewhere in bench/ — points the camera exactly
// 180 degrees away, and the frame it returns is a perfectly good picture of the scenery behind you.
import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`atSpawn()`); await sleep(1500);
  for(let i=0;i<40;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await pin(W,0.25); await sleep(600);
  await W.ev(`__hc.cmdRun('/spawn foxgirl 1 8')`); await sleep(2500);
  await W.ev(`__hc.cinema(true); __hc.freezeT(120)`);
  const f=await W.ev(`__hc.foxgirl()`);
  console.log('at', JSON.stringify(f.at), 'height', f.height);
  for(const [name,ang] of [['front',0],['right',Math.PI/2],['back',Math.PI],['left',-Math.PI/2]]){
    const R=12;
    await W.ev(`(function(){ const f=__hc.foxgirl(); const x=f.at[0]+Math.sin(${ang})*${R}, z=f.at[2]+Math.cos(${ang})*${R};
      // ABOVE THE LOCAL GROUND, not just above hers: the spawn wood is on a slope and a camera at her mid-height is
      // inside a trunk two of the four times round, which is a black frame that looks exactly like a missing model.
      const gy=H.surfH(Math.round(x), Math.round(z));
      __hc.tpAt(x, Math.max(f.at[1]+3.6, gy+4), z);
      const p=__hc.pos(); H.cam({ yaw: Math.atan2(-(f.at[0]-p.x), -(f.at[2]-p.z)), pitch: 0 }); })()`);
    await sleep(800);
    await shots(W,`fox-${name}`,0.25,1);
  }
  console.log('shot 4');
}finally{ await W.close(); }
