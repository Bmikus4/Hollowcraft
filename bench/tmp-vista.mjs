// A LANDSCAPE FRAME SET, clean (no HUD), from above the treeline looking across the island. This is the thing the
// plan says has never been done: every lighting claim so far is a statistic over a crop nobody has viewed.
import { openWorld, shots, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  const r = await W.ev(`(function(){ const s=goShore(); return s; })()`);
  console.log('shore:', JSON.stringify(r));
  const p = await W.ev(`(function(){ const p=__hc.pos(); __hc.tpAt(p.x, p.y+38, p.z); H.cam({pitch:-0.28}); return __hc.pos(); })()`);
  console.log('vantage:', JSON.stringify(p));
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  for(const [nm,t] of [['dawn',0.06],['morning',0.15],['noon',0.25],['dusk',0.45],['night',0.75]]){
    await W.ev(`__hc.setTime(${t})`); await sleep(700); await W.ev(`__hc.setTime(${t})`); await sleep(1500);
    const f = await shots(W, `vista-${nm}`, null, 1);
    console.log('  wrote', f[0]);
  }
}finally{ await W.close(); }
