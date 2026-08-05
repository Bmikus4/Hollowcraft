// CAN YOU SEE THE MISSILE IN A STORM? (Ben 08-04: "the ICBM is nearly invisible in fog".)
//
// A screenshot alone cannot answer it — a rocket 240 blocks away is a few dozen pixels and "nearly invisible" is exactly the
// regime where eyeballing a PNG fails. So this measures two things:
//   1. the fog TRANSMITTANCE the scene would apply at the missile's own slant range, straight out of __hc.icbm(). FogExp2 is
//      exp(-(density*depth)^2), so this is the number that was erasing it, and fog:false is what takes it out of the equation.
//   2. the CONTRAST of the pixels at the missile's projected screen position against a ring of background pixels around it.
//      That is the only honest form of "it reads", and it is measured with the weather cranked to full.
//
// usage: node bench/assert-icbm-fog.mjs   -> bench/results/icbm-fog-*.png
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT='D:/code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

// Luma of the disc at (px,py) against an annulus around it. A thing that "reads" differs from its own background; a thing the
// fog has eaten is the background. Returns the mean |disc - ring| in 0..1 luma, plus the extremes, because a dark silhouette
// and a bright contrail are both contrast and a signed mean would cancel them.
function contrastAt(file, px, py, rIn, rOut){
  const {w:W,h:H,ch:C,data:D}=decodePNG(fs.readFileSync(file));
  const luma=(i)=>(0.2126*D[i]+0.7152*D[i+1]+0.0722*D[i+2])/255;
  let dSum=0,dN=0,rSum=0,rN=0,dMin=1,dMax=0;
  for(let y=Math.max(0,py-rOut); y<Math.min(H,py+rOut); y++) for(let x=Math.max(0,px-rOut); x<Math.min(W,px+rOut); x++){
    const d=Math.hypot(x-px,y-py); if(d>rOut) continue;
    const i=(y*W+x)*C, L=luma(i);
    if(d<=rIn){ dSum+=L; dN++; if(L<dMin)dMin=L; if(L>dMax)dMax=L; } else { rSum+=L; rN++; } }
  const disc=dN?dSum/dN:0, ring=rN?rSum/rN:0;
  return { disc:+disc.toFixed(4), ring:+ring.toFixed(4), delta:+Math.abs(disc-ring).toFixed(4),
           spread:+(dMax-dMin).toFixed(4), n:dN };
}

