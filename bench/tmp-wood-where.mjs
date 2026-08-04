// WHERE the woody band's pixels are, by row: the band-on frame minus the band-off frame.
import fs from 'node:fs'; import path from 'node:path';
import { decodePNG } from './pngprobe.mjs';
const R=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..','bench','results');
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
const A=decodePNG(fs.readFileSync(path.join(R,process.argv[2]))), B=decodePNG(fs.readFileSync(path.join(R,process.argv[3])));
const rows=new Array(A.h).fill(0); let tot=0;
for(let y=0;y<A.h;y++) for(let x=0;x<A.w;x++){ const i=(y*A.w+x)*A.ch;
  if(Math.abs(lum(A.data,i)-lum(B.data,i))>3){ rows[y]++; tot++; } }
console.log('total differing px:',tot);
const hot=rows.map((v,y)=>[y,v]).filter(r=>r[1]>0);
console.log('rows with any difference:',hot.length,' first',hot[0]&&hot[0][0],' last',hot[hot.length-1]&&hot[hot.length-1][0]);
for(const [y,v] of hot.slice(0,40)) console.log('  row',y,'px',v);
