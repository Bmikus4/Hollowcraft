// The egg is gone and /foxgirl is a row in the table: prove both, and prove the removal did not take the creature id
// with it — /spawn foxgirl has to keep working, because /foxgirl is implemented by calling it.
import { openWorld, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:800, h:450 });
try{
  await W.ev(HELPERS);
  await W.ev(`atSpawn()`); await sleep(1500);
  for(let i=0;i<40;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await pin(W,0.25); await sleep(500);
  console.log('egg item exists:', await W.ev(`(()=>typeof ITEMS!=='undefined' ? !!ITEMS['egg_foxgirl'] : 'no ITEMS')()`));
  console.log('/help foxgirl :', JSON.stringify(await W.ev(`__hc.cmdRun('/help foxgirl')`)));
  console.log('/foxgirl     :', JSON.stringify(await W.ev(`__hc.cmdRun('/foxgirl')`)));
  await sleep(2200);
  console.log('she is here  :', JSON.stringify(await W.ev(`(()=>{const f=__hc.foxgirl(); return {present:f.present, height:f.height, footGap:f.footGap};})()`)));
  console.log('/give egg    :', JSON.stringify(await W.ev(`__hc.cmdRun('/give @me egg_foxgirl 1')`)));
}finally{ await W.close(); }
