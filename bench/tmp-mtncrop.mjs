// IS THE CROP THE MOUNTAIN, AND DOES THE SHADER EDIT REACH THE PAGE? Two shader constants (0.85 and 0.30) produced
// byte-identical crops, which has two candidate explanations with opposite fixes: the clamp never binds, or the edit
// never arrived. __hc.mtn({gain}) is a live uniform on the same shader — if the crop does not move for a 10x gain
// swing then the crop is not the range, and no shader edit was ever going to show up in it.
import { openWorld, shots, statFile, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const MTN =[0.35,0.98,0.518,0.558];
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); H.cam({yaw:3.665, pitch:0.02}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(900); await pin(W,0.25);
  for(const g of [1.1, 0.2, 3.0, 1.1]){
    console.log('dials', JSON.stringify(await W.ev(`__hc.mtn(true,{gain:${g}})`)));
    await sleep(700);
    const f=await shots(W,`mc-g${g}`,0.25,1);
    const m=statFile(f[0],MTN);
    console.log(`  gain ${String(g).padEnd(4)} mtn ${String(m.lum).padStart(6)} p10 ${String(m.p10).padStart(6)} p90 ${String(m.p90).padStart(6)}`);
  }
  console.log('layer off:');
  await W.ev(`__hc.mtn(false)`); await sleep(700);
  { const f=await shots(W,'mc-off',0.25,1); const m=statFile(f[0],MTN);
    console.log(`  off       mtn ${String(m.lum).padStart(6)} p10 ${String(m.p10).padStart(6)} p90 ${String(m.p90).padStart(6)}`); }
}finally{ await W.close(); }
