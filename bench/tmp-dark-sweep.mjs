// PRICING ITEM 2 BEFORE WRITING ANY SHADER. Both levers already exist as live uniforms — __hc.skyCurve({floor,exp})
// and __hc.dayShade({dark,k}) — and both are inert at their shipped values, so the whole of "make unlit places dark"
// can be swept in ONE boot against the three places it must not break.
//
// THE THREE SITES, and why each one is here:
//   cave      — a CARVED room at y=44. vSky is a true 0. This is what has to go black, at NOON as well as at midnight.
//   shade     — ground under the forest canopy at noon. vSky is ~1 here (leaves are deliberately not sky occluders,
//               Ben 07-23), so the sky curve must be INERT on it. If this darkens, the fix is hitting the wrong thing.
//   cabin     — inside the spawn cabin at noon: a real interior with real openings. vSky is 0 in here too, so this is
//               the case that decides whether a zero floor is shippable or whether skylight has to be flooded.
//
// The exponent is the shape and the floor is the level. A sub-1 exponent is the whole idea being tested: pow(vSky,0.55)
// is 0 at vSky 0 and already 0.24 at ONE 4-bit step of sky (1/15), so a partially-lit face keeps roughly what the 0.26
// floor was giving it while a genuinely sealed one gets nothing. That is the shape both of Ben's earlier instructions
// were reaching for when the floor was raised instead.
//
//   node bench/tmp-dark-sweep.mjs
import { openWorld, pin, measure, CROP, fmt, sleep } from './lib/rig.mjs';

const NOON=0.25, NIGHT=0.75;

