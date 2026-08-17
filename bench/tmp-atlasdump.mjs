// Dump the painted atlas and its name->slot table to disk. Everything the block pass needs on OUR side comes from
// here: there are no texture files to read, the tiles exist only as pixels the painter drew at boot.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import fs from 'node:fs'; import path from 'node:path';
const W = await openWorld({ rd:6, quality:'High', w:640, h:360 });
try{
  const a = await W.ev(`__hc.atlasPNG()`);
  if(a.err) throw new Error(a.err);
  const b64 = a.png.split(',')[1];
  fs.writeFileSync(path.join(OUT,'atlas.png'), Buffer.from(b64,'base64'));
  fs.writeFileSync(path.join(OUT,'atlas-tiles.json'), JSON.stringify({tiles:a.tiles, atlasTiles:a.atlasTiles, tilePx:a.tilePx}, null, 1));
  console.log('tiles:', Object.keys(a.tiles).length, ' atlas', a.atlasTiles+'x'+a.atlasTiles, 'of', a.tilePx+'px');
}finally{ await W.close(); }
