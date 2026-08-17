// A FILM TEXTURE SET, CUT DOWN TO A BROWSER. The fox girl ships 860 MB of maps — body_normal.png alone is 277 MB, which is
// 16K — and every byte of that has to cross the wire before anyone sees her. At gameplay distance a character occupies a few
// hundred pixels of frame; the difference between a 16K and a 2K normal map on her is invisible and the difference in load
// time and VRAM is not.
//
// Ben's "128 is neccesary" ruling was about BLOCKS, which tile across a whole world and are read at arm's length. It does not
// carry to one character, and this is the distinction that decides the number.
//
// WHAT WAS CHOSEN: body 2048 (she is the thing you look at, and the skin carries the detail), everything else 1024 — hair,
// eyes, lashes and teeth are small in frame and half of them are alpha cutouts where resolution buys nothing.
// FORMAT: PNG only where alpha is load-bearing (the hair and lash cutouts), JPEG at q3 everywhere else. A normal map in JPEG
// is a real compromise and it is taken deliberately: chroma subsampling costs a little precision in the normal's x and y, and
// what it buys is a set that fits in a few megabytes instead of hundreds.
//
//   node scripts/cut-character-textures.mjs   → assets/characters/foxgirl/<map>.jpg|png
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
const SRC='D:/Code/Minecraft/.work/foxgirl/tex';
const OUT='D:/Code/Minecraft/assets/characters/foxgirl';
// name in the archive            out name        px    alpha matters
const MAPS=[
  ['body_basecolor.png',          'body_color',   2048, false],
  ['body_normal.png',             'body_normal',  2048, false],
  ['body_roughness.png',          'body_rough',   2048, false],
  ['body_specular.png',           'body_spec',    2048, false],
  ['hair3_basecolor_opacity.png', 'hair_color',   1024, true ],   // opacity IS the hair, so this one keeps its alpha
  ['hair3_Normal.png',            'hair_normal',  1024, false],
  ['hair3_roughness.png',         'hair_rough',   1024, false],
  ['Eye_BaseColor.png',           'eye_color',    1024, false],
  ['eyelashes_basecolor_opacity.png','lash_color',1024, true ],   // and so is this
  ['eyelashes_normal.png',        'lash_normal',  1024, false],
  ['teeth_basecolor.png',         'teeth_color',  1024, false],
  ['teeth_normal.png',            'teeth_normal', 1024, false],
  ['teeth_roughness.png',         'teeth_rough',  1024, false],
];
fs.mkdirSync(OUT,{recursive:true});
let before=0, after=0;
for(const [src,name,px,alpha] of MAPS){
  const inF=path.join(SRC,src);
  if(!fs.existsSync(inF)){ console.log('  MISSING '+src); continue; }
  const outF=path.join(OUT, name+(alpha?'.png':'.jpg'));
  const vf=`scale=${px}:${px}:flags=lanczos`;
  const args=alpha
    ? ['-y','-loglevel','error','-i',inF,'-vf',vf,'-frames:v','1',outF]
    : ['-y','-loglevel','error','-i',inF,'-vf',vf,'-frames:v','1','-q:v','3',outF];
  const r=spawnSync('ffmpeg',args,{stdio:'inherit'});
  if(r.status!==0){ console.error('FAILED '+src); process.exit(1); }
  const a=fs.statSync(inF).size, b=fs.statSync(outF).size;
  before+=a; after+=b;
  console.log('  '+name.padEnd(14)+String(px).padStart(5)+'  '+(a/1048576).toFixed(1).padStart(7)+' MB -> '+(b/1048576).toFixed(2).padStart(6)+' MB   '+path.basename(outF));
}
console.log('\n  set: '+(before/1048576).toFixed(0)+' MB -> '+(after/1048576).toFixed(1)+' MB  ('+(before/after).toFixed(0)+'x)');
