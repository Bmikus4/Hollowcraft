// The leaves at NIGHT and in RAIN, from the shore vantage the orange dots were photographed at.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)');
    const wet=on=>ev(`(typeof weather!=="undefined") && (weather.raining=${!!on}, weather.rain=${on?0.9:0}, weather.rainTgt=${on?0.9:0}, weather.overcast=${on?0.8:0})`).catch(()=>{});
    console.log('  start '+JSON.stringify(await ev('__hc.probe()')).slice(0,90));
    for(const [tag,t,rain] of [['noon',0.30,0],['night',0.85,0],['rain',0.30,1]]){
      await ev(`__hc.setTime(${t})`); await wet(rain);
      await ev('__hc.cam({yaw:'+(158*Math.PI/180).toFixed(4)+', pitch:0})');
      await sleep(1600);
      console.log('  '+tag.padEnd(6)+JSON.stringify(await ev('__hc.leaves()')).slice(0,64));
      await W.page.screenshot({path:path.join(OUT,'leafsky_'+tag+'.png')}); }
    await wet(0);
  } finally { await W.close(); } })();
