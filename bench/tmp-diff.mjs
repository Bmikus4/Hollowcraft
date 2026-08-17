// Count the pixels the water is actually drawn on, INSIDE its own projected rectangle, by diffing a normal frame
// against one with every water fragment forced magenta. Guessing the rectangle is what let film grain look like a
// finding; __hc.wellRect projects the surface's own world corners through the live camera.
import fs from 'node:fs';
import { decodePNG } from './pngprobe.mjs';
const a=decodePNG(fs.readFileSync('bench/results/wellA.png'));
const b=decodePNG(fs.readFileSync('bench/results/wellB.png'));
const W=a.w||a.width, H=a.h||a.height;
const R=JSON.parse(process.argv[2]||'[309,96,691,332]');
const count=(x0,y0,x1,y1)=>{ let n=0,t=0;
  for(let y=Math.max(0,y0);y<Math.min(H,y1);y++) for(let x=Math.max(0,x0);x<Math.min(W,x1);x++){ const o=(y*W+x)*4; t++;
    const d=Math.abs(a.data[o]-b.data[o])+Math.abs(a.data[o+1]-b.data[o+1])+Math.abs(a.data[o+2]-b.data[o+2]);
    if(d>60)n++; }
  return [n,t]; };
const [inN,inT]=count(R[0],R[1],R[2],R[3]);
// The control: the same-sized patch of sky/ground well away from the shaft. If THAT reads a similar rate, the
// measurement is grain and not water.
const w=R[2]-R[0], h=R[3]-R[1];
const [ctlN,ctlT]=count(4,H-h-4,4+w,H-4);
console.log('inside the water rect :', inN+' / '+inT+'  ('+(100*inN/inT).toFixed(2)+'%)');
console.log('control patch         :', ctlN+' / '+ctlT+'  ('+(100*ctlN/ctlT).toFixed(2)+'%)');
