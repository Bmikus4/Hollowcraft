// BEN'S OWN TEST, AND HE IS RIGHT THAT IT SETTLES IT: turn the leaf spawner fully off and count the orange orbs.
// 559fb75 convicted the falling leaves (magenta tag, every speck in a noon sky turned with it) and moved their
// spawn under real canopies; he still sees orbs. If they survive with the batch hidden, that diagnosis was wrong
// or incomplete, and no second explanation should ship without this number.
// EIGHT BEARINGS, TWO HOURS, both conditions interleaved -- one vantage and one bearing is how the last two hunts
// convinced themselves of the wrong thing.
import { spawnSync } from 'node:child_process';
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
const W_=1000, H_=560;
function specks(file){
  const r=spawnSync('ffmpeg',['-loglevel','error','-i',file,'-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:1<<28});
  if(r.status!==0) return -1;
  const buf=r.stdout, w=W_, h=Math.floor(buf.length/3/W_);
  const hits=[];
  // sky only: above the horizon band, right of the HUD, and warm against a low-chroma surround (the detector
  // 559fb75 settled on -- a plain brightness test counts the canopy, a blue-surround test counts nothing).
  for(let y=16; y<Math.floor(h*0.52); y++) for(let x=Math.floor(w*0.30); x<w-10; x++){
    const i=(y*w+x)*3, R=buf[i], G=buf[i+1], B=buf[i+2];
    if(!(R>G && G>B && R-B>40)) continue;
    let sr=0,sg=0,sb=0,n=0;
    for(let dy=-9;dy<=9;dy++) for(let dx=-9;dx<=9;dx++){ if(Math.max(Math.abs(dx),Math.abs(dy))<7) continue;
      const xx=x+dx, yy=y+dy; if(xx<0||yy<0||xx>=w||yy>=h) continue;
      const j=(yy*w+xx)*3; sr+=buf[j]; sg+=buf[j+1]; sb+=buf[j+2]; n++; }
    if(!n) continue; sr/=n; sg/=n; sb/=n;
    if(Math.abs(sr-sb)>34) continue;
    if((R-B)-(sr-sb)>25 && R-sr>6) hits.push([x,y]);
  }
  const dots=[]; for(const [x,y] of hits){ if(!dots.some(d=>Math.abs(d[0]-x)<8 && Math.abs(d[1]-y)<8)) dots.push([x,y]); }
  return dots.length;
}
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)');
    const tot={on:0, off:0}, det={on:[], off:[]};
    for(const t of [0.30, 0.62]){
      for(const on of [true,false]){
        await ev('__hc.leaves('+on+')');
        await ev(`__hc.setTime(${t})`); await sleep(900);
        console.log('  leaves '+(on?'on ':'off')+' t='+t+'  '+JSON.stringify(await ev('__hc.leaves()')).slice(0,60));
        for(let k=0;k<8;k++){
          await ev(`__hc.cam({yaw:${(k*Math.PI/4).toFixed(4)}, pitch:0.05})`); await sleep(500);
          const f=path.join(OUT,'orbs-'+(on?'on':'off')+'-'+t+'-'+k+'.png');
          await W.page.screenshot({path:f});
          const n=specks(f); tot[on?'on':'off']+=n; det[on?'on':'off'].push(n); } } }
    console.log('\n  sky specks with the leaf batch ON  '+tot.on+'   per bearing '+JSON.stringify(det.on));
    console.log('  sky specks with the leaf batch OFF '+tot.off+'   per bearing '+JSON.stringify(det.off));
    console.log(tot.off>0 ? '  THE ORBS SURVIVE THE LEAVES BEING OFF -- the leaf diagnosis is not the whole fault.'
                          : '  Zero with the leaves off: everything the detector sees in the sky is the leaf batch.');
  } finally { await W.close(); } })();
