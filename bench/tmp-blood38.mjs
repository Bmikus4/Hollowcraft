import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6}); const p=W.page;
  try{ await sleep(2500);
    await p.evaluate("__hc.lock(true); __hc.cmdRun('/gamemode creative')");
    for(const [tag,t] of [['day',0.35],['night',0.92]]){
      await p.evaluate(`__hc.setTime(${t})`); await sleep(900);
      const r=await p.evaluate("__hc.bloodProbe&&__hc.bloodProbe()");
      console.log(tag, JSON.stringify(r).slice(0,300));
    }
    console.log('errors: '+(W.errors.length?W.errors.slice(0,2).join(' | '):'none'));
  } finally { await W.close(); } })();
