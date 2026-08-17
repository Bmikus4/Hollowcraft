import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6});
  try{ await sleep(2000);
    for(let i=0;i<40;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    await W.page.evaluate('__hc.lock(true)');
    for(const id of ['ar15','ak','hunting_rifle','marksman_rifle','forest_rifle','revolver','shotgun','pistol_heavy']){
      await W.page.evaluate(`__hc.hold(${JSON.stringify(id)})`); await sleep(450);
      console.log(id.padEnd(16)+JSON.stringify(await W.page.evaluate('__hc.reload()'))); }
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
