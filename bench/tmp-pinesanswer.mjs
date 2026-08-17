// ONE QUESTION, ONE ATTEMPT: does assets/horizon/treeline.png reach the screen, and how tall is it in degrees. Then
// three heights from the shore at standing eye height for Ben to pick from — he has rejected derived numbers four
// times, so the number is his and this only hands him the dial and the frames.
import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  // ON THE SAND, AT STANDING EYE HEIGHT. goShore lands inside the wood, so walk seaward to the last dry column.
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); const sea=40; let bx=p.x, bz=p.z;
    for(let r=0;r<220;r+=2){ const x=Math.round(p.x-r), z=Math.round(p.z); if(H.surfH(x,z)<=sea+1){ bx=x+2; bz=z; break; } }
    __hc.tpAt(bx, H.surfH(Math.round(bx),Math.round(bz))+2, bz); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  const fill = await W.ev(`__hc.fill()`);
  if(fill.meshed < fill.want) throw new Error('world not meshed — refusing to photograph it: '+JSON.stringify(fill));
  await sleep(2500); await pin(W,0.25); await sleep(600);
  const probe = await W.ev(`__hc.pinesProbe()`);
  console.log(JSON.stringify(probe, null, 1));
  // point at the strongest band, then shoot three heights
  await W.ev(`H.cam({yaw:${probe.strongestBearing.lookYaw}, pitch:0.02})`); await sleep(500);
  for(const [tag,d] of [['0-44deg',2600],['1-6deg',700],['3-2deg',360]]){
    await W.ev(`__hc.pines(true,{d:${d}})`); await sleep(700);
    const st = await W.ev(`__hc.pines()`);
    await shots(W, `pines-${tag}`, 0.25, 1);
    console.log(`  d=${String(d).padStart(4)}  canopy ${st.canopyDeg} deg  ->  bench/results/pines-${tag}-0.png`);
  }
  await W.ev(`__hc.pines(true,{d:2600})`);
}finally{ await W.close(); }
