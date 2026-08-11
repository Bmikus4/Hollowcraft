// What the colour renewal costs in brightness. `_renew` reduces the wash on a lamp-lit surface, and the wash is
// luminance-preserving in the space it runs but NOT after the sRGB encode (a concave curve, so a saturated pixel
// encodes brighter than the equal-luma grey it washes toward). Releasing it therefore lifts the displayed pixel.
// This prints both halves of that trade at a placed lantern at midnight so the value is chosen against the picture.
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
    await P.evaluate(`__hc.tp(${CX-3}, ${CY+1.6}, ${CZ}, 0, 0)`); await sleep(900);
    await P.evaluate(`__hc.freezeT(120)`); await sleep(300);
    await pin(W,NIGHT);
    for(const r of [1.0, 1.4, 1.8, 2.2, 2.5, 3.2]){
      await P.evaluate(`__hc.scot({renew:${r}})`); await sleep(300);
      const m=(await measure(W,`rn-${r}`,NIGHT,{c:CROP.centre})).c;
      console.log(`  renew ${String(r).padEnd(4)}  lum ${String(m.lum).padStart(7)}  sat ${m.sat}  minCh ${m.minCh}`);
    }
    // the reference: renewal fully off, which is the pre-08-06 wash
    await P.evaluate(`__hc.scot({renew:1e9})`); await sleep(300);
    const off=(await measure(W,'rn-none',NIGHT,{c:CROP.centre})).c;
    console.log(`  renew off   lum ${off.lum}  sat ${off.sat}  minCh ${off.minCh}   (ramp collapses -> no renewal)`);
  } finally { await W.close(); }
})();
