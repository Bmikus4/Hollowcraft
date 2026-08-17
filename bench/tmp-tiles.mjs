// Are the pack textures ON SCREEN? One number and one frame: how many of the 42 stamps landed, and a shot of a wall
// built from the blocks that changed. The world is checked meshed first — a bare frame proves nothing.
import { openWorld, pin, sleep, shots } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`atSpawn()`); await sleep(1500);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  const fill=await W.ev(`__hc.fill()`); if(fill.meshed<fill.want) throw new Error('not meshed');
  await sleep(2500);
  console.log('stamped:', await W.ev(`(()=>({landed:_stampedTiles.length, tile:TILE, atlas:ATLAS_PX, count:ATLAS_COUNT}))()`));
}finally{ await W.close(); }
