// NIGHT IS BLACK, THE DAY IS UNTOUCHED, AND A TORCH IS THE ONLY THING THAT CHANGES IT (_hcNight's w, __hc.night).
//
// The three claims this has to carry, and each has its own control:
//   · MIDNIGHT: unlit ground is mostly PURE BLACK, and the sky crop -- the dome, the stars, the moon, which are not
//     diffuse light on a surface -- does not move with the dial at all. The sky is the control the change cannot
//     affect by construction; if it moves, the dial is reaching something it has no business in.
//   · NOON: night(1) and the shipped level are IDENTICAL to the noise floor. The factor is mixed on `day`, so this is
//     true by construction and the check is there to keep it true.
//   · A TORCH MATTERS: the same crop, at the darkest level, with a torch in hand.
// SITES ARE FOUND, NOT GUESSED, and the bar is baked block light 0 under foot AND eight blocks out in four directions:
// three published night numbers on this game were a campfire, an unmeshed crown and a wood with no trees in it.
//   node bench/assert-night-black.mjs
import { openWorld, pin, shots, statMedian, CROP, fmt, check, report, sleep } from './lib/rig.mjs';
const NIGHT=0.75, NOON=0.25, SHIP=0.06;   // the shipped level, restated here so a sweep in the harness cannot silently become the default
const SKY=[0.05,0.45,0.03,0.20], VM=[0.70,0.99,0.70,0.88];
(async()=>{
  const W = await openWorld({ rd:8, w:900, h:520 });
  const P = W.page;
  try{
    const sites = await P.evaluate(`(function(){
      const S=__hc.st(), dark=(x,z)=>{ const gy=__hc.groundY(x,z);
        for(const [dx,dz] of [[0,0],[8,0],[-8,0],[0,8],[0,-8]]){ const b=__hc.blockLight(x+dx,gy+1,z+dz); if(!b.chunk||b.lit==null||b.lit>0) return null; }
        return gy; };
      const want={wood:null,open:null}, gid=__hc.bid('grass');
      for(let r=16;r<=200 && !(want.wood&&want.open);r+=8) for(let a=0;a<40;a++){
        const x=Math.round(S.sx+Math.cos(a/40*6.2832)*r), z=Math.round(S.sz+Math.sin(a/40*6.2832)*r);
        const gy=dark(x,z); if(gy==null) continue;
        const c=__hc.canopyAt(x,z), b=__hc.blockAt(x,gy,z), lv=c.col?c.col.leavesInWholeColumn:0;
        if(!want.wood && lv>=6) want.wood={tag:'wood',x,z,gy,leaves:lv};
        if(!want.open && b===gid && lv===0) want.open={tag:'open',x,z,gy,leaves:0};
      }
      return [want.wood,want.open].filter(Boolean); })()`);
    console.log('  sites', JSON.stringify(sites));
    const R={};
    for(const s of sites){
      await P.evaluate(`__hc.tp(${s.x}, ${s.gy+1.7}, ${s.z}, 0, -0.25)`); await sleep(1500);
      // BASELINE REPEATED LAST, per bench/README.md: the sky crop has live waves, leaves and birds in it, so a control
      // that quotes one pair of frames cannot tell a 2-level effect from a 2-level frame. night(1)-again is the floor.
      for(const [tag,t,L] of [['night-old',NIGHT,1],['night-ship',NIGHT,null],['night-old2',NIGHT,1],
                              ['noon-old',NOON,1],['noon-ship',NOON,null],['noon-old2',NOON,1]]){
        await P.evaluate(`__hc.night(${L==null?SHIP:L})`);
        await sleep(300); await pin(W, t);
        const f = await shots(W, `nb-${s.tag}-${tag}`, t, 3);
        R[s.tag+'/'+tag] = { g:statMedian(f,CROP.ground), sky:statMedian(f,SKY) };
        console.log(`    ${s.tag.padEnd(5)} ${tag.padEnd(10)} ground ${fmt(R[s.tag+'/'+tag].g)}`);
        console.log(`    ${''.padEnd(5)} ${''.padEnd(10)} sky    lum ${R[s.tag+'/'+tag].sky.lum}`);
      }
    }
    // the torch, at the wood, at the shipped level
    const s=sites[0];
    await P.evaluate(`__hc.tp(${s.x}, ${s.gy+1.7}, ${s.z}, 0, -0.40)`); await sleep(600);
    const T={};
    for(const [tag,js] of [['empty',`__hc.night(${SHIP}); __hc.hold('stone')`],['torch',`__hc.night(${SHIP}); __hc.hold('torch')`]]){
      await P.evaluate(js); await sleep(800); await pin(W, NIGHT);
      const f = await shots(W, `nb-torch-${tag}`, NIGHT, 3);
      T[tag]={ g:statMedian(f,CROP.ground), vm:statMedian(f,VM) };
      console.log(`    torch test ${tag.padEnd(6)} ground ${fmt(T[tag].g)}`);
      console.log(`    ${''.padEnd(16)} hand   ${fmt(T[tag].vm)}`);
    }
    console.log('');
    for(const s of sites){
      const a=R[s.tag+'/night-old'], b=R[s.tag+'/night-ship'];
      check(`${s.tag}: midnight ground is mostly pure black`, b.g.blackPct>=40, `${b.g.blackPct}% black (was ${a.g.blackPct}% at night(1))`);
      check(`${s.tag}: the dial darkens the night`, b.g.med<=a.g.med, `med ${b.g.med} vs ${a.g.med}`);
      const a2=R[s.tag+'/night-old2'];
      const floor=Math.abs(a2.sky.lum-a.sky.lum), eff=Math.abs(b.sky.lum-a.sky.lum);
      check(`${s.tag}: CONTROL the sky does not move`, eff<=Math.max(1.0,floor*1.5),
            `sky ${a.sky.lum} -> ${b.sky.lum} (effect ${eff.toFixed(2)}) against a noise floor of ${floor.toFixed(2)} (${a.sky.lum} -> ${a2.sky.lum})`);
      // NOON IS UNTOUCHED BY CONSTRUCTION -- at day 1 the factor is exactly 1 and the multiply is bit-identical -- so
      // this control exists to catch the day being reached by accident, and it needs its own noise floor for the same
      // reason the sky one does: a noon wood has swaying tufts and scrolling cloud shadow in the crop.
      const c=R[s.tag+'/noon-old'], d=R[s.tag+'/noon-ship'], c2=R[s.tag+'/noon-old2'];
      const nf=Math.abs(c2.g.med-c.g.med), ne=Math.abs(c.g.med-d.g.med);
      check(`${s.tag}: CONTROL noon is untouched`, ne<=Math.max(0.4,nf*1.5),
            `noon med ${c.g.med} -> ${d.g.med} (effect ${ne.toFixed(2)}) against a noise floor of ${nf.toFixed(2)} (${c.g.med} -> ${c2.g.med})`);
    }
    check('a torch lights the ground the night left black', T.torch.g.med>=8 && T.empty.g.med<=2, `empty med ${T.empty.g.med} -> torch med ${T.torch.g.med}`);
    process.exit(report()?0:1);
  } finally { await W.close(); }
})();
