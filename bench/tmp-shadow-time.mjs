// SHADOW CONTRIBUTION vs SUN ELEVATION. The previous run measured at noon only, which is the one hour of the day
// when a vertical sun casts almost nothing on flat ground -- a null result there says nothing about the feature.
import { openWorld, shots, diffStat, statMedian, CROP, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const TIMES = [0.10, 0.15, 0.20, 0.25, 0.32, 0.40];
const W = await openWorld({ rd:8, quality:'High' });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ H.setTime(0.25); goVillage(); })()`);
  for(let i=0;i<40;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(2500); await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.freezeT(120)`);
  console.log('t      sunY   sunI    shadow contributes on GROUND      on FRAME');
  for(const t of TIMES){
    await W.ev(`__hc.setTime(${t})`); await sleep(500); await W.ev(`__hc.setTime(${t})`); await sleep(1200);
    const sd = await W.ev(`__hc.sunDir()`); const st = await W.ev(`__hc.shadowSoft()`);
    await W.ev(`__hc.shadowSoft({cast:true})`); await sleep(800);
    const on  = await shots(W, `st-${t}-on`, null, 2);
    await W.ev(`__hc.shadowSoft({cast:false})`); await sleep(800);
    const off = await shots(W, `st-${t}-off`, null, 2);
    await W.ev(`__hc.shadowSoft({cast:true})`);
    const g = diffStat(on[0], off[0], CROP.ground), f = diffStat(on[0], off[0], CROP.frame);
    const c = diffStat(on[0], on[1], CROP.ground);
    const sy = sd && sd.sun ? (+sd.sun[1]).toFixed(3) : (sd&&sd.y!=null?(+sd.y).toFixed(3):'?');
    console.log(`${String(t).padEnd(6)} ${String(sy).padStart(6)} ${String(st.sunI).padStart(6)}   mad ${String(g.mad).padStart(6)} moved ${String(g.movedPct).padStart(6)}% (noise ${c.movedPct}%)   mad ${String(f.mad).padStart(6)} moved ${String(f.movedPct).padStart(6)}%`);
  }
}finally{ await W.close(); }
