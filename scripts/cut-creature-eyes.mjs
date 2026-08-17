// CUT BEN'S EYE INTO FOUR. Ben gave one macro photograph of a red iris and said: "they need cut into circles only use
// iris+pupil". So the sclera, the lids, the skin and the veins all go — what survives is the iris disc and its pupil, on a
// transparent background, which is the only part a creature with no whites of its eyes can wear.
//
// FOUR, NOT ONE, because they are a family: same photograph, different treatment, so the pair you meet in the dark reads as
// related to the pair you met yesterday without being the same eye. What varies is what an eye actually varies by — how much
// blood is in the iris, how bright it is, and how wide the pupil is opened. Pupil width is the one that carries meaning:
// blown wide is an animal in the dark straining to see, pinned shut is one that does not need to.
//
// The source circle was measured off the photograph, not guessed: the iris spans x 100..1190 and y 105..1195 in a 1254 px
// square, so its centre is (645,650) and its radius 545. Crop to that square and every pixel outside the disc is skin.
//
//   node scripts/cut-creature-eyes.mjs   → assets/creature-eyes/eye-<kind>.png (512², straight alpha)
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
const SRC='C:/Users/thera/Desktop/14429579-87b9-4f31-8ab7-21303c3d690c.png';
const OUT='D:/Code/Minecraft/assets/creature-eyes';
const CX=645, CY=650, R=545, N=512;
const C=N/2;
// EDGE 4 px, NOT HARD. A hard alpha edge on a 512 texture minified onto a 30 px eye aliases into a ragged ring, and a ragged
// ring is the one thing that makes a photographic eye read as a decal stuck on a box.
const EDGE=4, RIM=C-3;
const KINDS=[
  // kind        grade (colour, before masking)                                   pupil px   why
  ['wretch',    'eq=saturation=1.05:contrast=1.06',                                62],   // the parent: the photograph as given, barely touched
  ['meek',      'hue=h=8:s=0.42,eq=brightness=0.07:contrast=1.02',                 96],   // blown wide and drained — the one that listens for you in the dark
  ['burrower',  'hue=h=20:s=0.85,eq=brightness=-0.13:contrast=1.18',               34],   // earth-amber and pinned shut: it hunts through soil and barely uses these
  ['tenant',    'hue=s=0.14,eq=brightness=-0.06:contrast=1.34',                   118],   // almost colourless, almost all pupil — stillness, and nothing behind it
];
fs.mkdirSync(OUT,{recursive:true});
for(const [kind,grade,pup] of KINDS){
  const f=path.join(OUT,'eye-'+kind+'.png');
  const vf=[
    `crop=${R*2}:${R*2}:${CX-R}:${CY-R}`,
    `scale=${N}:${N}:flags=lanczos`,
    grade,
    'format=rgba',
    // One geq does both jobs: force the pupil to true black, and cut the disc out of the square. Two passes would resample
    // the alpha a second time and soften the rim that EDGE exists to control.
    `geq=r='r(X,Y)*(1-clip((${pup}-hypot(X-${C},Y-${C}))/2,0,1))':`
    +`g='g(X,Y)*(1-clip((${pup}-hypot(X-${C},Y-${C}))/2,0,1))':`
    +`b='b(X,Y)*(1-clip((${pup}-hypot(X-${C},Y-${C}))/2,0,1))':`
    +`a='clip(255*(${RIM}-hypot(X-${C},Y-${C}))/${EDGE},0,255)'`,
  ].join(',');
  const r=spawnSync('ffmpeg',['-y','-loglevel','error','-i',SRC,'-vf',vf,'-frames:v','1',f],{stdio:'inherit'});
  if(r.status!==0){ console.error('FAILED '+kind); process.exit(1); }
  console.log('  '+kind.padEnd(9)+'pupil '+String(pup).padStart(3)+' px of '+RIM+'   '+f);
}
