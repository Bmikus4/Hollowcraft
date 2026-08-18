// BEN'S FIREFLY HYPOTHESIS, TESTED TWO WAYS. His reading: the orange dots are tied directly to light emitters,
// perhaps fireflies visible THROUGH the world -- the same signature as the flare drawing through trees that he
// reported to the models terminal.
//   TEST 1  the system fully off, against on: does the speck count move?
//   TEST 2  occlusion. Pin one firefly at a known place at full blink, then WALL IT IN with stone and look from
//           outside. A sprite that survives being walled in is drawing through the world.
// The switch is a held flag (_ffHidden), not a visible=false the update loop overwrites -- that is the mistake the
// leaf batch's switch made, and it is why its A/B read 159 against 161.
import { spawnSync } from 'node:child_process';
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
const W_=1000;
function warmSpecks(file){
  const r=spawnSync('ffmpeg',['-loglevel','error','-i',file,'-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:1<<28});
  if(r.status!==0) return -1;
  const buf=r.stdout, w=W_, h=Math.floor(buf.length/3/W_); const dots=[];
  for(let y=8;y<h-8;y++) for(let x=Math.floor(w*0.28);x<w-8;x++){
    const i=(y*w+x)*3, R=buf[i], G=buf[i+1], B=buf[i+2];
    if(R<70) continue;                                    // a firefly is a BRIGHT speck, not a dark tint
    if(!(R>B+25 && R>=G)) continue;                       // warm
    let sr=0,n=0; for(let dy=-6;dy<=6;dy++) for(let dx=-6;dx<=6;dx++){ if(Math.max(Math.abs(dx),Math.abs(dy))<4) continue;
      const xx=x+dx, yy=y+dy; if(xx<0||yy<0||xx>=w||yy>=h) continue; sr+=buf[(yy*w+xx)*3]; n++; }
    if(!n || R - sr/n < 30) continue;                     // and much brighter than its own surround
    if(!dots.some(d=>Math.abs(d[0]-x)<7 && Math.abs(d[1]-y)<7)) dots.push([x,y]);
  }
  return dots.length;
}
(async()=>{ const W=await openWorld({rd:10});
  try{ await sleep(2500);
    for(let i=0;i<60;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)');
    await ev('__hc.setTime(0.86)');                       // night: fireflies are a dusk/night system
    await sleep(1200);
    console.log('  material '+JSON.stringify(await ev('__hc.fireflies()')).slice(0,200));

    // ---- TEST 1: off vs on, eight bearings
    const tot={on:0, off:0};
    for(const on of [true,false,true,false]){
      await ev('__hc.fireflies('+on+')'); await sleep(700);
      let sum=0;
      for(let k=0;k<8;k++){ await ev(`__hc.cam({yaw:${(k*Math.PI/4).toFixed(4)}, pitch:0.05})`); await sleep(400);
        const f=path.join(OUT,'ff-'+(on?'on':'off')+'-'+k+'.png'); await W.page.screenshot({path:f});
        sum+=warmSpecks(f); }
      tot[on?'on':'off']+=sum;
      console.log('  fireflies '+(on?'on ':'off')+' bright warm specks over 8 bearings: '+sum); }
    console.log('  TOTALS  on '+tot.on+'   off '+tot.off);

    // ---- TEST 2: walled in
    await ev('__hc.fireflies(true)'); await sleep(500);
    const st=await ev(`(()=>{ const P=__hc.probe();
      const fx=Math.round(P.x)+6, fz=Math.round(P.z), fy=Math.round(__hc.surfH(fx,fz))+2;
      __hc.ffTune({pin:[fx,fy,fz], solo:true});
      return {fx,fy,fz}; })()`);
    await ev(`__hc.cam({yaw:${Math.atan2(-6,0).toFixed(4)}, pitch:0})`);
    await ev(`__hc.look(${st.fx}, ${st.fy}, ${st.fz})`).catch(()=>{});
    await sleep(900);
    const before=path.join(OUT,'ff-open.png'); await W.page.screenshot({path:before});
    // WALL IT IN: a solid stone shell around the pinned sprite, so nothing but the wall can be in that direction.
    const built=await ev(`(()=>{ let n=0;
      for(let dy=-2; dy<=2; dy++) for(let dx=-2; dx<=2; dx++) for(let dz=-2; dz<=2; dz++){
        if(Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dz))!==2) continue;
        __hc.setBlk(${st.fx}+dx, ${st.fy}+dy, ${st.fz}+dz, 'stone'); n++; }
      return n; })()`);
    await sleep(1400);
    const after=path.join(OUT,'ff-walled.png'); await W.page.screenshot({path:after});
    console.log('  pinned at '+JSON.stringify(st)+'  shell blocks '+built);
    console.log('  bright warm specks  open '+warmSpecks(before)+'   walled in '+warmSpecks(after));
    console.log('  ff state '+JSON.stringify(await ev('__hc.fireflies()')).slice(0,150));

    // ---- TEST 3: THE LAMP HALOS, which fit his description better than the fireflies do. 4.5 PIXELS with
    // sizeAttenuation false -- the only system in the file sized in pixels, which is his "they scale with browser
    // zoom"; fog:false so they never fade with range, which is his "evenly spread"; additive and lamp-coloured,
    // which is orange. And nothing in the material or its gate mentions the hour, so a lamp remembered at night is
    // still an orange sprite at noon. Its switch was inert for the same reason the leaves' was; now it holds.
    // AT THE WELL, which carries a lantern, and at noon as well as at night.
    const P2=await ev('__hc.probe()');
    await ev(`__hc.tp(${'$'}{${P2.spawnX}+14+5}, ${'$'}{${P2.spawnZ}+34})`).catch(()=>{});
    await ev(`__hc.tp(${P2.spawnX+19}, ${P2.spawnZ+34})`);
    for(let i=0;i<12;i++){ const f=await ev('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    for(const t of [0.30, 0.86]){
      await ev(`__hc.setTime(${'${t}'})`.replace('${t}', String(t))); await sleep(900);
      for(const on of [true,false]){
        await ev('__hc.lampPts('+on+')'); await sleep(600);
        let sum=0;
        for(let k=0;k<6;k++){ await ev(`__hc.cam({yaw:${'${(k*Math.PI/3).toFixed(4)}'}, pitch:0.02})`.replace('${(k*Math.PI/3).toFixed(4)}', (k*Math.PI/3).toFixed(4))); await sleep(400);
          const f=path.join(OUT,'lamp-'+(on?'on':'off')+'-'+t+'-'+k+'.png'); await W.page.screenshot({path:f});
          sum+=warmSpecks(f); }
        console.log('  t='+t+' lampPts '+(on?'on ':'off')+' bright warm specks over 6 bearings: '+sum
          +'   '+JSON.stringify(await ev('__hc.lampPts()')).slice(0,150)); } }
  } finally { await W.close(); } })();
