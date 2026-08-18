// The trailhead end of a path: how wide the dirt is along the last blocks of a leaf segment, and whether
// the 4.5-block clearing disc is still paved.
import { openWorld, sleep } from './lib/rig.mjs';
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2000);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    const P=await ev('__hc.probe()');
    // th2 = spawn+(22,58), a leaf; jn = spawn+(34,34). Walk from the leaf toward the junction and count the
    // dirt columns across the corridor at each step.
    const out=await ev(`(()=>{ const sx=${P.spawnX}, sz=${P.spawnZ}, D=__hc.bid('dirt');
      const a={x:sx+22,z:sz+58}, b={x:sx+34,z:sz+34};
      const ux=(b.x-a.x), uz=(b.z-a.z), L=Math.hypot(ux,uz), nx=-uz/L, nz=ux/L;
      const rows=[];
      for(let t=0;t<=14;t++){ const cx=a.x+ux*t/L, cz=a.z+uz*t/L; let w=0, paved=[];
        for(let o=-5;o<=5;o++){ const x=Math.round(cx+nx*o), z=Math.round(cz+nz*o), h=__hc.surfH(x,z);
          const isD=__hc.blockAt(x,h,z)===D; if(isD) w++; paved.push(isD?'#':'.'); }
        rows.push({ from:t, wide:w, row:paved.join('') }); }
      return rows; })()`);
    for(const r of out) console.log('  '+String(r.from).padStart(2)+'  '+r.row+'   '+r.wide);
  } finally { await W.close(); } })();
