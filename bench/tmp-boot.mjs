// SCRATCH BOOT PROBE. What the surface transitions cost: triangles, draw calls and frame time, on against off, from a
// FIXED camera at a beach where sand, dirt and grass all meet. Alternated on/off/on/off so a drift in the page (chunks
// still streaming, GC, thermal) cannot be read as the effect.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    await W.page.evaluate('window.__benchInfo=1');
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    const sh=await W.page.evaluate('__hc.shoreSpot()');
    await W.page.evaluate(`__hc.tpExact(${sh.x}, ${sh.z}, ${sh.y})`);
    await W.page.evaluate('__hc.cam({yaw:'+(sh.yaw+Math.PI)+', pitch:-0.35})');
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await sleep(2000);
    const runs=[];
    for(const on of [true,false,true,false]){
      await W.page.evaluate(`__hc.transitions(${on})`);
      for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
      await sleep(2500);                                   // let the remesh settle before either number is read
      const p=await W.page.evaluate('__hc.perf()');
      const fm=await W.page.evaluate('__hc.frameMs(150)');
      runs.push({on, tris:p.tris, calls:p.calls, geoms:p.geoms, fm});
      console.log((on?'ON ':'OFF')+'  tris '+String(p.tris).padStart(7)+'  calls '+String(p.calls).padStart(4)+'  geoms '+String(p.geoms).padStart(4)
        +'   frame p50 '+fm.p50+'  p95 '+fm.p95+'  max '+fm.max);
    }
    const on=runs.filter(r=>r.on), off=runs.filter(r=>!r.on);
    const avg=(a,f)=>+(a.reduce((s,r)=>s+f(r),0)/a.length).toFixed(2);
    console.log('--- ON vs OFF (mean of two runs each) ---');
    console.log('tris   '+avg(on,r=>r.tris)+' vs '+avg(off,r=>r.tris)+'   ('+(avg(on,r=>r.tris)-avg(off,r=>r.tris)).toFixed(0)+', '
      +(100*(avg(on,r=>r.tris)/avg(off,r=>r.tris)-1)).toFixed(2)+'%)');
    console.log('calls  '+avg(on,r=>r.calls)+' vs '+avg(off,r=>r.calls));
    console.log('p50 ms '+avg(on,r=>r.fm.p50)+' vs '+avg(off,r=>r.fm.p50));
    console.log('p95 ms '+avg(on,r=>r.fm.p95)+' vs '+avg(off,r=>r.fm.p95));
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
