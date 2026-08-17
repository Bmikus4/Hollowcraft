// HOW FAR OFF THE GROUND ARE HER FEET, in blocks. The frames show her floating with her legs splayed, and
// __hc.human() reports footY 89.99 against groundY 45 — a 45-block gap that is too large to be a pose and is the
// Box3-over-SkinnedMesh artefact the brief suspects. So take both readings on the SAME body: the group's own y, the
// world-space bottom of its bounding box, and the terrain height under her. If the box bottom sits at the terrain and
// only the reported footY is wrong, this is a probe bug; if the box bottom is above the terrain, she really floats.
import { openWorld, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1000, h:560 });
try{
  await W.ev(HELPERS);
  await W.ev(`atSpawn()`); await sleep(1500);
  for(let i=0;i<40;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await pin(W,0.25); await sleep(600);
  await W.ev(`__hc.cmdRun('/spawn foxgirl 1 8')`); await sleep(2500);
  console.log(await W.ev(`(function(){
    const f=__hc.foxgirl(); if(!f||!f.at) return JSON.stringify(f);
    const gy=H.surfH(Math.round(f.at[0]), Math.round(f.at[2]));
    return JSON.stringify({ at:f.at, surfH:gy, groupY:f.at[1], boxHeight:f.height,
      boxMinY:f.boxMinY, groundY:f.groundY, footGap:f.footGap });
  })()`));
  // the bone the feet hang off, in world space, is the reading that settles it
  console.log(await W.ev(`(function(){ const p=__hc.foxgirlPose(); return JSON.stringify(p); })()`));
}finally{ await W.close(); }
