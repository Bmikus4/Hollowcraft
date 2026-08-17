// Water pixels inside the surface's own projected rectangle, against a control patch of the same size.
// argv[2] = rect, argv[3]/[4] = the normal and magenta frames.
import fs from 'node:fs';
import { decodePNG } from './pngprobe.mjs';
const A=process.argv[3]||'bench/results/wellA.png', B=process.argv[4]||'bench/results/wellB.png';
const a=decodePNG(fs.readFileSync(A)), b=decodePNG(fs.readFileSync(B));
const W=a.w||a.width, H=a.h||a.height, R=JSON.parse(process.argv[2]||'[309,96,691,332]');
const count=(x0,y0,x1,y1)=>{ let n=0,t=0;
  for(let y=Math.max(0,y0);y<Math.min(H,y1);y++) for(let x=Math.max(0,x0);x<Math.min(W,x1);x++){ const o=(y*W+x)*4; t++;
    const d=Math.abs(a.data[o]-b.data[o])+Math.abs(a.data[o+1]-b.data[o+1])+Math.abs(a.data[o+2]-b.data[o+2]);
    if(d>60)n++; }
  return [n,t]; };
const [inN,inT]=count(R[0],R[1],R[2],R[3]);
const w=R[2]-R[0], h=R[3]-R[1];
const [cN,cT]=count(4,H-h-4,4+w,H-4);
console.log(A.split('/').pop()+' vs '+B.split('/').pop());
console.log('  inside the water rect :', inN+' / '+inT+'  ('+(100*inN/inT).toFixed(2)+'%)');
console.log('  control patch         :', cN+' / '+cT+'  ('+(100*cN/cT).toFixed(2)+'%)');
