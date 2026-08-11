// DO DAYTIME SHADOWS SURVIVE WEATHER AND FOG? Ben 08-10: "daytime shadows need to work in all weather and fog".
// Frame contrast alone cannot answer it -- fog greys everything, so a washed-out frame looks the same whether the
// shadow is gone or merely dimmed with the rest of the scene. So: toggle the CASTER and difference, per condition.
// What the shadow map contributes is exactly (cast on) - (cast off); everything else cancels.
import { openWorld, shots, statMedian, diffStat, CROP, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';

const COND = {
  clear:        `__hc.fog(0);   __hc.overcast(0);`,
  fog_light:    `__hc.fog(0.4); __hc.overcast(0);`,
  fog_heavy:    `__hc.fog(0.9); __hc.overcast(0);`,
  overcast:     `__hc.fog(0);   __hc.overcast(0.9);`,
  storm:        `__hc.fog(0.7); __hc.overcast(0.9);`,
};
const W = await openWorld({ rd:8, quality:'High' });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ H.setTime(0.25); goVillage(); })()`);
  for(let i=0;i<40;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(2500);
  await W.ev(`__hc.freezeT(120)`);
  console.log('filter:', JSON.stringify(await W.ev(`__hc.shadowSoft()`)));
  console.log('\ncondition     sunI  fog   oc    shadow contributes (cast on vs off)        ground lum');
  for(const [name, set] of Object.entries(COND)){
    await W.ev(set); await W.ev(`__hc.setTime(0.25)`); await sleep(1800);
    const st = await W.ev(`__hc.shadowSoft()`);
    await W.ev(`__hc.shadowSoft({cast:true})`);  await sleep(700);
    const on  = await shots(W, `sw-${name}-on`, null, 2);
    await W.ev(`__hc.shadowSoft({cast:false})`); await sleep(700);
    const off = await shots(W, `sw-${name}-off`, null, 2);
    await W.ev(`__hc.shadowSoft({cast:true})`);
    const d  = diffStat(on[0], off[0], CROP.ground);
    const c  = diffStat(on[0], on[1], CROP.ground);
    const s  = statMedian(on, CROP.ground);
    console.log(`${name.padEnd(13)} ${String(st.sunI).padStart(5)} ${String(st.fog).padStart(4)} ${String(st.overcast).padStart(4)}   mad ${String(d.mad).padStart(6)}  moved ${String(d.movedPct).padStart(6)}%  (noise ${c.movedPct}%)   ${s.lum}`);
  }
}finally{ await W.close(); }
