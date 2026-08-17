// SCRATCH BOOT PROBE. The ambience sequencer: is there a 3D scene, and does it change?
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:8});
  try{ await sleep(2500);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)'); await sleep(400);
    const show=r=>{ console.log('  played '+JSON.stringify(r.played)+'  ctx '+r.ctx);
      for(const v of r.voices) console.log('   '+v.k.padEnd(8)+(v.live?('dist '+String(v.dist).padStart(5)+'  aboveEye '+String(v.aboveEye).padStart(6)+'  at '+JSON.stringify(v.at)):'(nowhere to sit)')); };
    console.log('NIGHT, 60s:'); show(await W.page.evaluate('__hc.ambRun(60,true,1)'));
    console.log('DAY, 60s:');   show(await W.page.evaluate('__hc.ambRun(60,false,1)'));
    console.log('NIGHT, wretch close (amb 0.15), 60s:'); show(await W.page.evaluate('__hc.ambRun(60,true,0.15)'));
    console.log('errors: '+(W.errors.length?W.errors.slice(0,4).join(' | '):'none'));
  } finally { await W.close(); } })();