(async()=>{
  const W = await openWorld({ rd:8 });
  const P = W.page;
  try{
    const S = await P.evaluate(`__hc.st()`);
    const CX = Math.round(S.sx)+18, CZ = Math.round(S.sz)+18;
    // THE ROOM HAS TO BE UNDER THE GROUND, AND A FIXED Y IS NOT. Carved at y=44 with the surface at 45 the box's own
    // ceiling is at 48, i.e. OPEN SKY, and every dial in this file then reads inert because the site was never a cave.
    // That cost the first run of this sweep. The depth is taken from the real column and the roof is verified after.
    const GY = await P.evaluate(`__hc.groundY(${CX}, ${CZ})`);
    const CY = Math.max(6, GY - 16);
    await P.evaluate(`(function(){ for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) for(let y=${CY};y<=${CY}+4;y++) __hc.cmdRun('/setblock '+(${CX}+dx)+' '+y+' '+(${CZ}+dz)+' air'); })()`);
    for(let i=0;i<40;i++){ const f=await P.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    // THE ROOF IS CHECKED, NOT ASSUMED. Everything below is a claim about a face with no sky, so if the column above the
    // room has a hole in it there is nothing here to measure and the run should say so rather than print numbers.
    const roof = await P.evaluate(`(function(){ var n=0; for(var y=${CY}+5; y<=${GY}; y++) if(__hc.blockAt(${CX},y,${CZ})!==__hc.bid('air')) n++; return {solid:n, span:${GY}-${CY}-4}; })()`);
    console.log(`  ground ${GY}  room y=${CY}..${CY+4}  roof ${JSON.stringify(roof)}`);

    const cab = await P.evaluate(`(function(){ try{ return __hc.cabinInfo(); }catch(e){ return null; } })()`);
    console.log('  cabin ' + JSON.stringify(cab));

    // A shaded forest spot: walk outward from spawn looking for a column with leaves overhead.
    const shade = await P.evaluate(`(function(){ var L=__hc.bid('leaves'), LC=__hc.bid('leaves_core');
      for(var d=8; d<90; d+=3) for(var a=0;a<16;a++){ var th=a*Math.PI/8;
        var x=Math.round(${S.sx}+Math.cos(th)*d), z=Math.round(${S.sz}+Math.sin(th)*d);
        var g=__hc.groundY(x,z); if(g==null||g.err) continue;
        for(var y=g+2;y<g+14;y++){ var b=__hc.blockAt(x,y,z); if(b===L||b===LC) return {x:x,z:z,g:g,y:y}; } }
      return null; })()`);
    console.log('  shade ' + JSON.stringify(shade));

    const SITES = [];
    SITES.push(['cave',  async()=>{ await P.evaluate(`__hc.tp(${CX-3}, ${CY+1.6}, ${CZ}, 0, 0)`); }]);
    if(shade) SITES.push(['shade', async()=>{ await P.evaluate(`__hc.tp(${shade.x}, ${shade.z})`); await sleep(600); await P.evaluate(`__hc.cam({yaw:0, pitch:-0.75})`); }]);
    // cabinInfo reports cx/cz/gy, not x/y/z — reading the wrong field names silently dropped this whole site on the
    // first run, which is the site that decides whether a zero floor is shippable at all.
    if(cab && cab.cx!=null) SITES.push(['cabin', async()=>{ await P.evaluate(`__hc.tp(${cab.cx}, ${cab.gy+1.7}, ${cab.cz}, 0.7, -0.1)`); }]);

    const SWEEP = [
      ['shipped   floor 0.26 exp 1.15', {floor:0.26, exp:1.15}],
      ['floor 0.12 exp 1.15         ', {floor:0.12, exp:1.15}],
      ['floor 0.00 exp 1.15         ', {floor:0.00, exp:1.15}],
      ['floor 0.00 exp 0.55         ', {floor:0.00, exp:0.55}],
      ['floor 0.00 exp 0.35         ', {floor:0.00, exp:0.35}],
    ];

    for(const [name, go] of SITES){
      console.log(`\n  == ${name} ==`);
      await go(); await sleep(900);
      for(const t of (name==='cave' ? [NOON, NIGHT] : [NOON])){
        await pin(W,t);
        for(const [label,dial] of SWEEP){
          await P.evaluate(`__hc.skyCurve({floor:${dial.floor}, exp:${dial.exp}})`);
          await sleep(200);
          const m = await measure(W, `ds-${name}-${t}-${dial.floor}-${dial.exp}`, t, {c:CROP.centre, f:CROP.frame});
          console.log(`  t=${t} ${label}  centre ${fmt(m.c)}`);
        }
        await P.evaluate(`__hc.skyCurve({floor:0.26, exp:1.15})`);
      }
    }

    // ---- THE SUN-SHADE LEVER, on its own. uDayShade.x is what takes the ambient away where the sun does not reach,
    // which is the only thing that can darken a forest floor (its vSky is 1, so the sky curve above cannot).
    if(shade){
      console.log(`\n  == dayShade, at the shaded site, noon ==`);
      await P.evaluate(`__hc.tp(${shade.x}, ${shade.z})`); await sleep(900);
      await P.evaluate(`__hc.cam({yaw:0, pitch:-0.75})`);
      await pin(W,NOON);
      for(const d of [1.0, 0.6, 0.4, 0.25, 0.1]){
        await P.evaluate(`__hc.dayShade({dark:${d}})`); await sleep(200);
        const m = await measure(W, `ds-shade-day-${d}`, NOON, {c:CROP.centre, g:CROP.ground});
        console.log(`  dark=${d}  centre ${fmt(m.c)}`);
      }
      await P.evaluate(`__hc.dayShade({dark:1.0})`);
    }

    // ...and what the same lever does to OPEN ground at noon, which must not move: nothing about a sunlit field
    // is being asked to change, and if it does the term is not gated on the sun the way it claims to be.
    console.log(`\n  == dayShade, open ground, noon (must not move) ==`);
    await P.evaluate(`__hc.tp(${Math.round(S.sx)}, ${Math.round(S.sz)})`); await sleep(900);
    await P.evaluate(`__hc.cam({yaw:0, pitch:-0.5})`);
    await pin(W,NOON);
    for(const d of [1.0, 0.4, 0.1]){
      await P.evaluate(`__hc.dayShade({dark:${d}})`); await sleep(200);
      const m = await measure(W, `ds-open-${d}`, NOON, {g:CROP.ground});
      console.log(`  dark=${d}  ground ${fmt(m.g)}`);
    }
  } finally { await W.close(); }
})();
