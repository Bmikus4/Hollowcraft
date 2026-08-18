// THE NEAR-FIELD FLOOR IS A POOL AROUND WHAT THE CROSSHAIR IS ON (uHcAim, __hc.nearFloor).
//
// Ben: "when you are close to a block at night you should be able to see it if you are right up against it", and
// 7cee4ca measured the radius form dead -- "a radius around the CAMERA cannot tell the wall in front of your face from
// the floor under your feet; both are one to two blocks away". So the claim under test is not brightness, it is
// SEPARATION, and each case is two frames of the SAME PIXELS with only the aim changed:
//   A. A real cliff face found in the terrain (never /setblock), eye 0.8 blocks off it, crosshair ON it, midnight,
//      empty hands: the wall reads. Baseline repeated last for the noise floor.
//   B. THE CONTROL A RADIUS COULD NOT PASS. Same spot, same wall, same distance, crosshair tilted onto the SKY so
//      nothing is within reach: uHcAim.w is 0 and the wall goes back to black. Distance did not change; aim did.
//   C. A POOL, NOT A LIT NIGHT. Standing in the open looking down at the floor: the patch under the crosshair lights
//      and the ground six blocks further out, in the same frame, does not.
// The term is proven to FIRE before any of it is believed -- __hc.nearFloor() hands back the aim point and the w that
// reached the shader this frame. Three lighting terms on this game shipped inert and looked plausible.
//   node bench/assert-near-floor.mjs
import { openWorld, pin, shots, statMedian, CROP, fmt, check, report, sleep } from './lib/rig.mjs';
const NIGHT=0.75, AMT=0.025;                     // AMT is the shipped value, restated so a sweep cannot become the default
const LOWER=[0.25,0.75,0.62,0.80], TOPBAND=[0.25,0.75,0.06,0.22];
(async()=>{
  const W = await openWorld({ rd:8, w:900, h:520 }); const P=W.page;
  try{
    // A REAL FACE: a column whose neighbour in one of the four directions stands at least 2 blocks taller, with no
    // baked block light at either cell. The yaw that looks at it comes back with it.
    const site = await P.evaluate(`(function(){
      const S=__hc.st(), D=[[0,-1,0],[0,1,Math.PI],[-1,0,Math.PI/2],[1,0,-Math.PI/2]];
      for(let r=10;r<=220;r+=6) for(let a=0;a<48;a++){
        const x=Math.round(S.sx+Math.cos(a/48*6.2832)*r), z=Math.round(S.sz+Math.sin(a/48*6.2832)*r);
        const here=__hc.groundY(x,z);
        const bl=__hc.blockLight(x,here+1,z); if(!bl.chunk||bl.lit==null||bl.lit>0) continue;
        for(const [dx,dz,yaw] of D){
          const wall=__hc.groundY(x+dx,z+dz); if(wall-here<2) continue;
          const b2=__hc.blockLight(x+dx,wall,z+dz); if(!b2.chunk||b2.lit==null||b2.lit>0) continue;
          return {x,z,here,wall,dx,dz,yaw};
        } } return null; })()`);
    if(!site){ console.log('  FAIL: no unlit cliff face within 220 blocks — this run measures nothing'); process.exit(1); }
    console.log('  site', JSON.stringify(site));
    // 0.8 off the shared face plane, eye level. tp's y is the FEET: the eye is EYE above it, and getting that wrong
    // puts the crosshair over the top of the wall and reads the term as inert (it did, once).
    const sx=site.x+0.5-site.dx*0.3, sz=site.z+0.5-site.dz*0.3;
    const R={};
    async function row(tag, tp, amt, crops){
      await P.evaluate(`${tp}; __hc.nearFloor({amt:${amt}})`); await sleep(700); await pin(W,NIGHT);
      const f = await shots(W, `nf-${tag.replace(/\W+/g,'')}`, NIGHT, 3);
      const o={ rd:await P.evaluate(`__hc.nearFloor()`) };
      for(const [n,c] of Object.entries(crops)) o[n]=statMedian(f,c);
      R[tag]=o;
      console.log(`    ${tag.padEnd(18)} w ${String(o.rd.w).padStart(7)} aim ${JSON.stringify(o.rd.aim)}`);
      for(const n of Object.keys(crops)) console.log(`    ${''.padEnd(18)} ${n.padEnd(6)} ${fmt(o[n])}`);
    }
    const at   = `__hc.tp(${sx}, ${site.here}, ${sz}, ${site.yaw}, 0)`;
    const up   = `__hc.tp(${sx}, ${site.here}, ${sz}, ${site.yaw}, 1.30)`;
    await row('A wall amt0',    at, 0,   {wall:LOWER});
    await row('A wall shipped', at, AMT, {wall:LOWER});
    await row('A wall amt0 2',  at, 0,   {wall:LOWER});
    await row('B sky amt0',     up, 0,   {wall:LOWER});
    await row('B sky shipped',  up, AMT, {wall:LOWER});
    // D. THE OTHER GATE. Same wall, same aim, backed off past AIM_FAR: distance alone must switch it off, or "right up
    // against it" is not what the term means.
    const back = `__hc.tp(${site.x+0.5-site.dx*2.6}, ${site.here}, ${site.z+0.5-site.dz*2.6}, ${site.yaw}, 0)`;
    await row('D back amt0',    back, 0,   {wall:CROP.centre});
    await row('D back shipped', back, AMT, {wall:CROP.centre});
    const down = `__hc.tp(281.5, 44, 23.5, 0, -1.25)`;
    await row('C down amt0',    down, 0,   {pool:CROP.centre, far:TOPBAND});
    await row('C down shipped', down, AMT, {pool:CROP.centre, far:TOPBAND});

    console.log('');
    const a=R['A wall amt0'], b=R['A wall shipped'], a2=R['A wall amt0 2'];
    const nf=Math.abs(a2.wall.med-a.wall.med), eff=b.wall.med-a.wall.med;
    check('the term FIRES: a strength reached the shader', b.rd.w>0 && a.rd.w===0, `w ${a.rd.w} -> ${b.rd.w}`);
    check('A: the wall you are looking at reads', eff>=5 && eff>Math.max(1,nf*3),
          `wall med ${a.wall.med} -> ${b.wall.med} (effect ${eff.toFixed(2)}) against a noise floor of ${nf.toFixed(2)}`);
    check('A: and it is a FLOOR, not a light — the wall stays under 60 of 255', b.wall.med<=60, `wall med ${b.wall.med}`);
    const c=R['B sky amt0'], d=R['B sky shipped'];
    check('B: aim off the wall, same distance, and the wall goes black again',
          d.rd.w===0 && Math.abs(d.wall.med-c.wall.med)<=Math.max(0.5,nf),
          `w ${d.rd.w}, same wall med ${c.wall.med} -> ${d.wall.med}`);
    const h1=R['D back amt0'], h2=R['D back shipped'];
    check('D: CONTROL backed off past the gate, the same wall stays black',
          h2.rd.w===0 && Math.abs(h2.wall.med-h1.wall.med)<=Math.max(0.5,nf),
          `w ${h2.rd.w}, wall med ${h1.wall.med} -> ${h2.wall.med}`);
    // AND LOOKING DOWN AT THE FLOOR IS NOT TOUCHING DISTANCE, which is the design and not a shortfall: from standing
    // eye height the ground under a downward glance is about 1.7 blocks off, two thirds of the way through the gate, so
    // it reads 1 of 255. The term answers "right up against it"; it does not light the ground you walk on.
    const e=R['C down amt0'], g=R['C down shipped'];
    check('C: looking down at the floor does NOT light the night', g.pool.med<=3 && g.far.med<=1,
          `aim ${g.rd.w} of ${AMT} at ${g.rd.aim} — pool med ${e.pool.med} -> ${g.pool.med}, far ${e.far.med} -> ${g.far.med}`);
    process.exit(report()?0:1);
  } finally { await W.close(); }
})();
