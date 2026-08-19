import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6}); const p=W.page;
  try{ await sleep(2500);
    await p.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await p.evaluate(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give iron_pickaxe 1"); __hc.hold('iron_pickaxe')`); await sleep(350);
    let prev=null, maxd=0;
    for(let i=0;i<=40;i++){
      const v=i/40, r=await p.evaluate(`__hc.bladePose(${v.toFixed(3)})`);
      if(v>=0.7) console.log('  p='+v.toFixed(3)+'  rotX '+r.rot[0]);
      if(prev){ const d=Math.abs(r.rot[0]-prev); if(d>maxd)maxd=d; } prev=r.rot[0];
    }
    console.log('largest step between samples (1/40 apart): '+maxd.toFixed(4)+' rad');
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
