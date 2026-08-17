// CALIBRATING THE SNOW LINE against the peaks the mask actually holds, now that world height is read off the ridge
// rather than off the screen. The dial is __hc.mtn({snow:[lowSun,highSun]}) in world height; mtnMask() reports the
// peaks in the same units, so the two are directly comparable. Coverage is measured as the share of the mountain band
// that is snow under uDbg=1 (which paints snowT into red) — a band that is 100% snow is the fault being fixed.
import { openWorld, shots, statFile, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const BAND=[0.00,0.52,0.05,0.52];   // the curtain's own corner of the frame at this vantage
// Under uDbg=1 a layer fragment is (snowT,0,0): red with no green and no blue. Post gives it a little of both, so the
// test is red DOMINANCE, and the denominator is every fragment the layer drew (any of the three channels lit).
function cover(file){ const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*BAND[0])|0, x1=(P.w*BAND[1])|0, y0=(P.h*BAND[2])|0, y1=(P.h*BAND[3])|0;
  let snow=0, layer=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i], g=P.data[i+1], b=P.data[i+2];
    if(r>g+18 && r>b+18){ layer++; if(r>110) snow++; } }
  return { snowPx:snow, redPx:layer, pct: layer? +(100*snow/layer).toFixed(1) : 0 };
}
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); H.cam({yaw:3.665, pitch:0.02}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  console.log('mask:', JSON.stringify(await W.ev(`__hc.mtnMask()`)));
  for(const snow of [[190,210],[215,235],[240,260]]){
    console.log('dial:', JSON.stringify(await W.ev(`__hc.mtn(true,{snow:[${snow[0]},${snow[1]}]})`)));
    for(const [hour,t] of [['noon',0.25],['dusk',0.46]]){
      await pin(W,t); await sleep(700); await pin(W,t);
      await W.ev(`__hc.mtnDbg(1)`); await sleep(400);
      const d=(await shots(W,`sl-${snow[0]}-${hour}-dbg`,t,1))[0];
      await W.ev(`__hc.mtnDbg(0)`); await sleep(400);
      const p=(await shots(W,`sl-${snow[0]}-${hour}`,t,1))[0];
      const c=cover(d), m=statFile(p,BAND);
      console.log(`  ${hour}  snow ${String(c.pct).padStart(5)}% of ${String(c.redPx).padStart(6)} layer px   band lum ${String(m.lum).padStart(6)} p90 ${String(m.p90).padStart(6)}`);
    }
  }
}finally{ await W.close(); }
