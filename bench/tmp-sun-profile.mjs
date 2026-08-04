// THE SUN'S RADIAL PROFILE. "Too bright" and "a halo" are both statements about how luminance falls off with angle from
// the disc centre, so print that curve instead of looking at a 70-pixel blob. Centre is found as the brightest pixel.
import fs from 'node:fs'; import path from 'node:path';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
for(const f of process.argv.slice(2)){
  const P=decodePNG(fs.readFileSync(path.join(ROOT,'bench','results',f)));
  // Search only the upper-middle of the frame: the compass, hotbar and held item are static bright objects that would
  // otherwise win the "brightest pixel" search (plan §7's crop trap).
  let bx=0,by=0,bl=-1;
  for(let y=(P.h*0.10)|0;y<(P.h*0.60)|0;y++) for(let x=(P.w*0.20)|0;x<(P.w*0.80)|0;x++){ const L=lum(P.data,(y*P.w+x)*P.ch); if(L>bl){bl=L;bx=x;by=y;} }
  const bins=new Array(28).fill(0), n=new Array(28).fill(0);
  for(let y=0;y<P.h;y++) for(let x=0;x<P.w;x++){
    const r=Math.hypot(x-bx,y-by)/4|0; if(r<28){ bins[r]+=lum(P.data,(y*P.w+x)*P.ch); n[r]++; } }
  const prof=bins.map((s,i)=>n[i]?+(s/n[i]).toFixed(1):0);
  const peak=Math.max(...prof), core=prof[0];
  console.log(`${f}  centre ${bx},${by} peak px ${bl.toFixed(0)}`);
  console.log('  r(px):  '+prof.map((v,i)=>String(i*4).padStart(5)).join(''));
  console.log('  lum:    '+prof.map(v=>String(v.toFixed(0)).padStart(5)).join(''));
  console.log(`  core ${core}  brightest ring at r=${prof.indexOf(peak)*4}px (${peak})  falls to half of core at r=${(prof.findIndex(v=>v<core*0.5)*4)}px\n`);
}
