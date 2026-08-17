// The two frames the mud rule has to satisfy at once: the sea floor off a beach must be SAND, and a river bed must
// still be MUD. A change that fixes the first by breaking the second is the obvious failure mode, so both are shot in
// one run from generator-chosen positions rather than from anywhere I happen to like the look of.
import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`atSpawn()`); await sleep(1200);
  for(let i=0;i<40;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await pin(W,0.25); await sleep(600);
  console.log('dry-side census:', JSON.stringify(await W.ev(`(()=>{const c=__hc.mudCensus(); return {dry:c.dry,mud:c.mud,mudFrac:c.mudFrac,sand:c.sand};})()`)));
  const spots=await W.ev(`__hc.mudSpots(160)`);
  console.log('mud spots:', JSON.stringify(spots && spots.slice ? spots.slice(0,3) : spots));
  // 1. the beach shallows: walk out from the shore to the waterline and look DOWN into the water
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); const sea=40; let bx=p.x, bz=p.z;
    for(let r=0;r<200;r+=2){ const x=Math.round(p.x-r), z=Math.round(p.z); if(H.surfH(x,z)<=sea+1) { bx=x; bz=z; break; } }
    __hc.tpAt(bx+6, 44, bz); H.cam({yaw:Math.atan2(-(bx-(bx+6)), 0), pitch:-0.55}); })()`);
  await sleep(1800); await shots(W,'mud-seafloor',0.25,1);
  // 2. a river bank the generator picked
  const ok=await W.ev(`(function(){ const s=__hc.mudSpots(200); if(!s||!s.length) return false;
    const t=s[0]; __hc.tpAt(t.x, H.surfH(Math.round(t.x),Math.round(t.z))+4, t.z); H.cam({pitch:-0.65}); return t; })()`);
  console.log('river spot:', JSON.stringify(ok));
  await sleep(1800); await shots(W,'mud-river',0.25,1);
}finally{ await W.close(); }
