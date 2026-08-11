import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:6});
  try{
    await sleep(1500);
    console.log('errors: '+ (W.errors.length? W.errors.slice(0,4).join(' | ') : 'none'));
    console.log('water: '+ JSON.stringify(await W.page.evaluate(`(function(){try{return __hc.waterRefl?__hc.waterRefl():'nohook';}catch(e){return String(e)}})()`)));
    console.log('flash: '+ JSON.stringify(await W.page.evaluate(`__hc.flashlight()`)));
  } finally { await W.close(); } })();
