// IS THE SEALED ROOM'S DAY LIFT FOG? DISTANCE ANSWERS IT, WITH NO DIAL.
//
// Ruled out at this vantage already, each interleaved with its baseline repeated last, noise floor 0.05:
//   the viewmodel      flat 1.27 at BOTH hours              (bench/tmp-sealed-hand.mjs)
//   the base level     0 / 0.10 / 0.15 all read 6.06-6.11   (bench/tmp-sealed-base.mjs)
//   the sky curve      exp 0.55 -> 3.0 closes 0% of the gap (bench/tmp-sealed-sky.mjs)
//   corner smoothing   on -> off closes 1% of the gap       (same)
// The sky results together prove vSky is a hard ZERO in this room, so no sky-scaled term can be the carrier.
// What is left, from the ground rules' own list of three fog systems, is scene.fog: a FogExp2 whose COLOUR is the
// sky's, bright by day and near-black at night, mixed in by view distance.
//
// Fog is separable from every additive light term by one property: it scales with DISTANCE. An added light does
// not. So this measures the same wall from the middle of the room and again with the camera pressed against it,
// at both hours. If the noon lift collapses when the wall is half a block away, it is fog.
//
//   node bench/tmp-sealed-fog.mjs
import { openWorld, pin, measure, CROP, fmt, sleep } from './lib/rig.mjs';

const NOON=0.25, NIGHT=0.75;

async function carveRoom(P, CX, CZ){
  const GY = await P.evaluate(`__hc.groundY(${CX}, ${CZ})`);
  const CY = Math.max(6, GY - 16);
  await P.evaluate(`(function(){ for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) for(let y=${CY};y<=${CY}+4;y++) __hc.cmdRun('/setblock '+(${CX}+dx)+' '+y+' '+(${CZ}+dz)+' air'); })()`);
  for(let i=0;i<40;i++){ const f=await P.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
  const roof = await P.evaluate(`(function(){ var n=0,a=__hc.bid('air'); for(var y=${CY}+5; y<=${GY}; y++) if(__hc.blockAt(${CX},y,${CZ})!==a) n++; return n; })()`);
  return { CY, GY, roof };
}

(async()=>{
  const W = await openWorld({ rd:8 });
  const P = W.page;
  try{
    const S = await P.evaluate(`__hc.st()`);
    const CX = Math.round(S.sx)+18, CZ = Math.round(S.sz)+18;
    const R = await carveRoom(P, CX, CZ);
    console.log(`  room roofed by ${R.roof} solid blocks`);
    await P.evaluate(`__hc.cinematic(true)`); await sleep(600);

    // Facing +x, so the far wall is the room's own +x face. Yaw for (dx,dz) is atan2(-dx,-dz) — forward is
    // (-sin yaw, -cos yaw), which is the one convention in this bench that has cost a run by being guessed.
    const YAW = Math.atan2(-1, 0);
    const FAR_X = CX-4+0.6, NEAR_X = CX+4-0.6;    // the room spans CX-4..CX+4; 0.6 in from each wall

    const rows=[];
    async function row(tag, t, x){
      await P.evaluate(`__hc.tp(${x}, ${R.CY+1.6}, ${CZ}, ${YAW}, 0)`); await sleep(500);
      await pin(W, t);
      const m = await measure(W, `sealedfog-${tag.replace(/[^a-z0-9]+/gi,'-')}`, t, { c:CROP.centre });
      const fi = await P.evaluate(`__hc.fogInfo()`);
      rows.push({ tag, lum:m.c.lum, fog:fi });
      console.log(`  ${tag.padEnd(26)} ${fmt(m.c)}`);
      console.log(`  ${''.padEnd(26)} fog density ${fi.density.toExponential(3)} colourLum ${fi.colorLum.toFixed(4)} day ${fi.day}`);
    }

    await row('noon  wall at ~7.4',  NOON,  FAR_X);
    await row('noon  wall at ~0.6',  NOON,  NEAR_X);
    await row('night wall at ~7.4',  NIGHT, FAR_X);
    await row('night wall at ~0.6',  NIGHT, NEAR_X);
    await row('noon  wall at ~7.4 (again)', NOON, FAR_X);

    const L=t=>{ const r=rows.find(r=>r.tag===t); return r?r.lum:NaN; };
    const nFar=L('noon  wall at ~7.4'), nNear=L('noon  wall at ~0.6');
    const gFar=L('night wall at ~7.4'), gNear=L('night wall at ~0.6');
    console.log('');
    console.log(`  noise floor        noon far ${nFar} then ${L('noon  wall at ~7.4 (again)')}`);
    console.log(`  noon  far -> near  ${nFar} -> ${nNear}   (${(nFar-nNear).toFixed(2)} lost to closing the distance)`);
    console.log(`  night far -> near  ${gFar} -> ${gNear}   (${(gFar-gNear).toFixed(2)})`);
    console.log(`  hour gap far ${(nFar-gFar).toFixed(2)}   hour gap near ${(nNear-gNear).toFixed(2)}`);
    console.log('');
    console.log('  If the hour gap shrinks with distance, it is fog and the fix is that interiors must not take a');
    console.log('  sky-coloured fog. If the gap is the same at half a block, fog is innocent too.');
  } finally { await W.close(); }
})();
