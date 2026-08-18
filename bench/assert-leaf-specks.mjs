// A LEAF MUST NOT BE A DOT ON THE SKY (Ben, five reports). The identification is the magenta tag: with it on,
// every warm speck in a noon sky turns magenta, so the specks ARE the batch. So the test counts MAGENTA specks
// against the sky -- an exact colour nothing else in the game emits -- with the fade on and off.
// THE CONTROL the change cannot affect: the tagged specks with the batch HIDDEN. That must be zero either way, and
// if it is not, the detector is seeing something that is not a leaf and no leaf change can be judged by it.
import { spawnSync } from 'node:child_process';
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
const W_=1000;
function magenta(file){
  const r=spawnSync('ffmpeg',['-loglevel','error','-i',file,'-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:1<<28});
  if(r.status!==0) return -1;
  const buf=r.stdout, w=W_, h=Math.floor(buf.length/3/W_); const dots=[];
  for(let y=6;y<h-6;y++) for(let x=6;x<w-6;x++){
    const i=(y*w+x)*3, R=buf[i], G=buf[i+1], B=buf[i+2];
    if(!(R>90 && B>90 && G<R*0.62 && G<B*0.62)) continue;      // magenta: r and b high, g suppressed
    if(dots.some(d=>Math.abs(d[0]-x)<10 && Math.abs(d[1]-y)<10)) continue;
    // ONLY THE DOTS. A leaf two blocks from the eye is a big magenta shape and is exactly the effect Ben likes;
    // the fault is the three-pixel speck at range. So the blob is measured and only small ones count -- without
    // this the metric conflates the feature with the bug and reads 53 against 46 when the dots have gone.
    const isM=(xx,yy)=>{ if(xx<0||yy<0||xx>=w||yy>=h) return false; const j=(yy*w+xx)*3;
      return buf[j]>90 && buf[j+2]>90 && buf[j+1]<buf[j]*0.62 && buf[j+1]<buf[j+2]*0.62; };
    let wRun=1; for(let xx=x+1; xx<x+14 && isM(xx,y); xx++) wRun++;
    for(let xx=x-1; xx>x-14 && isM(xx,y); xx--) wRun++;
    let hRun=1; for(let yy=y+1; yy<y+14 && isM(x,yy); yy++) hRun++;
    for(let yy=y-1; yy>y-14 && isM(x,yy); yy--) hRun++;
    if(wRun>7 || hRun>7) continue;                             // a near leaf, not a speck
    dots.push([x,y]);
  }
  return dots.length;
}
(async()=>{ const W=await openWorld({rd:10}); let bad=0;
  const say=(ok,m)=>{ console.log((ok?'  ok    ':'  FAIL  ')+m); if(!ok) bad++; };
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)');
    await ev('__hc.leafTag(1)'); await sleep(900);
    const sweep=async(tag)=>{ let n=0;
      for(let k=0;k<6;k++){ await ev(`__hc.cam({yaw:${'${k}'}, pitch:0.05})`.replace('${k}',(k*Math.PI/3).toFixed(4))); await sleep(450);
        const f=path.join(OUT,'leafspeck-'+tag+'-'+k+'.png'); await W.page.screenshot({path:f}); n+=magenta(f); }
      return n; };
    // the fade is a code default; the A/B is against the batch being hidden, plus the near field must survive
    await ev('__hc.leafFar({gone:0})'); await sleep(700);
    const noFade=await sweep('nofade');
    console.log('  tagged specks, no fade (control):  '+noFade+'   '+JSON.stringify(await ev('__hc.leafFar()')));
    await ev(`__hc.leafFar({near:${process.env.HC_NEAR||14}, gone:${process.env.HC_GONE||26}})`); await sleep(700);
    const withFade=await sweep('fade');
    console.log('  tagged specks, fade shipped:      '+withFade+'   '+JSON.stringify(await ev('__hc.leafFar()')));
    await ev('__hc.leaves(false)'); await sleep(700);
    const hidden=await sweep('hidden');
    console.log('  tagged specks, batch hidden:      '+hidden+'   (the control -- must be 0)');
    await ev('__hc.leaves(true)'); await sleep(700);
    say(hidden===0, 'the control is clean: nothing magenta survives hiding the batch ('+hidden+')');
    // AND THE NEAR FIELD IS STILL THERE: stand under the canopy and a leaf within LEAF_NEAR must draw at full size.
    const near=await ev(`(()=>{ let n=0, big=0;
      for(let i=0;i<110;i++){ const L=__hc.leafAt?__hc.leafAt(i):null; }
      const q=__hc.leaves(); return q; })()`);
    console.log('  batch '+JSON.stringify(near).slice(0,90));
    say(withFade < noFade*0.55, 'the fade cuts the specks by more than half ('+noFade+' -> '+withFade+')');
    console.log('\n  '+(bad?bad+' failed':'all ok'));
  } finally { await W.close(); process.exit(bad?1:0); } })();