// THE SAME MEASUREMENT, ALIGNED. A puff 245 blocks out is nine pixels across and screenOf is sampled a frame or two before the
// capture, so a fixed disc can sit half off the thing it is measuring and report the weather instead. This scans a small window
// and keeps the strongest reading, which answers the question actually being asked: is there a feature here at all.
function bestContrastNear(file, px, py, rIn, rOut, span){
  let best=null;
  for(let dy=-span; dy<=span; dy+=3) for(let dx=-span; dx<=span; dx+=3){
    const c=contrastAt(file, px+dx, py+dy, rIn, rOut);
    if(!best || c.delta>best.delta) best=Object.assign(c,{dx,dy});
  }
  return best;
}

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null; let bad=0;
  const say=(ok,msg)=>{ console.log((ok?'ok   ':'FAIL ')+msg); if(!ok) bad++; };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:fb(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/index.html?debug=1&rd=12',{waitUntil:'load',timeout:90000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(5000);
    await pg.evaluate('__hc.setTime(0.42)');

    // FULL WEATHER. The onset is ramped over about 8 s inside the weather system, so this waits for the density to actually
    // arrive rather than assuming the command took effect — an earlier version measured a clear sky and passed for the wrong reason.
    // `/weather storm` only lifts fogTgt to 0.35, and it is weather.FOG that multiplies the density by (1+wf*wf*18) — a storm
    // measured 0.006 and would have made this bench pass against half the fog the complaint is about. `fog 1` is the real ceiling.
    await pg.evaluate('__hc.cmdRun("/weather fog 1")').catch(()=>{});
    let dens=0;
    for(let i=0;i<60;i++){ dens=(await pg.evaluate('__hc.icbm()')).fogDensity; if(dens>0.010) break; await sleep(500); }
    console.log('  fog density: '+dens+'   (clear day is ~0.0014)');
    say(dens>0.010, 'weather fog actually arrived (density '+dens+')');

    // Stand a missile in the player's own cell and fire it a long way off, so the arc is the full 190-block apex.
    // The silo cell is passed EXPLICITLY. icbmLaunch with no silo falls back to _siloPad, which is the worldgen site hundreds of
    // blocks away, so a missile stood next to the player was invisible to it and the launch returned "no missile in the shaft".
    const q=await pg.evaluate('__hc.probe()');
    const cell=await pg.evaluate('__hc.setBlock(2,0,0,"icbm")');
    console.log('  stood a missile at '+JSON.stringify(cell&&{x:cell.wx,y:cell.wy,z:cell.wz,id:cell.id}));
    // WATCH FROM THE SIDE. Standing at the pad, the trail recedes almost straight away from the eye: the first version of this
    // bench measured from 1.5 blocks away and the whole 300-block column projected into about forty pixels around the nose —
    // 84 magenta marker pixels for 41 puffs — so every contrast reading was taken on a foreshortened blob. 200 blocks
    // perpendicular to the launch axis is both the honest test and what a player actually sees.
    await pg.evaluate(`__hc.tp(${cell.wx-40}, ${cell.wz+200})`);
    await sleep(6000);
    const fired=await pg.evaluate(`__hc.icbmLaunch(${Math.round(q.x)+260}, ${Math.round(q.z)}, {x:${cell.wx},y:${cell.wy},z:${cell.wz}})`);
    console.log('  launch: '+JSON.stringify(fired));
    say(!fired.err, 'launched'+(fired.err?' — '+fired.err:''));
    if(fired.err){ return; }

    // Mid-flight, near the apex. Freeze nothing: read where the missile IS, aim at it, shoot, measure that exact pixel.
    await sleep(4200);
    const st=await pg.evaluate('__hc.icbm()');
    console.log('  flight: '+JSON.stringify({state:st.state,t:st.t,pos:st.pos,transmit:st.transmit,smoke:st.smoke,drawn:st.smokeDrawn,meshFog:st.meshFog,smokeFog:st.smokeFog,
      smokeLuma:st.smokeLuma,skyLuma:st.skyLuma}));
    say(st.state==='flight', 'still in flight at t='+st.t);
    say(st.meshFog===false, 'rocket materials ignore fog (fog='+st.meshFog+')');
    say(st.smokeFog===false, 'trail material ignores fog (fog='+st.smokeFog+')');
    say(st.smoke>=20, 'the trail is a column, not a puff: '+st.smoke+' live puffs');
    say(st.smokeDrawn===st.smoke, 'every live puff is drawn ('+st.smokeDrawn+'/'+st.smoke+')');
    say(Math.abs(st.smokeLuma-st.skyLuma)>=0.30, 'the column is clear of the sky it is drawn on in luma (smoke '+st.smokeLuma+' vs sky '+st.skyLuma+')');
    // The fog term the OLD material was subject to at this range. Reported, not asserted — it is the size of the bug.
    console.log('  fog would leave '+(st.transmit*100).toFixed(2)+'% of a fog-obeying object at this range');

    // Aim at the missile and measure it against its own background.
    // AIM ANALYTICALLY, NOT BY SWEEPING. A 48-yaw x 7-pitch projection-feedback sweep is ~336 orientations at two frames each:
    // eleven seconds, which is the entire flight — the first version of this bench aimed at where the missile had been and found
    // an empty sky. __hc.look(x,y,z) points at a world point in one call, and the missile's position is already known.
    const aim = await pg.evaluate(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
      const p=__hc.icbm().pos; if(!p) return null;
      const a=__hc.look(p[0],p[1],p[2]); await f(); await f();
      const p2=__hc.icbm().pos;                                  // it has moved a few blocks in those two frames; measure where it IS
      const a2=__hc.look(p2[0],p2[1],p2[2]); await f(); await f();
      const p3=__hc.icbm().pos, s=p3?__hc.screenOf(p3[0],p3[1],p3[2]):null;
      return {aimed:a2, screen:s, pos:p3}; })()`);
    console.log('  aim: '+JSON.stringify(aim && {aimed:aim.aimed, screen:aim.screen&&{px:Math.round(aim.screen.px),py:Math.round(aim.screen.py),onScreen:aim.screen.onScreen}}));
    say(!!(aim&&aim.screen&&aim.screen.onScreen), 'the missile is on screen');
    if(!(aim&&aim.screen&&aim.screen.onScreen)) return;

    // BOTH SAMPLE POINTS COME OFF THE SAME FRAME AS THE SCREENSHOT. Queried afterwards, a second of flight has passed: the puff
    // slot read back was one emitted AFTER the shot, so the disc landed on empty sky and measured DARKER than the ring of real
    // column around it. That is the whole reason this is one evaluate immediately before the capture.
    const marks = await pg.evaluate(`(()=>{ const i=__hc.icbm();
      const n=i.pos?__hc.screenOf(i.pos[0],i.pos[1],i.pos[2]):null;
      const p=i.smokeMid?__hc.screenOf(i.smokeMid[0],i.smokeMid[1],i.smokeMid[2]):null;
      if(p)p.world=i.smokeMid;
      return {nose:n, puff:p}; })()`);
    const shot=path.join(OUT,'icbm-fog-apex.png');
    await pg.screenshot({path:shot});
    const c=bestContrastNear(shot, Math.round(marks.nose.px), Math.round(marks.nose.py), 7, 26, 9);
    console.log('  contrast: '+JSON.stringify(c));
    // 0.02 luma is about the floor of what an eye picks out of flat fog; the pre-fix missile measured as the background itself.
    say(c.delta>=0.02 || c.spread>=0.05, 'the missile reads against the fog (delta '+c.delta+', spread '+c.spread+')');

    const trail=marks.puff;
    if(trail && trail.onScreen){
      const ct=bestContrastNear(shot, Math.round(trail.px), Math.round(trail.py), 6, 22, 9);
      console.log('  trail contrast at a live puff world '+JSON.stringify(trail.world)+' screen '+Math.round(trail.px)+','+Math.round(trail.py)+': '+JSON.stringify(ct));
      say(ct.delta>=0.05, 'the smoke column reads against the sky (delta '+ct.delta+')');
    } else { console.log('  trail sample point off screen — column contrast not measured'); bad++; }

    await sleep(9000);
    const after=await pg.evaluate('__hc.icbm()');
    console.log('  after impact: '+JSON.stringify({state:after.state,craters:after.craters.length,smoke:after.smoke}));
    say(after.smoke>0, 'the column survives the detonation and fades on its own ('+after.smoke+' puffs)');
    await pg.screenshot({path:path.join(OUT,'icbm-fog-after.png')});
  } finally {
    try{ if(b) await b.close(); }catch(e){}
    try{ srv.kill(); }catch(e){}
  }
  console.log(bad?('FAILED '+bad):'PASS');
  if(bad) process.exitCode=1;
})().catch(e=>{ console.error(e); process.exit(1); });
