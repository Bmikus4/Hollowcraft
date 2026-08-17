// A BED CELL, PHOTOGRAPHED. mudSpots aims at BANKS near the player and its first pick was a coastal terrace with no
// mud in frame, which proves nothing either way. This scans for a submerged column the generator itself calls a bed —
// _inlandBed true, and ringed by land — then stands over it and looks down. If the bed rule survived the sea-floor fix
// this frame has mud under water in it.
import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`atSpawn()`); await sleep(1200);
  for(let i=0;i<40;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await pin(W,0.25); await sleep(500);
  // through the hook, because the generator's own functions are module-scoped and page.evaluate cannot see them —
  // `player is not defined` is what that looks like from out here
  const c=await W.ev(`__hc.mudBedCensus(220,3)`);
  console.log('census:', JSON.stringify({claimedAsBed:c.claimedAsBed, ringedByLand:c.ringedByLand, openWater:c.openWater}));
  const bs=(c.bedSamples&&c.bedSamples[0])||null;
  const cell=bs?{x:bs.at[0], z:bs.at[1], h:bs.h, land:bs.landOf16}:null;
  console.log('bed cell:', JSON.stringify(cell));
  if(cell){
    // looking down the -z axis at it from ten blocks away and fourteen up: yaw = atan2(-(dx), -(dz)) with dx 0, dz -10
    await W.ev(`__hc.tpAt(${cell.x}, ${cell.h+14}, ${cell.z+10}); H.cam({yaw:Math.atan2(0, 10), pitch:-0.8});`);
    for(let i=0;i<30;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
    await sleep(2500);
    await shots(W,'mud-bed',0.25,1);
  }
}finally{ await W.close(); }
