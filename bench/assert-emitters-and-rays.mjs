// LANTERNS AT DISTANCE, AND WHAT SEEDS A GOD RAY.
//
// Ben 08-04, two notes: "light emitters need to be visible from farther away" and "SOMETIMES NON-sun light sources also emit
// god rays."
//
// The second is a real bug with a known mechanism: GodrayShader marches from every pixel TOWARD the sun's screen position and
// accumulates any sample brighter than a threshold. It has no idea what the sun is — a lantern on that line seeds a shaft just
// as well, so the rays appear to come out of the lantern.
//
// The first is a measurement I owe rather than a change I am sure of: raising bloomPass.threshold 0.88 -> 1.15 earlier today
// (to take the sky's bloom off the sun's halo) is the most recent thing that could have made a distant faint emitter stop
// glowing. The night-frame collateral check I ran for that may have had no emitter in the crop at all, which would make it
// vacuous — this file puts lanterns in the frame on purpose.
//
// A row of lanterns is built along one bearing at 8/24/48/96/160 blocks, at night, and each is measured in a crop around its
// OWN projected screen position (__hc.screenOf), so "visible" is that lantern's pixels and not the scene's.
//
// WHAT THIS FILE PROVES AND WHAT IT DOES NOT. It settles the bloom-threshold question cleanly: lanterns from 8 to 160 blocks
// keep their glow identically at 0.88 and 1.15, so today's halo fix did not cost the emitters their reach. It does NOT isolate
// a lantern's seeded shaft — four attempts are recorded in the comments below, and every one of them was buried by either the
// lamp's own light on the scene or by a daylight sky that clips beside the sun.
//
//   node bench/assert-emitters-and-rays.mjs
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
// A BOX AROUND ONE POINT ON SCREEN, in pixels. Returns the peak, and how many pixels carry real glow — at night the scene
// floor is single digits, so 40 is well clear of it and well under a lantern's own core.
function around(file, px, py, r=26, th=40){
  const P=decodePNG(fs.readFileSync(file));
  const x0=Math.max(0,(px-r)|0), x1=Math.min(P.w,(px+r)|0), y0=Math.max(0,(py-r)|0), y1=Math.min(P.h,(py+r)|0);
  let peak=0, glow=0, n=0, s=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const L=lum(P.data,(y*P.w+x)*P.ch); if(L>peak)peak=L; if(L>th)glow++; s+=L; n++; }
  return { peak:+peak.toFixed(1), glow, mean:n?+(s/n).toFixed(2):0, n };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0;
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
    // THE PAGE IS PARAMETERISABLE, because index.html is edited by two live sessions and a half-written brace in theirs stops
    // the whole file parsing — this harness hit "Unexpected token 'else'" from someone else's in-flight edit. HC_PAGE lets a
    // run test a known-good copy (git show HEAD:index.html > _headtest.html) instead of waiting for the tree to be quiet.
    // Leading slash added here, not required from the caller: Git Bash rewrites a bare "/foo.html" argument into a Windows
    // path (it arrived as M:/Git/_headtest.html), so the env var is passed without one.
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:120000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,{timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    // A ROW OF LANTERNS on one bearing, each one block above the local ground so none is buried. Built with the same
    // /setblock the console runs, so the placement path is the game's own.
    const DIST=[8,24,48,96,160];
    const lamps=await page.evaluate(`(()=>{ const out=[];
      for(const d of ${JSON.stringify(DIST)}){
        const x=Math.round(${S.sx}+d), z=Math.round(${S.sz});
        const g=__hc.groundY(x,z); const y=g+2;
        __hc.cmdRun('/setblock '+x+' '+y+' '+z+' lantern');
        out.push({d, x, y, z, block:__hc.blockAt?null:null});
      } return out; })()`);
    console.log('  lanterns: '+JSON.stringify(lamps));
    // Stand back from the row and look along it, at night, from a height that clears the terrain between them.
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    await page.evaluate(`__hc.tpAt(${S.sx}-6, ${gy+4}, ${S.sz}+0.5);`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2000);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(420); await page.evaluate(`__hc.setTime(${t})`); await sleep(200); };
    await pin(0.75);   // deep night: t=0.75 is midnight on the real setTime map (t=0 is sunrise)
    // Aim at the farthest lantern so every one of them is in frame; try both yaw conventions and keep the one that puts it
    // on screen, using the game's own projection rather than guessing the convention.
    const far=lamps[lamps.length-1];
    let bestYaw=0, bestR=1e9;
    for(let i=0;i<24;i++){ const yaw=i*Math.PI/12;
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:0.0})`); await sleep(120);
      const p=await page.evaluate(`__hc.screenOf(${far.x}+0.5, ${far.y}+0.5, ${far.z}+0.5)`);
      if(p&&p.onScreen){ const r=Math.hypot(p.px-500,p.py-280); if(r<bestR){ bestR=r; bestYaw=yaw; } } }
    await page.evaluate(`__hc.cam({yaw:${bestYaw}, pitch:0.0})`); await sleep(500);
    console.log(`  looking down the row at yaw ${bestYaw.toFixed(2)}`);

    // ---- 1. HOW FAR A LANTERN CARRIES, AND WHAT THE BLOOM THRESHOLD DOES TO IT ----------------------------------------
    const shot=async name=>{ const f=path.join(OUT,name); await page.screenshot({path:f}); return f; };
    const measure=async(tag)=>{ const f=await shot(`emit-${tag}.png`); const out=[];
      for(const L of lamps){ const p=await page.evaluate(`__hc.screenOf(${L.x}+0.5, ${L.y}+0.5, ${L.z}+0.5)`);
        out.push({ d:L.d, on:!!(p&&p.onScreen), ...(p&&p.onScreen?around(f,p.px,p.py):{peak:null,glow:null}) }); }
      return out; };
    await page.evaluate(`__hc.sunDisc({thresh:1.15})`); await sleep(300);
    const now=await measure('thresh115');
    await page.evaluate(`__hc.sunDisc({thresh:0.88})`); await sleep(300);
    const old=await measure('thresh088');
    await page.evaluate(`__hc.sunDisc({thresh:1.15})`); await sleep(200);
    console.log('  dist |  threshold 1.15 (shipped)   |  threshold 0.88 (before today)');
    for(let i=0;i<lamps.length;i++){
      const a=now[i], b=old[i];
      console.log(`  ${String(a.d).padStart(4)} |  peak ${String(a.peak).padStart(6)}  glow ${String(a.glow).padStart(5)} px  |  peak ${String(b.peak).padStart(6)}  glow ${String(b.glow).padStart(5)} px  ${a.on?'':'(off screen)'}`);
    }
    const vis=now.filter(r=>r.on && r.glow>0);
    check('the near lanterns glow at all', vis.length>0 && vis[0].glow>4, `${vis.length} of ${lamps.length} lanterns carry glow; nearest ${vis[0]?vis[0].glow:0} px`);
    // THE REGRESSION QUESTION, answered either way: did raising the threshold cost the distant ones their glow?
    const lost=[];
    for(let i=0;i<lamps.length;i++) if(now[i].on && old[i].glow>0 && now[i].glow < old[i].glow*0.6) lost.push(lamps[i].d);
    check('raising the bloom threshold did not cost the emitters their reach', lost.length===0,
      lost.length? `lanterns at ${lost.join(', ')} blocks lost more than 40% of their glow to the threshold change — the halo fix has to come from somewhere else`
                 : `every lantern in frame keeps its glow at 1.15 (compare the two columns above)`);
    const farthest=vis.length?vis[vis.length-1].d:0;
    console.log(`  farthest lantern still carrying glow: ${farthest} blocks`);

    // ---- 2. WHAT SEEDS A GOD RAY ------------------------------------------------------------------------------------
    // IT TAKES AN EMITTER NEAR THE SUN ON SCREEN, which is why Ben saw it "sometimes": the accumulation is scaled by the
    // `edge` term, which fades to nothing beyond about a third of the frame from the sun. A lantern on the ground with the sun
    // elsewhere in the sky moves 0.4 luminance — measurable, invisible. So the lantern goes ON the sun's bearing, 40 blocks
    // out, and the camera is aimed at the sun.
    // ABOVE THE CANOPY FIRST. The lantern row was measured from inside the forest at the spawn, which is the right place for
    // it and the wrong place for this: the first run of this section put the camera under leaves, so the sun was occluded and
    // the lamp was inside the tree — the ring around it moved 0.08 luminance either way and the region around the sun read a
    // mean of 9. God rays need open sky in the frame before anything about them can be measured.
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy+80}, ${S.sz}+0.5)`);
    await sleep(1500);
    // AT DUSK, and this is the whole of Ben's "sometimes". The pass is gated on uDay>0.15, and in full daylight the sky beside
    // the sun sits at 223 luminance and clips — a lantern's shaft cannot register on it at any seed threshold (measured: 0.48
    // and 0.29 luminance at the two thresholds, both nothing). The window where the pass is still enabled AND the sky is dark
    // enough for an emitter's shaft to show is the last minutes of dusk. Found by sweeping the clock rather than assumed.
    // TWO CONDITIONS AT ONCE, and they nearly exclude each other, which IS the "sometimes". The pass needs uStrength > 0,
    // which needs the sun ABOVE the horizon (it is 0.62*above*(...), and `above` is a smoothstep on elevation) — measured, at
    // uDay 0.27 the sun was 8 degrees UNDER and the strength was exactly 0, so the 3.8 luminance the lamp moved there was its
    // own light on the air and not a shaft at all. And the sky has to be dark enough for a shaft to register, which full
    // daylight is not. The overlap is the few minutes with the sun a degree or two up.
    let dusk=0.02, bestScore=-1;
    for(let t=0.470; t<=0.500; t+=0.002){ await page.evaluate(`__hc.setTime(${t})`); await sleep(130);
      const g=await page.evaluate(`__hc.godrays()`);
      const score=g.strength*(1.0-g.day);      // strong rays AND a dim sky
      if(g.strength>0.2 && score>bestScore){ bestScore=score; dusk=t; } }
    { await page.evaluate(`__hc.setTime(${dusk})`); await sleep(200); const g=await page.evaluate(`__hc.godrays()`);
      console.log(`  low-sun hour t=${dusk.toFixed(3)}: elevation ${g.elevDeg} degrees, uDay ${g.day}, ray strength ${g.strength}`); }
    await pin(dusk);
    const sd=(await page.evaluate(`__hc.cloudProbe()`)).dir;
    const st0=await page.evaluate(`__hc.st()`);
    // OFF the sun's exact bearing, by 22 degrees of azimuth. On it, the lamp projected 7 px from the sun and the "ring around
    // the lantern" was measuring the sun's own shafts — and reading them clipped, which is why a HIGHER seed threshold appeared
    // to add more. It has to sit where `edge` still gives it strength and the sun's own glow does not fill the crop.
    const az=Math.atan2(sd[2],sd[0])+0.38, hor=Math.hypot(sd[0],sd[2]);
    const lamp={ x:Math.round(st0.px+Math.cos(az)*hor*40), y:Math.round(st0.py+sd[1]*40+2), z:Math.round(st0.pz+Math.sin(az)*hor*40) };
    await page.evaluate(`__hc.cmdRun('/setblock ${lamp.x} ${lamp.y} ${lamp.z} lantern')`);
    await sleep(600);
    const pitch=Math.asin(Math.max(-1,Math.min(1,sd[1])));
    let gYaw=0, gR=1e9;
    for(let i=0;i<24;i++){ const yaw=i*Math.PI/12;
      await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:${pitch}})`); await sleep(110);
      const p=await page.evaluate(`__hc.screenOf(${lamp.x}+0.5, ${lamp.y}+0.5, ${lamp.z}+0.5)`);
      if(p&&p.onScreen){ const r=Math.hypot(p.px-500,p.py-280); if(r<gR){ gR=r; gYaw=yaw; } } }
    await page.evaluate(`__hc.cam({yaw:${gYaw}, pitch:${pitch}})`); await sleep(500);
    const gr=await page.evaluate(`__hc.godrays()`);
    const lp=await page.evaluate(`__hc.screenOf(${lamp.x}+0.5, ${lamp.y}+0.5, ${lamp.z}+0.5)`);
    console.log('  godrays: '+JSON.stringify(gr));
    console.log(`  lantern at ${lamp.x},${lamp.y},${lamp.z} projects to ${lp&&(lp.px|0)},${lp&&(lp.py|0)}; sun NDC ${JSON.stringify(gr.sunProjXY)}`);
    if(!lp||!lp.onScreen){ check('a lantern is in frame beside the sun for the god-ray test', false, JSON.stringify(lp)); }
    else {
      // A RING from 18 to 55 px around the lamp: a shaft coming OFF it shows there, and the lamp's own pixels are identical
      // either way, so including them would only dilute the number.
      console.log(`  lamp is ${Math.hypot(lp.px-(gr.sunProjXY[0]*0.5+0.5)*1000, lp.py-(1-(gr.sunProjXY[1]*0.5+0.5))*560)|0} px from the sun on screen`);
      // TOGGLE THE LAMP, NOT THE PASS. Toggling the pass cannot answer this: with only the sun seeding, a pixel beside the
      // lantern still receives the SUN's shafts, so "pass on minus pass off" beside the lamp reads 16 luminance of somebody
      // else's rays. Two earlier versions of this check reported exactly that and read backwards because of it — and at the old
      // low threshold the same crop CLIPPED to white in both frames, which collapsed the delta to 0.15 and looked like proof
      // that a lantern never seeded anything.
      // With the pass held on, placing and removing the lamp isolates the lamp: its own pixels, plus whatever it seeds.
      const SUNPX=(gr.sunProjXY[0]*0.5+0.5)*1000, SUNPY=(1-(gr.sunProjXY[1]*0.5+0.5))*560;
      const ux=(SUNPX-lp.px), uy=(SUNPY-lp.py), ul=Math.hypot(ux,uy)||1;
      // A box HALFWAY from the lamp to the sun, well clear of both: this is where a shaft off the lamp lies and nothing else
      // about the lamp reaches.
      const bx=lp.px+ux/ul*Math.min(90,ul*0.5), by=lp.py+uy/ul*Math.min(90,ul*0.5);
      const lampSet=async(present)=>{ await page.evaluate(`__hc.cmdRun('/setblock ${lamp.x} ${lamp.y} ${lamp.z} '+(${present}?'lantern':'air'))`); await sleep(700); };
      // A DOUBLE DIFFERENCE, because a lantern's own light on the scene is far bigger than any shaft it seeds and lands in the
      // same crop. Placing it moved this box 6.71 luminance at a seed threshold where it CANNOT seed anything — that was its
      // illumination, not a ray. So:
      //     shaft = [ (lamp, pass on) - (no lamp, pass on) ] - [ (lamp, pass off) - (no lamp, pass off) ]
      // The first bracket is the lamp's light plus whatever it seeds; the second is the lamp's light alone. Four frames per
      // threshold, and the sun's own rays cancel out of both brackets.
      const rays=async(on)=>{ await page.evaluate(`__hc.godrays({on:${on}})`); await sleep(220); };
      const box=async(f)=>around(f,bx,by,34,0).mean;
      const streakAt=async(seed)=>{ const tag=String(seed).replace('.','p');
        await page.evaluate(`__hc.godrays({seedMin:${seed}})`);
        await rays(true);
        await lampSet(true);  const a=await box(await shot(`emit-dd-${tag}-lamp-rays.png`));
        await lampSet(false); const b=await box(await shot(`emit-dd-${tag}-nolamp-rays.png`));
        await rays(false);
        const c=await box(await shot(`emit-dd-${tag}-nolamp-norays.png`));
        await lampSet(true);  const d=await box(await shot(`emit-dd-${tag}-lamp-norays.png`));
        await rays(true);
        const withRays=a-b, without=d-c, shaft=+(withRays-without).toFixed(2);
        console.log(`  seedMin ${seed}: the lamp adds ${withRays.toFixed(2)} with the pass on and ${without.toFixed(2)} with it off -> ${shaft} of that is SHAFT`);
        return shaft; };
      const dOld=await streakAt(0.62);
      const dNew=await streakAt(2.2);
      await page.evaluate(`__hc.godrays({seedMin:2.2, on:true})`);
      // NOT ASSERTED, AND HERE IS WHY. With the pass OFF the seed threshold cannot matter, so the two "with it off" brackets
      // must agree — and they read 21.26 and 0.14. The frames are not comparable: placing a lantern kicks off a chunk relight
      // and remesh that outlasts any wait short enough to keep this file usable, so the lamp's own light is still arriving in
      // some frames and not others. That is 20-100x any shaft it could seed, so it buries the thing being measured.
      // The seed change (0.62 -> 2.2) rests on the shader's arithmetic instead, which is checkable by reading it: this pass runs
      // BEFORE the tonemapper, the sky beside the sun sits at 0.6-1.1 in linear HDR, a block emitter reaches a few, and the sun's
      // disc is drawn at uSunGain = 10. What is asserted below is the half that CAN be measured cleanly — that the sun still
      // makes rays. If this needs to be isolated properly, the way in is a scene with no block light at all and an emissive
      // quad placed by the harness, not a lantern that relights the world around it.
      console.log(`  NOT ASSERTED: seeded-shaft isolation is inconclusive (${dOld} vs ${dNew}); the pass-off brackets disagree, so the frames are not comparable`);
      // …and the sun must still make them, or this is just "turn god rays off".
      await page.evaluate(`__hc.godrays({on:true, seedMin:2.2})`); await sleep(250);
      const sOn=await shot('emit-rays-sun-on.png');
      await page.evaluate(`__hc.godrays({on:false})`); await sleep(250);
      const sOff=await shot('emit-rays-sun-off.png');
      await page.evaluate(`__hc.godrays({on:true})`);
      const sa=around(sOn,SUNPX,SUNPY,90,40), sb=around(sOff,SUNPX,SUNPY,90,40);
      console.log(`  around the SUN: rays ON mean ${sa.mean}   OFF mean ${sb.mean}`);
      check('the sun still makes them', sa.mean-sb.mean > 0.3, `mean around the sun ${sb.mean} -> ${sa.mean} with the pass on`);
    }
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/emit-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
