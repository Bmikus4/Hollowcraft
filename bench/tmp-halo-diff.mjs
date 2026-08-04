// Did the halo change ANY pixel? Toggle-and-difference, because a crop around a projected position is a guess about where
// the sprite landed and a whole-frame difference is not.
import fs from 'node:fs'; import { decodePNG } from './pngprobe.mjs';
for(const d of process.argv.slice(2)){
  const A=decodePNG(fs.readFileSync(`bench/results/reach-d${d}-off0.75.png`));
  const B=decodePNG(fs.readFileSync(`bench/results/reach-d${d}-on0.75.png`));
  let mx=0, at=null, sum=0, n=0;
  for(let y=0;y<A.h;y++) for(let x=0;x<A.w;x++){ const i=(y*A.w+x)*A.ch;
    const df=Math.abs(A.data[i]-B.data[i])+Math.abs(A.data[i+1]-B.data[i+1])+Math.abs(A.data[i+2]-B.data[i+2]);
    sum+=df; if(df>3)n++; if(df>mx){ mx=df; at=[x,y]; } }
  console.log(`${d} blocks: max diff ${mx} at ${JSON.stringify(at)}, pixels>3 ${n}, total ${sum}`);
}
