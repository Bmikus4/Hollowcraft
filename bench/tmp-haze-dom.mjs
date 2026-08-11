// IS THE HAZE TERM ITSELF THE DOMINANT ONE? col = mix(rock, hazeCol, haze), and hazeCol is measured at ~0.68 linear
// while rock is ~0.05. At haze 0.20 that puts 0.136 of haze against 0.040 of rock -- the haze would be contributing
// three and a half times what the material's own colour does, which would explain why rock changes do nothing.
import { openWorld, shots, statFile, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const MTN=[0.02,0.98,0.345,0.375];   // tight, inside the band
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x,p.y+38,p.z); H.cam({pitch:-0.16}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120); __hc.setTime(0.15)`);
  await sleep(1200); await W.ev(`__hc.setTime(0.15)`); await sleep(1500);
  console.log('--- haze swept, dark fixed at 0.78 ---');
  for(const h of [0.00,0.05,0.10,0.20,0.35,0.60]){
    await W.ev(`__hc.mountains({haze:${h}, dark:0.78})`); await sleep(650);
    const s=statFile((await shots(W,`hz-${h}`,null,1))[0], MTN);
    console.log(`  haze ${String(h).padEnd(5)}  lum ${String(s.lum).padStart(6)}  sat ${s.sat}`);
  }
  console.log('--- dark swept, haze fixed at 0.20 ---');
  for(const d of [0.30,0.55,0.78,1.00]){
    await W.ev(`__hc.mountains({haze:0.20, dark:${d}})`); await sleep(650);
    const s=statFile((await shots(W,`dk-${d}`,null,1))[0], MTN);
    console.log(`  dark ${String(d).padEnd(5)}  lum ${String(s.lum).padStart(6)}  sat ${s.sat}`);
  }
}finally{ await W.close(); }
