// MEASURE the night-sky lines. A contour line is a step in an otherwise smooth gradient, so scan a column of sky and print
// the per-row luminance DELTA: a smooth gradient steps by 0 or 1 with the sign wandering, a contour steps by several levels in
// one row and does it repeatedly. Also counts how many rows are darker than BOTH their neighbours by >=2 levels — a dark line
// crossing the column is exactly that, and it is a number, not an impression.
//   node bench/tmp-nightsky-scan.mjs bench/results/nsky-mblur.png [x0frac] [x1frac] [y0frac] [y1frac]
import fs from 'node:fs';
import { decodePNG } from './pngprobe.mjs';
const f=process.argv[2]||'bench/results/nsky-mblur.png';
const x0f=+(process.argv[3]||0.60), x1f=+(process.argv[4]||0.72), y0f=+(process.argv[5]||0.05), y1f=+(process.argv[6]||0.45);
const img=decodePNG(fs.readFileSync(f));
const {w,h,ch,data}=img;
const x0=Math.round(w*x0f), x1=Math.round(w*x1f), y0=Math.round(h*y0f), y1=Math.round(h*y1f);
const lum=[];
for(let y=y0;y<y1;y++){ let s=0,n=0;
  for(let x=x0;x<x1;x++){ const i=(y*w+x)*ch; s+=0.2126*data[i]+0.7152*data[i+1]+0.0722*data[i+2]; n++; }
  lum.push(s/n); }
// Averaging across the column kills the film grain (uncorrelated per pixel) while a horizontal LINE survives it, which is why
// the scan is a band average and not a single pixel column.
let big=0, dips=0, sum=0;
const deltas=[];
for(let i=1;i<lum.length;i++){ const d=lum[i]-lum[i-1]; deltas.push(d); sum+=Math.abs(d); if(Math.abs(d)>=1.5) big++; }
for(let i=1;i<lum.length-1;i++){ if(lum[i]<=lum[i-1]-1.2 && lum[i]<=lum[i+1]-1.2) dips++; }
const span=Math.max(...lum)-Math.min(...lum);
console.log(f);
console.log('  rows '+lum.length+'  band x '+x0+'-'+x1+'  luma '+lum[0].toFixed(1)+' -> '+lum[lum.length-1].toFixed(1)+'  span '+span.toFixed(1));
console.log('  mean |step| '+(sum/deltas.length).toFixed(3)+'   steps >=1.5 levels: '+big+'   dark dips (row darker than both sides by >=1.2): '+dips);
console.log('  profile: '+lum.map(v=>Math.round(v)).join(' '));
