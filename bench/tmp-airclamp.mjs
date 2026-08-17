// THE AIR CLAMP, ON AND OFF. `col=min(col, uAir*0.85)` in the mountain shader is the rule that nothing on the horizon
// may out-read the sky behind it. It is also the term that sets the range's value outright — its own gain, snow line
// and haze dials barely move the band (bench/tmp-horizon-dom.mjs), which is the signature of a clamp doing the work.
//
// A/B by REBOOT, not by uniform: the shader is assembled from strings at load, so the honest way to price the clamp is
// to edit the file and run this again. The label is argv[2] and goes in the shot name, so the two runs' PNGs sit side
// by side in bench/results.
//
//   node bench/tmp-airclamp.mjs before
//   (edit index.html)
//   node bench/tmp-airclamp.mjs after
import { openWorld, shots, statFile, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const TAG = process.argv[2] || 'ac';
// THE CROPS ARE FROM tmp-mtnwhere, NOT FROM tmp-horizon-dom. That harness's mountain crop [0.333,0.400] predates the
// range rebuild and holds no mountain at this build's vantage: a clamp driven from 0.85 to 0.30 moved it by 0.00.
// Toggling the layer off and diffing rows puts the range at 0.52-0.56 of the frame, a strip about 25 rows deep.
const MTN =[0.35,0.98,0.518,0.558];
const SKY =[0.35,0.98,0.30,0.42];     // the air DIRECTLY above it, which is what the clamp measures the band against
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  // Offshore at sea level, looking back along the coast: see tmp-mtnwhere for why every other vantage tried reported
  // no mountain at all.
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); H.cam({yaw:3.665, pitch:0.02}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  for(const [name,t] of [['noon',0.25],['dusk',0.46],['dawn',0.04]]){
    await pin(W,t); await sleep(900); await pin(W,t);
    const f = await shots(W, `${TAG}-${name}`, t, 3);
    const m=statFile(f[0],MTN), s=statFile(f[0],SKY);
    console.log(`${name.padEnd(5)} mtn ${String(m.lum).padStart(6)} (p10 ${String(m.p10).padStart(6)} p90 ${String(m.p90).padStart(6)} sat ${String(m.sat).padStart(6)})   sky ${String(s.lum).padStart(6)}   mtn/sky ${(m.lum/Math.max(s.lum,1e-3)).toFixed(3)}`);
  }
}finally{ await W.close(); }
