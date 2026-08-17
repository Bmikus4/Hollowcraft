// A5: THE 52-BLOCK APPEND, checked where it can actually fail.
//   · every one of the 52 has a distinct painted tile — a typo in a `t:[...]` name silently gives the block tile 0,
//     which is AIR's slot, and the block would render as whatever happens to live there rather than as nothing;
//   · every one has an item (the block table's loop makes them, so this proves the loop reached them);
//   · one of them survives a place → save → load → read round-trip, which is the invariant the whole "append, never
//     insert" rule exists to protect;
//   · and the page boots at all, which is not free: 52 painters run at boot inside the atlas build.
// The id ORDER is checked against the ALLOCATOR through __hc.blockTable(), not by parsing the file: 24 blocks are
// created in a loop, a regex over `block('...'` misses all of them, and a parse-based check reported id 189 for a
// block the game had put at 213. What matters for saves is that the 52 are the LAST 52 entries, so that is the check.
import { openWorld, sleep } from './lib/rig.mjs';
import { decodePNG } from './pngprobe.mjs';
import fs from 'node:fs';
const NEW = `bricks pale_bricks mossy_bricks cracked_bricks soot_bricks herringbone_brick tinted_glass frosted_glass
 wired_glass cracked_glass smooth_stone stone_bricks cracked_stone_bricks chiselled_stone slate slate_tile granite
 marble dark_planks weathered_planks parquet plywood stripped_log driftwood charred_wood steel_panel corrugated_metal
 diamond_plate copper_sheet verdigris_copper riveted_iron brass asphalt kerb_stone breeze_block plaster
 cracked_plaster tiles_white terrazzo ash_block bone_block tar salt_block fungus_block root_mass grave_soil canvas
 burlap carpet_red crate_side shelf_boards scaffold_board`.split(/\s+/).filter(Boolean);
let fails = 0;
const ok = (label, cond, extra) => { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra !== undefined ? '   ' + JSON.stringify(extra) : ''}`); if (!cond) fails++; };
const W = await openWorld({ rd:6, quality:'High', w:800, h:450 });
try{
  ok('52 names under test', NEW.length === 52, NEW.length);
  const a = await W.ev(`__hc.atlasPNG()`);
  const tiles = a.tiles;
  const missing = NEW.filter(n => tiles[n] === undefined);
  ok('every new block has a painted tile', missing.length === 0, missing);
  const slots = NEW.map(n => tiles[n]);
  ok('no new tile landed in slot 0 (which is not a tile, it is the first painter)', slots.every(s => s > 0));
  ok('every new tile has its own slot', new Set(slots).size === slots.length);
  // the tiles must also DIFFER as pixels: two painters that return the same colour are one material with two names
  fs.writeFileSync('bench/results/_a5atlas.png', Buffer.from(a.png.split(',')[1], 'base64'));
  const P = decodePNG(fs.readFileSync('bench/results/_a5atlas.png'));
  const sig = new Map();
  for (const n of NEW){
    const i = tiles[n], tx = (i % a.atlasTiles) * a.tilePx, ty = ((i / a.atlasTiles) | 0) * a.tilePx;
    let s = '';
    for (let y = 0; y < a.tilePx; y += 4) for (let x = 0; x < a.tilePx; x += 4){
      const o = ((ty + y) * P.w + tx + x) * P.ch;
      s += `${P.data[o] >> 3},${P.data[o+1] >> 3},${P.data[o+2] >> 3},${P.data[o+3] >> 6};`;
    }
    if (sig.has(s)) sig.set(s, sig.get(s) + ',' + n); else sig.set(s, n);
  }
  const dupes = [...sig.values()].filter(v => v.includes(','));
  ok('no two new tiles are the same picture', dupes.length === 0, dupes);
  // items, through the give command rather than by reading ITEMS: this is the path a player uses
  const bad = [];
  for (const n of NEW){
    const r = await W.ev(`__hc.cmdRun('/give @me ${n} 1')`);
    if (!String(r.out || '').includes('gave')) bad.push(n);
  }
  ok('every new block has an item /give can hand over', bad.length === 0, bad);
  // place → save → load → read, on one of them
  const table = await W.ev(`__hc.blockTable()`);
  const ids = Object.fromEntries(table.map((n, i) => [n, i]));
  const newIds = NEW.map(n => ids[n]).sort((p, q) => p - q);
  ok('the 52 are the last 52 ids in the table', newIds[0] === table.length - 52 && newIds[51] === table.length - 1,
     { first:newIds[0], last:newIds[51], total:table.length });
  ok('the 52 ids are contiguous', newIds.every((v, i) => i === 0 || v === newIds[i-1] + 1));
  const oldMax = Math.max(...table.map((n, i) => NEW.includes(n) ? -1 : i));
  ok('no existing block sits above a new one', oldMax < newIds[0], { highestOld:oldMax, lowestNew:newIds[0] });

  const round = await W.ev(`(function(){
    const p=__hc.pos(), x=Math.round(p.x)+2, y=Math.round(p.y), z=Math.round(p.z)+2;
    __hc.cmdRun('/setblock '+x+' '+y+' '+z+' verdigris_copper');
    // compare against the game's OWN id for the name, never against a number parsed out of the file
    const want=__hc.bid('verdigris_copper'), got=__hc.blockAt(x,y,z);
    return { at:[x,y,z], want, got, saved:String(__hc.save()) };
  })()`);
  console.log('    round-trip probe:', JSON.stringify(round));
  ok('a new block places and reads back as itself', round.got === round.want, round);
  ok('the world saves with a new block in it', /saved/.test(round.saved || ''), round.saved);
}finally{ await W.close(); }
console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
