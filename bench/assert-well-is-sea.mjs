// THE WELL AND THE SEA IN ONE FRAME (Ben 08-18: "It must be the SAME water as the ocean - same material, same shader,
// same reflections ... Photograph the well and the sea in the same frame conditions and show the reflection matching").
//
// WHAT IS ALREADY TRUE, and worth measuring rather than asserting: the well's cells are chunk water and chunk water is
// waterMat, the same ShaderMaterial instance the ocean draws with. __hc.waterProp reports the material by identity, so
// "same material" is a fact this harness can print rather than a claim.
// WHAT A REFLECTION IS, AS A NUMBER: a surface that reflects the sky CHANGES when the sky changes. So both surfaces are
// sampled at two hours in the same frame, and the size of their response is compared. A painted lid holds its colour
// while the sky moves; a mirror follows it.
import { spawnSync } from 'node:child_process';
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
function px(file){ const r=spawnSync('ffmpeg',['-loglevel','error','-i',file,'-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:1<<28});
  return r.status===0?r.stdout:null; }
function region(buf,w,h,x0,y0,x1,y1){ let n=0,sr=0,sg=0,sb=0; const L=[];
  for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){ const i=(y*w+x)*3; sr+=buf[i]; sg+=buf[i+1]; sb+=buf[i+2];
    L.push(0.2126*buf[i]+0.7152*buf[i+1]+0.0722*buf[i+2]); n++; }
  if(!n) return null; const mean=L.reduce((a,b)=>a+b,0)/n;
  return { n, r:+(sr/n).toFixed(1), g:+(sg/n).toFixed(1), b:+(sb/n).toFixed(1), lum:+mean.toFixed(1),
    sd:+Math.sqrt(L.reduce((a,b)=>a+(b-mean)*(b-mean),0)/n).toFixed(2) }; }
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)');
    console.log('  water material: '+JSON.stringify(await ev('__hc.waterProp&&__hc.waterProp()')).slice(0,220));
    console.log('  well cells:     '+JSON.stringify(await ev('__hc.wellWater&&__hc.wellWater()')).slice(0,150));
    const P=await ev('__hc.probe()');
    const wx=P.spawnX+14, wz=P.spawnZ+34;
    const gy=await ev(`Math.round(__hc.surfH(${wx},${wz}))`);
    // ONE FRAME WITH BOTH IN IT IS NOT AVAILABLE, and that is geometry rather than laziness: the shaft can only be
    // seen from above, which points the camera down, and the sea is at the horizon. So both surfaces are shot at the
    // SAME hour in the same run -- "the same frame conditions" -- and the crops are confirmed against the frames:
    // the well's water fills 440..650 x 205..285 from the rim vantage, and the sea fills the lower half from the beach.
    // AND THE SAME WELL WITH ITS ROOF AND LANTERN TAKEN AWAY. The shader is shared, so if the well's surface tracks the
    // sky once the sky can reach it, the difference Ben sees is the WELL's own housing and not the water at all. That
    // is the experiment that separates "a lookalike material" from "the sea's material under a plank roof beside a lamp".
    const strip=`(()=>{ let n=0;
      for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++){ __hc.setBlk(${wx}+dx, ${gy}+4, ${wz}+dz, 'air'); n++; }
      __hc.setBlk(${wx}, ${gy}+3, ${wz}, 'air');
      for(const [ox,oz] of [[-2,-2],[2,-2],[-2,2],[2,2]]) for(let y=2;y<=3;y++) __hc.setBlk(${wx}+ox, ${gy}+y, ${wz}+oz, 'air');
      return n; })()`;
    // AND THE CONTROL: the same two surfaces with the Fresnel floor off, which is the shipped behaviour before this
    // change. The sea must be unaffected by it -- that is the whole claim of putting a floor on F rather than a cap.
    const out={}, bare={}, off={};
    for(const [tag,t] of [['noon',0.30],['dusk',0.62]]){
      await ev(`__hc.setTime(${t})`);
      await ev(`__hc.tpExact(${wx-3.2}, ${wz}, ${gy+2.6})`); await sleep(300);
      await ev(`__hc.look(${wx+0.5}, ${gy+0.6}, ${wz})`); await sleep(1100);
      const fw=path.join(OUT,'wellsea-well-'+tag+'.png'); await W.page.screenshot({path:fw});
      await ev(`__hc.tp(${P.spawnX-34}, ${P.spawnZ})`);
      for(let i=0;i<10;i++){ const f=await ev('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(350); }
      await ev(`__hc.setTime(${t})`);
      await ev('__hc.cam({yaw:'+(Math.PI*1.05).toFixed(3)+', pitch:0.25})'); await sleep(1100);
      const fs=path.join(OUT,'wellsea-sea-'+tag+'.png'); await W.page.screenshot({path:fs});
      const bw=px(fw), bs=px(fs), w=1000, h=Math.floor(bw.length/3/w);
      const well=region(bw,w,h, 445, 208, 645, 282);
      const sea =region(bs,w,h, 120, Math.floor(h*0.55), 880, Math.floor(h*0.75));
      out[tag]={well,sea};
      console.log('  '+tag.padEnd(5)+' well '+JSON.stringify(well));
      console.log('         sea  '+JSON.stringify(sea));
    }
    // THE CLAIM AS A RATIO: a surface that reflects the sky loses brightness as the sky dims. If the well tracks the sea,
    // the two ratios are close; a painted lid would hold its value and read near 1.0 while the sea fell.
    const rw=out.dusk.well.lum/out.noon.well.lum, rs=out.dusk.sea.lum/out.noon.sea.lum;
    console.log('');
    console.log('  ROOFED   noon->dusk   well x'+rw.toFixed(3)+'   sea x'+rs.toFixed(3)+'   ratio of ratios '+(rw/rs).toFixed(3));
    console.log('  stripping the roof, the lantern and the fence: '+JSON.stringify(await ev(strip)));
    await sleep(1200);
    for(const [tag,t] of [['noon',0.30],['dusk',0.62]]){
      await ev(`__hc.setTime(${t})`);
      await ev(`__hc.tpExact(${wx-3.2}, ${wz}, ${gy+2.6})`); await sleep(300);
      await ev(`__hc.look(${wx+0.5}, ${gy+0.6}, ${wz})`); await sleep(1100);
      const fw=path.join(OUT,'wellsea-bare-'+tag+'.png'); await W.page.screenshot({path:fw});
      bare[tag]=region(px(fw),1000,560, 445, 208, 645, 282);
      console.log('  bare '+tag.padEnd(5)+JSON.stringify(bare[tag]));
    }
    const rb=bare.dusk.lum/bare.noon.lum;
    console.log('  BARE     noon->dusk   well x'+rb.toFixed(3)+'   sea x'+rs.toFixed(3)+'   ratio of ratios '+(rb/rs).toFixed(3));
    console.log('  refl dials '+JSON.stringify(await ev('__hc.waterRefl()')).slice(0,120));
  } finally { await W.close(); } })();
