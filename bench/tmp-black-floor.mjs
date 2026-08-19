// IS 6 OF 255 THE WALL, OR IS IT THE GAME'S BLACK?
//
// Every candidate that could put day-scaled light on a sealed room's wall has now been measured inert at that
// vantage, each interleaved with its baseline repeated last, noise floor 0.05:
//   viewmodel 1.27 at BOTH hours · base level 0/0.10/0.15 identical · sky curve exp 0.55->3.0 closes 0% ·
//   corner smoothing closes 1% (so vSky is a hard zero) · scene.fog gap 4.22 far vs 4.25 near ·
//   pitch level/down/up identical · godrays on == off · height fog is not in the chain · there is no env map.
//
// The reported shape was the clue and it was in every row from the start: min 6, p10 6, med 6.07, pure black 0%,
// near-black 100%. NOTHING in the frame is at zero. The whole frame sits on 6 by day and 2 at night, which is
// not a wall being lit — it is the floor of what this renderer outputs.
//
// So put the camera INSIDE SOLID ROCK, where there is no surface, no sky, no fog volume and nothing drawn at all,
// and read the same crop. If it still reads 6 by day and 2 at night, then the guards' "a sealed room reads the
// same at noon as at midnight" is not measuring the room: it is measuring the renderer's black, and the fix is in
// the post chain rather than anywhere in the lighting model.
//
//   node bench/tmp-black-floor.mjs
import { openWorld, pin, measure, CROP, fmt, sleep } from './lib/rig.mjs';

const NOON=0.25, NIGHT=0.75;

async function carveRoom(P, CX, CZ){
  const GY = await P.evaluate(`__hc.groundY(${CX}, ${CZ})`);
  const CY = Math.max(6, GY - 16);
  await P.evaluate(`(function(){ for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) for(let y=${CY};y<=${CY}+4;y++) __hc.cmdRun('/setblock '+(${CX}+dx)+' '+y+' '+(${CZ}+dz)+' air'); })()`);
  for(let i=0;i<40;i++){ const f=await P.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
  const roof = await P.evaluate(`(function(){ var n=0,a=__hc.bid('air'); for(var y=${CY}+5; y<=${GY}; y++) if(__hc.blockAt(${CX},y,${CZ})!==a) n++; return n; })()`);
  return { CY, GY, roof };
}

(async()=>{
  const W = await openWorld({ rd:8 });
  const P = W.page;
  try{
    const S = await P.evaluate(`__hc.st()`);
    const CX = Math.round(S.sx)+18, CZ = Math.round(S.sz)+18;
    const R = await carveRoom(P, CX, CZ);
    await P.evaluate(`__hc.cinematic(true)`); await sleep(600);
    const YAW = Math.atan2(-1, 0);

    // Six blocks BELOW the carved room's floor is untouched stone: the room was carved at CY..CY+4, so CY-6 has
    // never been written to. Verified rather than assumed — a "solid" vantage that is actually air measures the
    // room again and would agree with it for the wrong reason.
    const solidY = R.CY-6;
    const solid = await P.evaluate(`(function(){ var a=__hc.bid('air'); return { id:__hc.blockAt(${CX},${solidY},${CZ}), air:a }; })()`);
    console.log(`  solid vantage at y ${solidY}: blockAt ${solid.id} (air is ${solid.air}) — ${solid.id!==solid.air?'genuinely inside rock':'NOT SOLID, this run is void'}`);

    const rows=[];
    async function row(tag, t, y){
      await P.evaluate(`__hc.tp(${CX}, ${y}, ${CZ}, ${YAW}, 0)`); await sleep(500);
      await pin(W, t);
      const m = await measure(W, `blackfloor-${tag.replace(/[^a-z0-9]+/gi,'-')}`, t, { c:CROP.centre, f:CROP.frame });
      rows.push({ tag, lum:m.c.lum, fl:m.f.lum, blk:m.c.blackPct });
      console.log(`  ${tag.padEnd(22)} centre ${fmt(m.c)}`);
    }

    await row('noon  in the room',  NOON,  R.CY+1.6);
    await row('noon  inside rock',  NOON,  solidY);
    await row('night in the room',  NIGHT, R.CY+1.6);
    await row('night inside rock',  NIGHT, solidY);
    await row('noon  in the room (again)', NOON, R.CY+1.6);

    const L=t=>{ const r=rows.find(r=>r.tag===t); return r?r.lum:NaN; };
    console.log('');
    console.log(`  noise floor      room noon ${L('noon  in the room')} then ${L('noon  in the room (again)')}`);
    console.log(`  in the room      noon ${L('noon  in the room')} vs night ${L('night in the room')}   delta ${(L('noon  in the room')-L('night in the room')).toFixed(2)}`);
    console.log(`  inside solid rock noon ${L('noon  inside rock')} vs night ${L('night inside rock')}   delta ${(L('noon  inside rock')-L('night inside rock')).toFixed(2)}`);
    console.log('');
    console.log('  Equal deltas mean the sealed room never knew the hour — the renderer\'s black does.');
  } finally { await W.close(); }
})();
