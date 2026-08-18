// WHAT THE PER-CELL PUDDLE BUILD COSTS. 3634d80 turned one quad per site into one quad per cell, and _pudBuild
// disposes and reallocates the whole geometry on any frame where a fill changed -- which is every frame while it
// is raining or drying. Frame time with the puddles on and off, in the rain, interleaved.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)');
    const P=await ev('__hc.probe()');
    await ev(`__hc.tp(${P.x+20}, ${P.z})`);
    for(let i=0;i<12;i++){ const f=await ev('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    // __hc.rain HOLDS IT. Writing weather.raining directly does not: updateWeather owns the flag and clears it
    // within a frame, so a hand-set flag re-asserted once a second never accumulates a fill and the first two cuts
    // of this A/B measured 0 drawn puddles on both sides.
    await ev('__hc.rain(0.95)');
    await sleep(22000);
    console.log('  puddles '+JSON.stringify(await ev('__hc.puddles()')).slice(0,110));
    for(let rep=0; rep<2; rep++){
      for(const on of [true,false]){
        await ev('__hc.puddles('+on+')'); await sleep(900);
        const f=await ev('__hc.frameMs(150)');
        console.log('  rep'+rep+' puddles '+(on?'on ':'off')+'  p50 '+f.p50+'  p95 '+f.p95+'  mean '+f.mean); } }
    await ev('__hc.puddles(true)');
  } finally { await W.close(); } })();
