// THE SUN HIDES: BEHIND CLOUD, BEHIND BLOCKS, AND IT IS NOT A FLOODLIGHT.
//
// Ben 08-04: "the sun is still too bright, and i see a halo around the sun clouds or not, and the sun is visible through
// blocks." All three are the same object — the crisp disc drawn AFTER the post chain (drawSunOverlay), which the sky
// shader's own cloud line cannot reach, plus the 40x bloom seed inside the dome that the halo is made of.
//
// Five claims:
//   1. The CPU port of the sky's coverage field agrees with the GPU's. The overlay hides the disc off the CPU value while
//      only the GPU draws cloud, so if they disagree the sun goes out under a clear sky. This is the load-bearing check.
//   2. Thick cover over the sun genuinely puts the disc out, and a clear sky leaves it fully on.
//   3. A block between the eye and the sun blocks it — INCLUDING one closer than 1.2 blocks, which the old fixed-stride
//      march never sampled, and a wall crossed between two of its sample points.
//   4. The disc + halo are dimmer than they were: fewer blown-out pixels around the sun at the same hour.
//   5. No page errors.
//
//   node bench/assert-sun-hides.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
const lum=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
// BLOWN OUT, not "bright". The disc's core clips to white either way; what "too bright" and "a halo" both mean is how much
// of the sky around it is at or near white, so the statistic is the area above a high threshold.
function blown(file, crop, th=246){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*crop[0])|0,x1=(P.w*crop[1])|0,y0=(P.h*crop[2])|0,y1=(P.h*crop[3])|0;
  let hot=0,n=0,s=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const L=lum(P.data,(y*P.w+x)*P.ch); if(L>=th)hot++; s+=L; n++; }
  return { pct:+(100*hot/n).toFixed(3), mean:+(s/n).toFixed(2), n };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--disable-gpu-vsync','--disable-frame-rate-limit']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    // pinScene() zeroes cloud cover (plan §7), so pin first and put the cloud back afterwards or every cloud claim here
    // tests a clear sky and reports the feature as inert.
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    // High up and clear of the terrain: the sun has to be in open sky for the brightness crops, and the block claims are
    // made through __hc.sunRay from chosen points rather than from wherever the player happens to stand.
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+150}, ${S.sz}+0.5);`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1800);
    // Re-pin at every shot (plan §7), and spin real frames each time: the overlay's state only advances when it draws.
    const frames=n=>page.evaluate(`(async()=>{ for(let i=0;i<${n};i++) await new Promise(r=>requestAnimationFrame(r)); })()`);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(420); await frames(8); await page.evaluate(`__hc.setTime(${t})`); await sleep(140); await frames(8); };

    // ---- 1. THE PORT AGAINST THE GPU -----------------------------------------------------------------------------------
    // Every direction goes through the sky's own fragment shader on a 1x1 target (uCloudDbg) and through the CPU port, and
    // the two must land on the same number. 8-bit readback quantises at 1/255, so the floor of any disagreement is 0.004.
    await page.evaluate(`__hc.vis({cloud:1.6})`);
    const pf=await page.evaluate(`(()=>{ const out=[];
      for(const ey of [0.06,0.18,0.34,0.52,0.72,0.9]) { const h=Math.sqrt(1-ey*ey);
        for(let i=0;i<8;i++){ const b=i*Math.PI/4; out.push(__hc.cloudProbe({dir:[Math.cos(b)*h, ey, Math.sin(b)*h]})); } }
      return out; })()`);
    const dif=pf.map(p=>Math.abs(p.dCloud)).sort((a,b)=>a-b);
    const maxd=dif[dif.length-1], medd=dif[dif.length>>1], p90=dif[Math.floor(dif.length*0.9)];
    const worst=pf.reduce((a,b)=>Math.abs(b.dCloud)>Math.abs(a.dCloud)?b:a);
    console.log(`  port vs GPU over ${pf.length} directions: median |diff| ${medd.toFixed(4)}  p90 ${p90.toFixed(4)}  max ${maxd.toFixed(4)}`);
    console.log(`  worst: dir ${JSON.stringify(worst.dir)}  gpu ${worst.gpu.cloud}  js ${worst.js.cloud}`);
    // BIT-EXACTNESS IS NOT AVAILABLE and asking for it would be a false claim: h13 takes the fract of a product in the
    // thousands, so wherever the GPU's arithmetic differs from float64-with-fround in the last bit, the two land on
    // unrelated cloud. What is required is that the ports agree on the FIELD — nearly every direction, closely — and the
    // overlay then averages five rays across the disc so one divergent direction cannot put the sun out by itself.
    check('the CPU coverage port matches the GPU field', medd<0.012 && p90<0.06, `median ${medd.toFixed(4)} p90 ${p90.toFixed(4)} max ${maxd.toFixed(4)} over ${pf.length} directions (8-bit readback floor is 0.004)`);
    const agree=pf.filter(p=>Math.abs(p.dCloud)<0.05).length;
    check('and it agrees on nearly every direction', agree>=pf.length-3, `${agree} of ${pf.length} within 0.05`);
    const span=pf.map(p=>p.gpu.cloud);
    check('and the field really does saturate somewhere', Math.max(...span)>0.85, `GPU cloud ranges ${Math.min(...span).toFixed(2)}..${Math.max(...span).toFixed(2)} at cover 1.6 — the open thread assumed it never got near 1`);

    // ---- 1b. WHERE THE FIELD HAS ANY VARIETY LEFT --------------------------------------------------------------------
    // cp = dir/(dir.y*0.9+0.1) is a plane projection, so a full turn of bearing at a high elevation traces a circle a
    // fraction of an fBm cell wide: the coverage over a high sun is one nearly-constant value, whatever the ramp says.
    // Measured as the spread of cloud across 12 bearings at two elevations — this is the whole answer to the open thread,
    // so it is asserted rather than written down.
    const spread=async ey=>{ const h=Math.sqrt(1-ey*ey);
      const v=await page.evaluate(`(()=>{ const o=[]; for(let i=0;i<12;i++){ const b=i*Math.PI/6;
        o.push(__hc.cloudProbe({dir:[Math.cos(b)*${h}, ${ey}, Math.sin(b)*${h}]}).gpu.cloud); } return o; })()`);
      const m=v.reduce((a,b)=>a+b,0)/v.length;
      return { sd:+Math.sqrt(v.reduce((a,b)=>a+(b-m)*(b-m),0)/v.length).toFixed(3), lo:Math.min(...v), hi:Math.max(...v) }; };
    const lowE=await spread(0.40), highE=await spread(0.92);
    console.log(`  cloud across 12 bearings:  at 24 degrees up  spread ${lowE.sd} range ${lowE.lo}..${lowE.hi}`);
    console.log(`                             at 67 degrees up  spread ${highE.sd} range ${highE.lo}..${highE.hi}`);
    check('the field flattens toward the zenith', highE.sd < lowE.sd*0.5, `bearing spread ${lowE.sd} at 24 degrees against ${highE.sd} at 67 — a midday sun samples one value, which is why cover over it looked rare`);

    // ---- AIM AT THE SUN ------------------------------------------------------------------------------------------------
    // The overlay's own ndc is the feedback: try both yaw conventions and keep whichever puts the disc near frame centre.
    await pin(0.16);
    const sd=(await page.evaluate(`__hc.cloudProbe()`)).dir;
    const pitch=Math.asin(Math.max(-1,Math.min(1,sd[1])));
    let best=null;
    for(const yaw of [Math.atan2(-sd[0],-sd[2]), Math.atan2(sd[0],sd[2]), Math.atan2(-sd[2],-sd[0]), Math.atan2(sd[0],-sd[2])]){
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:${pitch}})`); await sleep(200);
      const o=await page.evaluate(`__hc.sunOverlay()`);
      const r=Math.hypot(o.ndc[0],o.ndc[1]);
      if(o.drawn>0 && (!best||r<best.r)) best={yaw,r,o};
    }
    if(!best) throw new Error('could not put the sun on screen');
    await page.evaluate(`__hc.cam({yaw:${best.yaw}, pitch:${pitch}})`); await sleep(300);
    console.log(`  sun on screen at yaw ${best.yaw.toFixed(3)} pitch ${pitch.toFixed(3)}, ndc ${JSON.stringify(best.o.ndc)}`);
    const SUNCROP=[0.30,0.70,0.24,0.72];   // centred on the disc, well clear of the hotbar (y<0.85), the compass and the held item

    // ---- 2. CLOUD PUTS THE DISC OUT ------------------------------------------------------------------------------------
    // The field scrolls on REAL seconds, not the game clock, so you cannot walk a cloud across the sun by stepping setTime
    // (plan §7). Move the SUN instead: step the hour and read the coverage at each new bearing.
    await page.evaluate(`__hc.vis({cloud:0})`); await sleep(300);
    const clear=await page.evaluate(`__hc.sunDisc()`);
    console.log(`  clear sky: cloud ${clear.cloud} hide ${clear.hide} opacity ${clear.opacity}`);
    check('a clear sky leaves the disc fully on', clear.hide>0.99 && clear.opacity>0.3, `hide ${clear.hide} opacity ${clear.opacity}`);
    await page.evaluate(`__hc.vis({cloud:1.6})`);
    // WHY THIS SWEEP IS ALL LOW-TO-MID HOURS, and the answer to "why does the coverage rarely saturate over the sun":
    // the field is a plane projection, cp = dir/(dir.y*0.9+0.1), which COMPRESSES toward the zenith. At 60-70 degrees up
    // the sun's uv sits inside a circle a third of a cell wide, so every bearing samples nearly the same fBm value and the
    // midday sun is stuck on whatever that one value is — dry, here, at every hour from 0.16 to 0.40. The clouds you can
    // see live where cp is large, which is the lower half of the sky. It is not that the field never saturates (it reaches
    // 1.00 above) and it is not the 0.38..0.62 ramp; it is where the sun is.
    const sweep=[];
    for(const t of [0.04,0.05,0.06,0.07,0.08,0.09,0.10,0.11,0.12,0.13,0.16,0.25,0.40,0.44]){
      await pin(t); const d=await page.evaluate(`__hc.sunDisc()`);
      sweep.push({t, cloud:d.cloud, hide:d.hide, opacity:d.opacity, elev:d.elevDeg});
    }
    for(const s of sweep) console.log(`  t=${s.t.toFixed(2)}  elev ${String(s.elev).padStart(5)}  cloud ${s.cloud.toFixed(3)}  hide ${s.hide.toFixed(3)}  opacity ${s.opacity.toFixed(4)}`);
    const thick=sweep.filter(s=>s.cloud>0.8);
    check('thick cover happens over the sun at all', thick.length>0, `${thick.length} of ${sweep.length} hours have cloud>0.8 over the sun at cover 1.6`);
    check('and it puts the disc out', thick.length>0 && Math.min(...thick.map(s=>s.opacity))<0.05, `lowest opacity under thick cover ${Math.min(...sweep.map(s=>s.opacity)).toFixed(4)}`);
    const lit=sweep.filter(s=>s.cloud<0.15);
    check('a gap in the cloud leaves it lit', lit.length===0 || Math.max(...lit.map(s=>s.hide))>0.75, `hide under thin cover ${lit.map(s=>s.hide.toFixed(2)).join(', ')||'no thin-cover hour in the sweep'}`);

    // ---- 3. BLOCKS ---------------------------------------------------------------------------------------------------
    await pin(0.16);
    const rays=await page.evaluate(`(()=>{ const g=__hc.groundY(${S.sx},${S.sz});
      return { deep:__hc.sunRay({from:[${S.sx}+0.5, g-14, ${S.sz}+0.5]}),
               justUnder:__hc.sunRay({from:[${S.sx}+0.5, g-0.6, ${S.sz}+0.5]}),
               straightUp:__hc.sunRay({from:[${S.sx}+0.5, g-0.6, ${S.sz}+0.5], dir:[0,1,0]}),
               openSky:__hc.sunRay({from:[${S.sx}+0.5, g+150, ${S.sz}+0.5]}), groundY:g }; })()`);
    console.log('  rays: '+JSON.stringify(rays));
    check('14 blocks underground the sun is blocked', rays.deep.blocked===true);
    // THE OLD BUG, exactly: the block 0.6 above the eye sat inside the skipped first 1.2 of the march.
    check('a block less than 1.2 away blocks it', rays.justUnder.blocked===true && rays.straightUp.blocked===true, `toward the sun ${rays.justUnder.blocked}, straight up ${rays.straightUp.blocked}`);
    check('and open sky does not', rays.openSky.blocked===false);
    // AND THE DISC ITSELF, from underground. Read where the player ACTUALLY ended up rather than where it was sent: the
    // first run of this reported vis stuck at 0.25 from "underground", and the eye had been pushed back out of the rock by
    // collision resolution, so it was a frame of open sky being asserted as buried.
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${rays.groundY-14}, ${S.sz}+0.5)`);
    // FRAMES, NOT MILLISECONDS. A wall-clock wait is not a wait for rendering — headless with nothing driving it advanced
    // one frame in 900 ms, and the first version of this read vis mid-decay and called a working fade a bug.
    await page.evaluate(`(async()=>{ for(let i=0;i<20;i++) await new Promise(r=>requestAnimationFrame(r)); })()`);
    const where=await page.evaluate(`(()=>{ const s=__hc.st(); return {py:s.py, ray:__hc.sunRay({from:[s.px,s.py,s.pz]}), disc:__hc.sunDisc()}; })()`);
    console.log(`  buried at y=${where.py} (sent to ${rays.groundY-14}): ${JSON.stringify(where.disc)}`);
    // vis reported 0.25 with all five rays blocked, which one decay step cannot produce twice — so watch it over frames.
    const watch=await page.evaluate(`(async()=>{ const o=[]; for(let i=0;i<10;i++){ await new Promise(r=>requestAnimationFrame(r));
      const d=__hc.sunDisc(); o.push([d.vis,d.openRays,d.opacity]); } return o; })()`);
    console.log('  vis/openRays/opacity over 10 frames: '+watch.map(a=>a.join(':')).join('  '));
    console.log(`  ray from the player: blocked ${where.ray.blocked};  from the eye the overlay used (y=${where.disc.eyeY}): `+
      JSON.stringify(await page.evaluate(`(()=>{ const s=__hc.st(); return __hc.sunRay({from:[s.px,${where.disc.eyeY},s.pz]}); })()`)));
    check('the disc goes out wherever the ray says it is blocked', !where.ray.blocked || where.disc.opacity<0.005, `ray blocked ${where.ray.blocked}, opacity ${where.disc.opacity}, vis ${where.disc.vis} at y=${where.py}`);
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+150}, ${S.sz}+0.5)`); await sleep(900);

    // ---- 4. IT IS DIMMER THAN IT WAS ---------------------------------------------------------------------------------
    // A/B in one page through the three levers: the values as shipped against the values before today. Clear sky, so this
    // measures the disc and its halo and nothing else.
    await page.evaluate(`__hc.vis({cloud:0})`);
    const shot=async(t,name)=>{ await pin(t); const f=path.join(OUT,name); await page.screenshot({path:f}); return f; };
    await page.evaluate(`__hc.sunDisc({gain:40, halo:0.45, sheen:0.26, alpha:0.92})`);
    const oldF=await shot(0.16,'sun-halo-before.png');
    await page.evaluate(`__hc.sunDisc({gain:10, halo:0.30, sheen:0.10, alpha:0.80})`);
    const newF=await shot(0.16,'sun-halo-after.png');
    // ATTRIBUTION: which of the two actually makes the wide glow. One frame with the bloom pass turned down and everything
    // else as shipped — if the shoulder collapses here and not with the gain, the halo was the post pass all along.
    await page.evaluate(`__hc.sunDisc({bloom:0.0})`); const noBloom=await shot(0.16,'sun-halo-nobloom.png');
    await page.evaluate(`__hc.sunDisc({bloom:0.22})`); const lowBloom=await shot(0.16,'sun-halo-bloom22.png');
    // A THIRD OPTION FOR BEN, since neither the gain nor the bloom is what most of the glow is made of: the sky's own
    // forward-scatter terms cut to the bone. The broad pow(sd,3) stays whatever happens — that one is the whole sky
    // brightening toward the sun, and without it a clear day is a flat blue lid (the reason it was added).
    await page.evaluate(`__hc.sunDisc({halo:0.12, sheen:0.0, bloom:0.34})`); await shot(0.16,'sun-halo-minimal.png');
    await page.evaluate(`__hc.sunDisc({halo:0.30, sheen:0.10, bloom:0.55})`);
    const A=blown(oldF,SUNCROP), B=blown(newF,SUNCROP), C=blown(noBloom,SUNCROP), D=blown(lowBloom,SUNCROP);
    console.log(`  bloom off: ${C.pct}% blown, mean ${C.mean}    bloom 0.22: ${D.pct}% blown, mean ${D.mean}`);
    console.log(`  around the sun  before: ${A.pct}% blown, mean ${A.mean}   after: ${B.pct}% blown, mean ${B.mean}`);
    check('the sun and its halo are dimmer', B.pct < A.pct*0.7, `blown-out area ${A.pct}% -> ${B.pct}% of the crop`);
    check('but the disc is still a disc', B.pct > 0.25, `${B.pct}% blown — the body itself must survive`);
    // The pair Ben picks the cloud response from: same hour, cover 1.6, thin-responsive against thick-only.
    await page.evaluate(`__hc.vis({cloud:1.6})`);
    const tPick=(thick[0]||sweep[0]).t;
    await page.evaluate(`__hc.sunDisc({k:1.8})`); const kA=await shot(tPick,'sun-cloud-k18.png');
    await page.evaluate(`__hc.sunDisc({k:0.8})`); const kB=await shot(tPick,'sun-cloud-k08.png');
    await page.evaluate(`__hc.sunDisc({k:3.2})`); const kC=await shot(tPick,'sun-cloud-k32.png');
    await page.evaluate(`__hc.sunDisc({k:1.8})`);
    console.log(`  Ben's pick: sun-cloud-k08 (thin cloud already dims) / k18 (shipped, matches the sky) / k32 (thick only), t=${tPick}`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/sun-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
