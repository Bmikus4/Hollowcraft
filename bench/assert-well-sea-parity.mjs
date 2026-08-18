// THE WELL AND THE SEA IN ONE FRAME (Ben, queue item: "WELL WATER must be the ONE implementation the sea uses -- same
// material/shader/reflections, not a lookalike. Photograph well + sea in the same frame conditions and show the
// reflections matching").
//
// cea6b58 already answered the material question by identity: the well draws with waterMat, which is the sea's own
// material, and what differs between his frame of a well and his frame of the sea is the VIEW ANGLE -- a shaft is seen
// from almost straight down, where Fresnel gives a surface almost no sky and all of its own body colour, and the sea is
// seen at a grazing angle where it is almost all sky. That is an argument, and Ben asked for a frame.
//
// SO BOTH ARE IN ONE FRAME, AT ONE HOUR, WITH THE SAME SUN. A shaft is cut into the ground at the shore and filled, the
// camera stands back from it looking out to sea, and the two water surfaces are cropped separately from the SAME png.
// Whatever the numbers say, they cannot be blamed on two different frames, two different hours or two different suns.
//
// THE SHAFT IS CUT AT THE SHORE, NOT THE WELL AT SPAWN, and that is the same reason assert-well-water uses a pool: the
// spawn well stands in a forest and a trunk fills the frame from every bearing that can see into it, and there is no sea
// within a hundred blocks of it. The shaft is cobble-lined and two blocks of water deep, which is what the well is.
//
//   node bench/assert-well-sea-parity.mjs
import { openWorld, sleep, OUT, statFile, fmt, check, report } from './lib/rig.mjs';
import path from 'node:path';

(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.lock(true)'); await ev("__hc.cmdRun('/gamemode creative')"); await ev("__hc.cmdRun('/fly on')");
    await ev('__hc.cinema(true)'); await ev('__hc.freezeT(0)');
    const IC=await ev('__hc.isleStats()'); const SEA=await ev('__hc.island().sea');
    // The outermost dry column on a bearing: the waterline, found rather than guessed (the same walk the pines harness uses).
    const shore=await ev(`(()=>{ for(let d=Math.round(${IC.R}*2.2); d>30; d-=1){
        const x=Math.round(${IC.x}-d), z=Math.round(${IC.z});
        if(__hc.surfH(x,z)>${SEA}) return {x,z,g:Math.round(__hc.surfH(x,z))}; } return null; })()`);
    if(!shore) throw new Error('no shore');
    console.log('  island '+JSON.stringify(IC)+' sea '+SEA+'  shore '+JSON.stringify(shore));
    // A SHAFT, EIGHT BLOCKS INLAND OF THE WATERLINE. Inland so its rim is above sea level and its water is genuinely
    // water-above-sea-level, which is the case the well is and the case the ocean plane's height cut has to let through.
    const sx=shore.x+8, sz=shore.z, rim=await ev(`Math.round(__hc.surfH(${sx},${sz}))`);
    await ev(`(()=>{ __hc.waterSim(false);
      // flatten a pad so the rim is level and the shaft is not cut into a slope
      for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++){
        for(let y=${rim}+1;y<=${rim}+6;y++) __hc.setBlk(${sx}+dx,y,${sz}+dz,'air');
        __hc.setBlk(${sx}+dx,${rim},${sz}+dz,'grass'); }
      // the shaft: three by three, four deep, cobble-lined, two blocks of water at the top of it
      for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) for(let y=${rim}-4;y<=${rim};y++) __hc.setBlk(${sx}+dx,y,${sz}+dz,'air');
      for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) for(let y=${rim}-5;y<=${rim};y++)
        if(Math.abs(dx)===2||Math.abs(dz)===2||y===${rim}-5) __hc.setBlk(${sx}+dx,y,${sz}+dz,'cobble');
      for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++){ __hc.setBlk(${sx}+dx,${rim}-1,${sz}+dz,'water'); __hc.setBlk(${sx}+dx,${rim},${sz}+dz,'water'); }
      return true; })()`);
    await sleep(1200);
    // STAND BACK AND LOOK OVER IT AT THE SEA. Six blocks inland of the shaft and a little above its rim, pitched down
    // enough that the shaft's surface is in the lower third of the frame and the sea fills the middle.
    await ev(`__hc.tpAt(${sx}+5.5, ${rim}+3, ${sz}+0.5);`);
    await sleep(400);
    await ev(`__hc.cam({yaw:${Math.PI/2}, pitch:-0.30})`);
    for(let i=0;i<30;i++){ const f=await ev('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(2500);
    const wp=await ev('__hc.waterProp()');
    console.log('  waterMat '+JSON.stringify(wp.now));
    // The two crops. Both are read off the SAME file, which is the whole point of the exercise.
    const CROP_WELL=[0.38,0.62,0.66,0.86], CROP_SEA=[0.20,0.80,0.34,0.44];
    for(const [tag,t] of [['noon',0.25],['dusk',0.46],['night',0.80]]){
      await ev(`__hc.setTime(${t})`); await sleep(900); await ev(`__hc.setTime(${t})`); await sleep(600);
      const f=path.join(OUT,`wsp-${tag}.png`); await W.page.screenshot({path:f});
      const a=statFile(f,CROP_WELL), b=statFile(f,CROP_SEA);
      console.log(`  ${tag}`);
      console.log(`    shaft  ${fmt(a)}  rgb ${JSON.stringify(a.rgb)}`);
      console.log(`    sea    ${fmt(b)}  rgb ${JSON.stringify(b.rgb)}`);
      // THE HUE IS THE PARITY CLAIM, NOT THE BRIGHTNESS. Two surfaces of one material at different angles MUST differ in
      // level -- that is Fresnel, and it is the explanation cea6b58 offered. What they must not differ in is which way
      // the colour leans: the same shader on the same water body colour and the same sky gives the same channel ORDER
      // and a similar blue lead. A lookalike material would show up here.
      const lead=o=>+(o.rgb[2]-(o.rgb[0]+o.rgb[1])/2).toFixed(2);
      const norm=o=>+((o.rgb[2]-(o.rgb[0]+o.rgb[1])/2)/Math.max(1,o.lum)).toFixed(3);
      console.log(`    blue lead: shaft ${lead(a)} sea ${lead(b)}   per unit luminance: shaft ${norm(a)} sea ${norm(b)}`);
      // THE HUE MUST LEAN THE SAME WAY AS THE OTHER SURFACE, not blue in particular. The first cut asserted "both lead
      // blue" and it failed at dusk on both surfaces at once, which is not a fault: at dusk water is warm because the sky
      // it reflects is warm. What parity means is that the two agree with each other.
      check(`${tag}: the two surfaces lean the same way`, (lead(a)>=0)===(lead(b)>=0), `shaft ${lead(a)}, sea ${lead(b)}`);
      // AND THE LEVEL HAS TO BE IN THE SAME WORLD. Fresnel entitles a shaft seen from above to be DARKER than a sea seen
      // at a grazing angle -- it has less sky in it. It does not entitle it to be brighter, and certainly not to be the
      // brightest thing in a night frame, which is the fault Ben reported and which is what this catches.
      const ratio=+(a.lum/Math.max(b.lum,0.01)).toFixed(2);
      check(`${tag}: the shaft is not brighter than the sea by more than 3x`, ratio<=3, `shaft/sea luminance ${ratio}`);
      check(`${tag}: neither surface is a discard hole`, a.blackPct<1 && b.blackPct<1, `shaft ${a.blackPct}%, sea ${b.blackPct}%`);
    }
    report();
  } finally { await W.close(); } })();
