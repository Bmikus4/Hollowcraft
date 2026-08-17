import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    for(const id of ['ar15','pistol','revolver','shotgun','smg']){
      await W.page.evaluate(`__hc.hold(${JSON.stringify(id)})`); await sleep(900);
      const r=await W.page.evaluate('__hc.pose()');
      console.log(id.padEnd(10)+'res pos '+JSON.stringify(r.residual.pos)+' rot '+JSON.stringify(r.residual.rot)+'  active '+JSON.stringify(r.active)); }
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
