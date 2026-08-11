// IS THE COLOUR RENEWAL WORTH ITS COST? The one A/B that decides it, and it could not be run until uScotK.y gained an
// explicit off branch (every value 0..1 produced the same ramp). Clock pinned, so the lantern's flicker is gone and the
// two conditions differ by this term alone.
import { openWorld, pin, measure, CROP, sleep } from './lib/rig.mjs';
const NIGHT=0.75;
(async()=>{
  const W=await openWorld({rd:8}); const P=W.page;
  try{
    const S=await P.evaluate(`__hc.st()`);
    const CX=Math.round(S.sx)+18, CZ=Math.round(S.sz)+18;
    const GY=await P.evaluate(`__hc.groundY(${CX}, ${CZ})`); const CY=Math.max(6,GY-16);
    await P.evaluate(`(function(){ for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) for(let y=${CY};y<=${CY}+4;y++) __hc.cmdRun('/setblock '+(${CX}+dx)+' '+y+' '+(${CZ}+dz)+' air'); })()`);
    for(let i=0;i<40;i++){ const f=await P.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await P.evaluate(`__hc.cmdRun('/setblock ${CX+2} ${CY} ${CZ} lantern')`);
    for(let i=0;i<20;i++){ const f=await P.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await P.evaluate(`__hc.tp(${CX-3}, ${CY+1.6}, ${CZ}, 0, -0.30)`); await sleep(900);
    await P.evaluate(`__hc.freezeT(120)`); await sleep(300);
    await pin(W,NIGHT);
    // A lamp-lit crop: the wall the lantern is actually on, not the whole dark room.
    const LIT=[0.45,0.95,0.30,0.75];
    for(const r of [0, 2.5]){
      await P.evaluate(`__hc.scot({renew:${r}})`); await sleep(350);
      const m=(await measure(W,`ab-renew-${r}`,NIGHT,{c:LIT})).c;
      console.log(`  renew ${r===0?'OFF':r}   lum ${String(m.lum).padStart(7)}  sat ${m.sat}  minCh ${m.minCh}`);
    }
  } finally { await W.close(); }
})();
