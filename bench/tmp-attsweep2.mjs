import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6}); const p=W.page;
  try{ await sleep(2500);
    await p.evaluate('(()=>{ __hc.lock(true); __hc.setTime(0.45); __hc.cmdRun("/gamemode creative"); })()').catch(()=>{});
    await sleep(800);
    for(const g of ['flare_gun','sawn_off','pistol','ar15']){
      await p.evaluate(`__hc.cmdRun("/clearinv"); __hc.cmdRun("/give ${g} 1"); __hc.hold(${JSON.stringify(g)})`); await sleep(400);
      await p.evaluate(`(()=>{ for(const s of __hc.attProbe().slots) __hc.attFit(s,null); __hc.attFit('optic','optic_scope'); })()`);
      await sleep(250);
      await p.evaluate('__hc.aim(true)');
      for(let i=0;i<25;i++){ if((await p.evaluate('__hc.adsClearance()')).adsT>=0.999) break; await sleep(120); }
      const e=await p.evaluate('__hc.opticEye()');
      const q=await p.evaluate('__hc.attProbe()');
      console.log(g, JSON.stringify({ndc:e.ndc,dotY:e.dotY,attH:e.attH,bend:e.bend,grpY:e.grpY,cam:e.camSpace,pos:q.fitted[0]&&q.fitted[0].pos,mount:q.mount,muzzleZ:q.muzzleZ,len:q.len}));
      await p.evaluate('__hc.aim(false)'); await sleep(150);
    }
    console.log('errors: '+(W.errors.length?W.errors.slice(0,3).join(' | '):'none'));
  } finally { await W.close(); } })();
