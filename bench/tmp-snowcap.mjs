// THE CAP'S OWN VALUE, against the air it has to punch through. uDbg 1 paints snowT into red, so red pixels are the
// cap and the same mask read off the plain frame gives what the cap actually renders as; uDbg 3 gives the whole layer,
// so the cap's SHARE of the range is a number rather than an impression. The air is sampled just above the ridge.
// Two failures look identical in a still and are opposites in the fix: a cap that is too big (coverage) and a cap that
// is lifted over the air everywhere instead of only where the sun is on it (the exemption).
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const px=f=>decodePNG(fs.readFileSync(f));
function stats(snowM, layerM, P){
  let sn=0,ss=0,smx=0, ly=0, sky=0,skyN=0;
  for(let y=0;y<P.h;y++) for(let x=0;x<P.w;x++){
    const i=(y*P.w+x)*P.ch;
    const l=0.2126*P.data[i]+0.7152*P.data[i+1]+0.0722*P.data[i+2];
    const isL = layerM.data[i]>layerM.data[i+1]+25 && layerM.data[i+2]>layerM.data[i+1]+25;
    const isS = snowM.data[i]>snowM.data[i+1]+30 && snowM.data[i]>snowM.data[i+2]+30;
    if(isL) ly++;
    if(isS){ sn++; ss+=l; if(l>smx) smx=l; }
    else if(!isL && y<P.h*0.30 && P.data[i+2]>P.data[i]+8){ sky+=l; skyN++; }
  }
  const S=ss/Math.max(sn,1), K=sky/Math.max(skyN,1);
  return { capPx:sn, layerPx:ly, capShare:+(100*sn/Math.max(ly,1)).toFixed(1),
           capLum:+S.toFixed(1), capMax:+smx.toFixed(0), sky:+K.toFixed(1), capOverSky:+(S/Math.max(K,1e-3)).toFixed(3) };
}
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); H.cam({yaw:3.665, pitch:0.04}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  // AND THE LINE ITSELF, since coverage is the other half of the fix: 38-50 per cent of the range came back as snow,
  // and a range wears a cap on its top fifth. Same three hours per setting, and the shipped setting is repeated last
  // as the noise floor — dusk moves the sky crop by ten levels between boots and that is bigger than some of the
  // differences being read here.
  for(const snow of [[235,255],[248,264],[258,272],[235,255]])
  for(const [hour,t] of [['noon',0.25],['dusk',0.46],['dawn',0.04]]){
    await W.ev(`__hc.mtn(true,{snow:[${snow[0]},${snow[1]}]})`);
    await pin(W,t); await sleep(800); await pin(W,t);
    const plain=px((await shots(W,`cap-${snow[0]}-${hour}-plain`,t,1))[0]);
    await W.ev(`__hc.mtnDbg(1)`); await sleep(350);
    const sm=px((await shots(W,`cap-${snow[0]}-${hour}-snow`,t,1))[0]);
    await W.ev(`__hc.mtnDbg(3)`); await sleep(350);
    const lm=px((await shots(W,`cap-${snow[0]}-${hour}-layer`,t,1))[0]);
    await W.ev(`__hc.mtnDbg(0)`); await sleep(250);
    console.log(`snow ${snow[0]}/${snow[1]} ${hour.padEnd(5)}`, JSON.stringify(stats(sm,lm,plain)));
  }
}finally{ await W.close(); }
