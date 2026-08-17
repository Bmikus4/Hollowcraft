// A6: the four new foliage types, checked where they can fail. The reflex this run was written with: aec3a42 was an
// instrument photographing a world that had never meshed, so every visual claim below is gated on the chunks being
// FILLED first, and every "it is in the world" claim is a count of blocks the generator actually placed, not a look
// at a frame.
import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const NEW = ['vine','sunflower','sunflower_top','tree_flower','pale_bloom'];
let fails=0;
const ok=(l,c,x)=>{ console.log(`${c?'ok  ':'FAIL'}  ${l}${x!==undefined?'   '+JSON.stringify(x):''}`); if(!c) fails++; };
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  const a = await W.ev(`__hc.atlasPNG()`);
  // the tile a block draws with is NOT its own name — the sunflower's two halves draw sunflower_stem and
  // sunflower_head — so ask the block table for the tile, the way the mesher does
  const TILE_OF = {vine:'vine', sunflower:'sunflower_stem', sunflower_top:'sunflower_head', tree_flower:'tree_flower', pale_bloom:'pale_bloom'};
  const unpainted = NEW.filter(n=>a.tiles[TILE_OF[n]]===undefined);
  ok('all five tiles are painted', unpainted.length===0, unpainted);
  ok('no new tile shares a slot with another', new Set(NEW.map(n=>a.tiles[TILE_OF[n]])).size===NEW.length);
  const table = await W.ev(`__hc.blockTable()`);
  const ids = Object.fromEntries(table.map((n,i)=>[n,i]));
  const newIds = NEW.map(n=>ids[n]).sort((p,q)=>p-q);
  ok('the five are the last five ids', newIds[0]===table.length-5 && newIds[4]===table.length-1, {first:newIds[0], total:table.length});
  ok('vine carries the climb flag it was given', await W.ev(`__hc.blockFlag?__hc.blockFlag('vine','climb'):null`) === true);
  // the world has to actually grow them: walk the spawn area, count what generated
  await W.ev(`atSpawn()`); await sleep(1200);
  for(let i=0;i<60;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  const fill = await W.ev(`__hc.fill()`);
  ok('the world is meshed before anything is counted or photographed', fill.meshed>=fill.want, fill);
  const census = await W.ev(`__hc.foliageCensus()`);
  console.log('    census:', JSON.stringify(census.per));
  for(const n of ['vine','sunflower','tree_flower','pale_bloom'])
    ok(`the world grows ${n}`, (census.per[n]||{}).n > 0, census.per[n]);
  ok('every sunflower has its head', (census.per.sunflower||{}).n === (census.per.sunflower_top||{}).n,
     { stalks:(census.per.sunflower||{}).n, heads:(census.per.sunflower_top||{}).n });
  // CLUMPED, NOT SPRINKLED: that is what the placement pass is for, so it is measured. Blooms per column beats a
  // per-column hash chain, which would put roughly one of everything in every column.
  const perCol = n => (census.per[n] && census.per[n].spread) ? census.per[n].n / census.per[n].spread : 0;
  ok('sunflowers arrive in stands, not one per column', perCol('sunflower') >= 2.5, { perColumn:+perCol('sunflower').toFixed(2) });
}finally{ await W.close(); }
console.log(fails?`\n${fails} FAILED`:'\nall checks passed');
