// WHAT SETS THE BAND'S VALUE? Every dial on this layer was turned between 5821d57 and 08-17, which is exactly the
// window in which its shader did not compile — so "gain 1.1, because 0.62 was invisible" and the rest were all read
// off an empty framebuffer and none of them can be trusted. Measure again, properly: uDbg 3 paints the layer flat
// magenta, so the magenta pixels ARE the band and the same mask can be applied to the plain frame. No crop guessing.
import { openWorld, shots, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const px=f=>decodePNG(fs.readFileSync(f));
function maskOf(M,P){                       // M = magenta frame, P = plain frame of the same condition
  let n=0,s=0,mn=255,mx=0, sky=0,skyN=0, wood=0,woodN=0;
  for(let y=0;y<M.h;y++) for(let x=0;x<M.w;x++){
    const i=(y*M.w+x)*M.ch, r=M.data[i], g=M.data[i+1], b=M.data[i+2];
    const isM = r>g+25 && b>g+25;           // magenta: red and blue both over green. Sky is blue-over-red, so it is out.
    const l=0.2126*P.data[i]+0.7152*P.data[i+1]+0.0722*P.data[i+2];
    if(isM){ n++; s+=l; if(l<mn)mn=l; if(l>mx)mx=l; }
    else if(y<M.h*0.35 && b>r+8){ sky+=l; skyN++; }
    else if(P.data[i+1]>P.data[i]+10 && P.data[i+1]>P.data[i+2]+10 && l<110){ wood+=l; woodN++; }
  }
  const B=s/Math.max(n,1), S=sky/Math.max(skyN,1), Wd=wood/Math.max(woodN,1);
  // THE REAL WOOD IN THE SAME FRAME IS THE REFERENCE. A distant range should sit a little ABOVE the near canopy in
  // value — that is aerial perspective — and well below the sky. band/wood is the number that says which.
  return { bandPx:n, band:+B.toFixed(1), max:+mx.toFixed(0), sky:+S.toFixed(1), wood:+Wd.toFixed(1),
           bandOverWood:+(B/Math.max(Wd,1e-3)).toFixed(2), bandOverSky:+(B/Math.max(S,1e-3)).toFixed(3) };
}
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); H.cam({yaw:3.665, pitch:0.02}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(3000);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25); await sleep(900); await pin(W,0.25);
  // WITH THE SNOW TAKEN OUT, because the snow term does not go through uGain: it REPLACES the rock colour, so a gain
  // sweep that barely moves the band is consistent with a band that is mostly snow rather than with a gain that does
  // nothing. snow:[10000,10000] is the same dial putting the line above every peak.
  const CONFIGS=[
    ['shipped',        `__hc.mtn(true,{gain:1.1,  haze:[0.12,0.62]})`],
    ['haze .05',       `__hc.mtn(true,{gain:1.1,  haze:[0.05,0.45]})`],
    ['g.7 haze .05',   `__hc.mtn(true,{gain:0.7,  haze:[0.05,0.45]})`],
    ['g.45 haze .05',  `__hc.mtn(true,{gain:0.45, haze:[0.05,0.45]})`],
    ['g.45 haze .02',  `__hc.mtn(true,{gain:0.45, haze:[0.02,0.40]})`],
  ];



  for(const [tag,cmd] of CONFIGS){
    await W.ev(cmd); await sleep(700);
    const p=(await shots(W,`v-${tag.replace(/\W+/g,'')}-plain`,0.25,1))[0];
    await W.ev(`__hc.mtnDbg(3)`); await sleep(400);
    const m=(await shots(W,`v-${tag.replace(/\W+/g,'')}-mag`,0.25,1))[0];
    await W.ev(`__hc.mtnDbg(0)`); await sleep(300);
    console.log(tag.padEnd(12), JSON.stringify(maskOf(px(m),px(p))));
  }
  await W.ev(`__hc.mtn(true,{band:-1, snow:[235,255]})`);
}finally{ await W.close(); }
