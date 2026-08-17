// WHAT IS THE PALE SHEET MADE OF? With the range drawing again, the near band reads as a grey curtain standing in
// front of the island's own wood. The clamp is not setting it (tmp-airclamp: 0.85, 0.30 and off are the same frame),
// so this shoots the terms directly: uDbg 1 paints snowT red, uDbg 2 paints the fragment's height against the snow
// line green. If the curtain is red, the range is snow from its foot up and the snow line is the fault.
import { openWorld, shots, statFile, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const MTN=[0.35,0.98,0.518,0.558];
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); H.cam({yaw:3.665, pitch:0.02}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(900); await pin(W,0.25);
  for(const [tag,dbg] of [['plain',0],['snowT',1],['height',2]]){
    await W.ev(`__hc.mtnDbg(${dbg})`); await sleep(600);
    const f=await shots(W,`look-${tag}`,0.25,1);
    const m=statFile(f[0],MTN);
    console.log(`${tag.padEnd(6)} rgb ${JSON.stringify(m.rgb)}  lum ${m.lum}`);
  }
  await W.ev(`__hc.mtnDbg(0)`);
}finally{ await W.close(); }
