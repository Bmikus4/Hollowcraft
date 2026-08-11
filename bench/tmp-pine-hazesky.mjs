// WHAT THE TREELINE'S HAZE TARGET IS WORTH, at the band the resume file measures.
//
// Same shore vantage and the same two crops as tmp-pine-fix, so the numbers are comparable to the ones already written
// down (real canopy 27.0 / sat 0.47, backdrop band 66 / 0.30 at the shipped dials). The question here is only the haze
// TARGET: uFogCol, which is ~0.77 linear and nearly white, against uSky*0.78, which is the blue of the air. Every dial
// above it — gain, sat, fogMul — was already swept last session and moved the band from 89 to 64 in total.
//
//   node bench/tmp-pine-hazesky.mjs
import { openWorld, shots, statFile, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const BAND=[0.02,0.34,0.466,0.535];   // the backdrop treeline in this vantage
const WOOD=[0.02,0.34,0.60,0.667];    // the real canopy in the same frame
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x,p.y+38,p.z); H.cam({pitch:-0.16}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120); __hc.setTime(0.42)`);
  await sleep(1200); await W.ev(`__hc.setTime(0.42)`); await sleep(1500);
  // THE CRUX. If uFogAmt is ~0 at this vantage then `fog` is ~0 at the band, the haze target cannot be seen there
  // whatever it is, and the band's value is the pine colour itself — which is what both A/Bs above are saying.
  console.log(`  pines state     ${JSON.stringify(await W.ev(`__hc.pines({})`))}`);
  const w=statFile((await shots(W,'ph-wood',null,1))[0], WOOD);
  console.log(`  REAL WOOD        lum ${w.lum}  sat ${w.sat}`);
  // Sandwiched, for the same reason the drown A/B is: the sea and the foliage move between screenshots.
  for(const v of [0, 0.5, 1.0, 0]){
    await W.ev(`__hc.pines({hazeSky:${v}})`); await sleep(700);
    const s=statFile((await shots(W,`ph-${v}`,null,1))[0], BAND);
    console.log(`  hazeSky ${String(v).padEnd(4)}     lum ${String(s.lum).padStart(6)}  rgb ${JSON.stringify(s.rgb)}  sat ${s.sat}`);
  }
}finally{ await W.close(); }
