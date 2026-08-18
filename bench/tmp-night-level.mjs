// THE NIGHT LEVEL, SWEPT AND PHOTOGRAPHED. Midnight, empty hands, sites chosen for baked block light 0 under foot AND
// eight blocks out in four directions (7b7be34's rule, widened: a fire six blocks away lights the crop without lighting
// the cell you stand in). night(1) is the build before the dial, so every row has its own control.
// The last block is the torch: the same site, the darkest level, a torch in hand.
//   node bench/tmp-night-level.mjs
import { openWorld, pin, shots, statMedian, CROP, fmt, sleep } from './lib/rig.mjs';
const NIGHT=0.75, LEVELS=[1,0.25,0.10,0.06,0];
// the held item, bottom-right, and the SKY: the dial owns the first and must not move the second (the dome, the stars
// and the moon are not diffuse light on a surface). The sky crop is the control this change cannot affect.
const VM=[0.62,0.98,0.66,0.86], SKY=[0.05,0.45,0.03,0.20];
(async()=>{
  const W = await openWorld({ rd:8, w:900, h:520 });
  const P = W.page;
  try{
    const sites = await P.evaluate(`(function(){
      const S=__hc.st(), out=[]; const dark=(x,z)=>{ const gy=__hc.groundY(x,z);
        for(const [dx,dz] of [[0,0],[8,0],[-8,0],[0,8],[0,-8]]){ const b=__hc.blockLight(x+dx,gy+1,z+dz); if(!b.chunk||b.lit==null||b.lit>0) return null; }
        return gy; };
      const want={wood:null,open:null,shore:null};
      const gid=__hc.bid('grass'), sid=__hc.bid('sand');
      for(let r=16;r<=200;r+=8) for(let a=0;a<40;a++){
        const x=Math.round(S.sx+Math.cos(a/40*6.2832)*r), z=Math.round(S.sz+Math.sin(a/40*6.2832)*r);
        const gy=dark(x,z); if(gy==null) continue;
        const c=__hc.canopyAt(x,z); const b=__hc.blockAt(x,gy,z);
        if(!want.wood && c.col && c.col.leavesInWholeColumn>=6) want.wood={x,z,gy,leaves:c.col.leavesInWholeColumn};
        if(!want.open && b===gid && c.col && c.col.leavesInWholeColumn===0) want.open={x,z,gy,leaves:0};
        if(!want.shore && b===sid) want.shore={x,z,gy,leaves:0};
      }
      for(const k of ['wood','open','shore']) if(want[k]) out.push({tag:k, ...want[k]});
      return out; })()`);
    console.log('  sites', JSON.stringify(sites));
    for(const s of sites){
      await P.evaluate(`__hc.tp(${s.x}, ${s.gy+1.7}, ${s.z}, 0, -0.12)`); await sleep(1500);
      console.log(`  --- ${s.tag} (${s.x},${s.z}) gy${s.gy} leaves ${s.leaves}`);
      for(const L of LEVELS){
        await P.evaluate(`__hc.night(${L})`); await sleep(300); await pin(W, NIGHT);
        const f = await shots(W, `lvl-${s.tag}-${String(L).replace('.','')}`, NIGHT, 3);
        const g = statMedian(f, CROP.ground), vm = statMedian(f, VM), sky = statMedian(f, SKY);
        console.log(`    night ${String(L).padEnd(5)} ground med ${String(g.med).padStart(6)} black ${String(g.blackPct).padStart(7)}%  |  hand med ${String(vm.med).padStart(6)} lum ${String(vm.lum).padStart(6)}  |  CTRL sky lum ${String(sky.lum).padStart(6)}`);
      }
    }
    // THE TORCH HAS TO MATTER. Same site, darkest level, empty hands then a torch in hand.
    const s=sites[0];
    await P.evaluate(`__hc.tp(${s.x}, ${s.gy+1.7}, ${s.z}, 0, -0.35)`); await sleep(800);
    for(const [tag,js] of [['empty  night .06',`__hc.night(0.06); __hc.hold('stone')`],
                           ['torch  night .06',`__hc.night(0.06); __hc.hold('torch')`],
                           ['torch  night 0',  `__hc.night(0);    __hc.hold('torch')`]]){
      await P.evaluate(js); await sleep(700); await pin(W, NIGHT);
      const f = await shots(W, `lvl-torch-${tag.replace(/\W+/g,'')}`, NIGHT, 3);
      const g = statMedian(f, CROP.ground);
      console.log(`    ${tag}  ground ${fmt(g)}`);
    }
  } finally { await W.close(); }
})();
