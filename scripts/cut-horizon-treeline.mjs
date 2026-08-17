// BEN'S TREELINE, MADE INTO A STRIP THE HORIZON CAN WEAR. He gave a photographic pine stand receding to a point and said
// "Clear the existing horizon pines, and use this instead". The horizon is a cylinder painted per azimuth, so what it needs
// is a strip that WRAPS — and his picture, wrapped as given, is a sawtooth: a full stand, then nothing, then a full stand.
//
// WHAT IS DELIBERATELY NOT TAKEN: the wedge. The left two thirds of his image are the run tapering away to a point, and the
// horizon shader already owns that — `endT` sinks the ground line and the canopy together as a run of coast ends, which is
// the behaviour Ben asked for and approved. Importing the wedge as well would apply the taper twice and make its period
// visible. So the DENSE stand is what is cut out, and the recession stays where it already works.
//
// SEAMLESS BY CONSTRUCTION, not by luck: the strip is the crop followed by its own mirror, so the two ends of the wrapped
// texture are the same column. A treeline has no handedness, so the mirror is invisible; hand-matching a photographic crop
// is not, and it is the thing that would show as a repeating notch.
//
//   node scripts/cut-horizon-treeline.mjs   → assets/horizon/treeline.png (2048x256, straight alpha)
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
const SRC='C:/Users/thera/Desktop/92e3463c-0e62-42d3-9ac7-b594b9a6e944.png';
const OUT='D:/Code/Minecraft/assets/horizon';
// Measured off the source (2172x724): the stand reaches full height by x 1200 and runs to the right edge, and the canopy
// occupies y 18..640 there. Cropping tighter than the trees would clip crowns; looser would bake empty sky into the strip
// and lift the whole treeline off the horizon line, which is the fault Ben named — "they extend well out into the sky".
const X0=1200, X1=2172, Y0=18, Y1=648;
const HALF=1024, H=256;
fs.mkdirSync(OUT,{recursive:true});
const f=path.join(OUT,'treeline.png');
const vf=`crop=${X1-X0}:${Y1-Y0}:${X0}:${Y0},scale=${HALF}:${H}:flags=lanczos,format=rgba,split[a][b];[b]hflip[c];[a][c]hstack=inputs=2`;
const r=spawnSync('ffmpeg',['-y','-loglevel','error','-i',SRC,'-filter_complex',vf,'-frames:v','1',f],{stdio:'inherit'});
if(r.status!==0){ console.error('FAILED'); process.exit(1); }
console.log('  '+(HALF*2)+'x'+H+'  from x '+X0+'..'+X1+', y '+Y0+'..'+Y1+'   '+f);
