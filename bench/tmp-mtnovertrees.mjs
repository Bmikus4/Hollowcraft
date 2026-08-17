// IS THE RANGE DRAWN OVER THE NEAR WOOD, OR BEHIND IT? Eyes cannot settle this on a pale band over dark trees, and a
// whole-frame diff cannot either: the ocean animates, so two frames of the SAME condition differ by a mean of 5-8/255
// and every earlier "the range is here" reading was wave noise. So: classify TREE pixels off the mtn-OFF frame (green
// dominant, dark, no water), then compare those pixels between conditions against a CONTROL PAIR of two frames of the
// same condition. If tree pixels move more than the control, the layer is winning the depth test against near geometry.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const px=f=>decodePNG(fs.readFileSync(f));
function compare(A1,A2,B){
  let n=0, dOn=0, dCtl=0;
  for(let y=0;y<B.h;y++) for(let x=0;x<B.w;x++){
    const i=(y*B.w+x)*B.ch, r=B.data[i], g=B.data[i+1], b=B.data[i+2];
    const lum=0.2126*r+0.7152*g+0.0722*b;
    if(!(g>r+10 && g>b+10 && lum<90)) continue;      // a leaf in shade: green dominant and dark. Water is blue, sand pale.
    n++;
    const d=(p,q)=>(Math.abs(p.data[i]-q.data[i])+Math.abs(p.data[i+1]-q.data[i+1])+Math.abs(p.data[i+2]-q.data[i+2]))/3;
    dOn+=d(A1,B); dCtl+=d(A1,A2);
  }
  return { treePx:n, diffVsOff:+(dOn/n).toFixed(2), noiseFloor:+(dCtl/n).toFixed(2) };
}
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); H.cam({yaw:3.665, pitch:0.02}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  // WIND OFF and the clock frozen, or the leaves themselves are the noise this is trying to see through.
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(900); await pin(W,0.25);
  const a1=(await shots(W,'ot-on1',0.25,1))[0];
  const a2=(await shots(W,'ot-on2',0.25,1))[0];
  await W.ev(`__hc.mtn(false)`); await sleep(800);
  const b=(await shots(W,'ot-off',0.25,1))[0];
  console.log(JSON.stringify(compare(px(a1),px(a2),px(b))));
  await W.ev(`__hc.mtn(true)`);
}finally{ await W.close(); }
