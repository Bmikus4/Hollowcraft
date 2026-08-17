// WHERE DOES THE LAYER ACTUALLY DRAW ANY FRAGMENT? Diffing mtn on/off frames is worthless over water: the ocean is
// animated, so two frames of the SAME condition differ by a mean of 5-8/255 and every "the range is here" reading it
// gave was wave noise. __hc.mtnDbg(2) paints the layer's own fragments green after the haze and the clamp, so a pixel
// that is green IS the range, with no control pair needed.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const green=(file)=>{ const P=decodePNG(fs.readFileSync(file)); let n=0, y0=1e9, y1=-1;
  for(let y=0;y<P.h;y++) for(let x=0;x<P.w;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i], g=P.data[i+1], b=P.data[i+2];
    if(g>40 && g>r*1.6 && g>b*1.6){ n++; if(y<y0)y0=y; if(y>y1)y1=y; } }
  return { pct:+(100*n/(P.w*P.h)).toFixed(3), y0:y1<0?null:y0, y1:y1<0?null:y1, h:P.h }; };
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  const where = process.argv[2]||'sea';
  if(where==='sea') await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); })()`);
  else               await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x, p.y+38, p.z); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(900); await pin(W,0.25);
  console.log('mask:', JSON.stringify(await W.ev(`__hc.mtnMask()`)));
  console.log('dbg :', await W.ev(`__hc.mtnDbg(2)`));
  for(let k=0;k<12;k++){
    const yaw=+(k*Math.PI/6).toFixed(3);
    await W.ev(`H.cam({yaw:${yaw}, pitch:0.06})`); await sleep(450);
    const f=(await shots(W,`mf-${k}`,0.25,1))[0];
    const g=green(f);
    console.log(`yaw ${(yaw*180/Math.PI).toFixed(0).padStart(4)}deg  layer pixels ${String(g.pct).padStart(7)}%  rows ${g.y0==null?'none':g.y0+'..'+g.y1}`);
  }
  await W.ev(`__hc.mtnDbg(0)`);
}finally{ await W.close(); }
