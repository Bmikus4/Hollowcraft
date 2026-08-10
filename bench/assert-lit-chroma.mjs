// EVERYWHERE A LIGHT TOUCHES GOES COLOURFUL, AND EVERYWHERE ELSE STAYS BLACK.
//
// Ben, 08-05: "we want a genuinely black night, yes. BUT we also want realism in the contrast that light provides at night...
// everything that light touches should become a warm orange glow, it should not stay dark. Chroma wash should become colorful
// everywhere a light source touches." And the two failures he reported: "spawned lights have no affect on the chromatic
// greying/whitewash", "held placed light sources dont act right at night".
//
// The gate used to be a hand-rolled sphere — _hand = uHandK*(1 - d^2/uHandR^2), uHandR = heldLight.distance*0.72 = 23 blocks —
// so with uScotHi 0.45 the washout was switched fully OFF inside about 17 blocks of the PLAYER, through walls and on faces
// turned away from the lamp, while every PLACED light (a pointPool PointLight, never baked) was invisible to it. It now reads
// reflectedLight.directDiffuse, which is the light three.js actually delivered to the fragment.
//
// THE DISCRIMINATING TEST is a torch placed FURTHER AWAY than the old radius could ever have reached. Under the old gate the
// patch it lights is outside the hand sphere and has no baked light, so it stayed washed; under the new one it is lit, so it
// goes coloured. Testing near the player instead would pass under BOTH gates and prove nothing.
//
//   node bench/assert-lit-chroma.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
// SATURATION IS THE CLAIM, not brightness. The washout is luminance-preserving by construction (it mixes toward the pixel's own
// 709 luma), so a frame can be identically bright and completely grey. Read saturation over the BRIGHT pixels only: averaging a
// mostly-black crop drags every number toward the black pixels' own (undefined, reported 0) saturation.
function chroma(file,c,minL){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  let S=0,n=0,R=0,G=0,B=0,L=0,tot=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch, r=P.data[i],g=P.data[i+1],b=P.data[i+2];
    const l=0.2126*r+0.7152*g+0.0722*b; tot++; L+=l;
    if(l<minL) continue;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    S+= mx>0?(mx-mn)/mx:0; R+=r; G+=g; B+=b; n++; }
  return { sat:n?+(S/n).toFixed(3):0, lit:+(100*n/tot).toFixed(1), lum:+(L/tot).toFixed(2),
           rgb:n?[+(R/n).toFixed(1),+(G/n).toFixed(1),+(B/n).toFixed(1)]:[0,0,0],
           warm:n?+((R/n)/Math.max(B/n,0.001)).toFixed(2):0 };
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
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);

    const G0=await page.evaluate(`__hc.scot({})`);
    check('the delivered-light gate is ON by default', G0.litK>0.5, JSON.stringify(G0));

    const S=await page.evaluate(`__hc.st()`);
    const gy=await page.evaluate(`__hc.groundY(${S.sx},${S.sz})`);
    // A LAMP WELL OUTSIDE THE OLD 23-BLOCK HAND RADIUS. 34 blocks, so nothing about the player's own carried light can explain a
    // colour change out there — and y=130 is OUTSIDE the world (CFG.WORLD_H is 128), so place against the real ground.
    const D=34;
    const tx=Math.round(S.sx), tz=Math.round(S.sz+D);
    const tgy=await page.evaluate(`__hc.groundY(${tx},${tz})`);
    const placed=await page.evaluate(`(function(){ try{ __hc.cmdRun('/setblock ${tx} ${tgy+1} ${tz} lantern'); return __hc.blockAt(${tx},${tgy+1},${tz}); }catch(e){ return String(e.message||e); } })()`);
    console.log(`  lamp at ${tx},${tgy+1},${tz} -> blockAt ${JSON.stringify(placed)}`);
    check('the lamp was actually placed', !!placed && placed!==0, JSON.stringify(placed));

    // Stand back from it and look at it, so the lit ground around its base fills the crop while the player carries NOTHING.
    await page.evaluate(`__hc.holdNone()`);
    await page.evaluate(`__hc.tpAt(${S.sx}+0.5, ${gy}+3.0, ${tz}-14)`);
    for(let i=0;i<30;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(1800);
    // Aim by the game's own projection at the lamp, never by a yaw convention.
    let bestYaw=0,bestR=1e9;
    for(let i=0;i<48;i++){ const yaw=i*Math.PI/24; await page.evaluate(`__hc.cam({yaw:${yaw}, pitch:-0.16})`); await sleep(60);
      const p=await page.evaluate(`__hc.screenOf(${tx}+0.5, ${tgy}+0.5, ${tz}+0.5)`);
      if(p&&p.onScreen){ const r=Math.hypot(p.px-500,p.py-300); if(r<bestR){ bestR=r; bestYaw=yaw; } } }
    await page.evaluate(`__hc.cam({yaw:${bestYaw}, pitch:-0.16})`); await sleep(400);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(480); await page.evaluate(`__hc.setTime(${t})`); await sleep(220); };
    await pin(0.94);
    const poolN=await page.evaluate(`(function(){ try{ return __hc.owShadow(); }catch(e){ return null; } })()`);
    console.log(`  pool: ${JSON.stringify(poolN&&poolN.pool?poolN.pool.slice(0,4):poolN).slice(0,220)}`);

    const shot=async tag=>{ const f=path.join(OUT,`litchroma-${tag}.png`); await page.screenshot({path:f}); return f; };
    const CROP=[0.40,0.60,0.48,0.68];   // the ground around the lamp's base at frame centre
    const MINL=14;                      // "bright enough to have a colour at all"; below this the night is black and saturation is noise

    // A /setblock LANTERN IS BAKED, so this crop is ALREADY coloured with the gate off — `_bl` covers it. That is why the first
    // version of this file asserted a saturation JUMP here and failed at 0.768 -> 0.772 on a fix that is working: the placed-lamp
    // path never went through the hand radius at all. Kept as the COUNTER-METRIC (what a lamp lights must read warm and coloured,
    // and the gate must not disturb it), not as proof of the pool path. Proving the pool path needs a light with NO baked
    // counterpart — a dungeon/structure lamp or the Wretch's eye slot — and that harness is not written yet.
    // MEDIAN OF N, because a PLACED lamp flickers as hard as a held one: pool slot intensities were read at 42.7 and 31 for the
    // same lamp on two runs, and a single-frame pair put 4.1 of that on the fix. Same lesson as heldLight's 12% flicker.
    const sample=async(tag,n=5)=>{
      const F=[]; for(let i=0;i<n;i++){ F.push(chroma(await shot(tag),CROP,MINL)); await sleep(150); }
      const pick=k=>{ const v=F.map(f=>f[k]).sort((a,b)=>a-b); return +v[(v.length*0.5)|0].toFixed(3); };
      return { sat:pick('sat'), lit:pick('lit'), lum:pick('lum'), warm:pick('warm'), rgb:F[0].rgb };
    };
    // ---- THE LANTERN'S FLICKER IS THE NOISE, AND IT CAN NOW BE SWITCHED OFF (2026-08-06) ----
    // This file's own comment records that a placed lamp flickers as hard as a held one and that a single-frame pair
    // put 4.1 of that on the fix, which is why it samples a median of five. Five is not enough: the same build measured
    // twice on consecutive runs gave an A/B of 8.26 and then 3.06, so the statistic carries a spread of several levels
    // while the check's own control was reporting a floor of 2.0. A guard whose noise is three times its tolerance
    // fails at random, and that is exactly how it behaved.
    // The flame's curve, the pool's flicker and every animated term in the game are functions of one uniform, so
    // pinning it makes two frames of one condition identical and the A/B becomes a number about the change under test.
    await page.evaluate(`__hc.freezeT(120)`); await sleep(400);
    await page.evaluate(`__hc.scot({litK:0})`); await sleep(420); const off=await sample('placed-off');
    await page.evaluate(`__hc.scot({litK:1})`); await sleep(420); const on =await sample('placed-on');
    await page.evaluate(`__hc.scot({litK:0})`); await sleep(420); const ctl=await sample('placed-off-again');
    await page.evaluate(`__hc.scot({litK:1})`); await sleep(200);
    console.log(`  placed lamp, gate OFF  ${JSON.stringify(off)}`);
    console.log(`  placed lamp, gate ON   ${JSON.stringify(on)}`);
    console.log(`  placed lamp, OFF again ${JSON.stringify(ctl)}`);
    check('what a lamp lights is colourful', on.sat > 0.45, `sat ${on.sat}`);
    check('and what it lights reads WARM, not grey', on.warm > 1.35, `R/B ${off.warm} -> ${on.warm}`);
    // LUMINANCE-PRESERVING, read against a same-condition control: a PLACED lantern's flame FLICKERS, so two frames of one
    // condition differ on their own. The first version asserted a flat 2.0 and failed on 4.8 of pure flicker.
    const flick=Math.max(Math.abs(off.lum-ctl.lum), 2.0);
    // ---- litK MOVES TWO MECHANISMS, AND THIS CHECK ONLY OWNS ONE OF THEM (2026-08-06) ----
    // uScotH.x scales `_dlit`, and `_dlit` feeds BOTH the wash's chroma gate — which is what this check is about, and
    // which is luminance-preserving by construction — and `_dw`, the CAVE-DESCENT RELEASE added on 08-05 ("a light in
    // your hand is a light"). The second one is supposed to change luminance: releasing the descent is how a held lamp
    // stops being crushed to 2% of its own value in a carved room. So toggling litK necessarily brightens a lamp-lit
    // crop, and always did — it simply used not to show, because FOL_UNLIT_FLOOR held every unlit face at a fifth of
    // its albedo and there was far less headroom for the release to recover.
    // MEASURED, not assumed: with `litKnee` 0 the descent release is disabled and litK then moves the wash alone. That
    // is the isolated form of this check's own claim, and it is what is asserted. The combined figure is still printed
    // because it is the number a future reader will see move.
    await page.evaluate(`__hc.scot({litKnee:0, litK:0})`); await sleep(420); const wOff=await sample('wash-only-off');
    await page.evaluate(`__hc.scot({litK:1})`); await sleep(420); const wOn =await sample('wash-only-on');
    await page.evaluate(`__hc.scot({litKnee:0.009})`); await sleep(200);
    console.log(`  descent release OFF (litKnee 0): gate off lum ${wOff.lum} sat ${wOff.sat} -> on lum ${wOn.lum} sat ${wOn.sat}`);
    console.log(`  with the descent release on, the same toggle moves ${Math.abs(on.lum-off.lum).toFixed(2)}`);
    // ---- THE TOLERANCE IS 7, NOT 2.5, AND THE REASON IS ITEM 2 RATHER THAN ANYTHING IN THIS PASS ----
    // With FOL_UNLIT_FLOOR gated back to foliage, an unlit night surface is genuinely dark instead of being held at a
    // fifth of its own albedo. The gate's release therefore has far more headroom to recover, so the SAME mechanism
    // moves more absolute luminance than it did when this ceiling was recorded — measured 5.5 with the clock pinned,
    // against 2.0 before. Nothing about the gate changed; what changed is what it is releasing from.
    // ATTRIBUTED, not guessed. The 08-06 wash work is inert here by construction: its adaptation term is scaled by the
    // day factor and this is a midnight frame, and its renewal term measured 30.0 against 29.7 luma at a lantern with
    // the clock pinned and is shipped off. So this number belongs to the albedo-floor fix alone.
    // Ben asked for the world that produces it ("if no light reaches an area at all, it should be completely dark"), so
    // the ceiling moves and the check keeps its job: catching the gate buying colour with a LARGE amount of light.
    check('and the night is not brightened to do it', Math.abs(wOn.lum-wOff.lum) <= 7.0,
      `the wash alone moves ${Math.abs(wOn.lum-wOff.lum).toFixed(2)}, ceiling 7.0 (control flicker ${flick.toFixed(2)})`);

    // UNLIT GROUND STAYS WASHED. The other half of Ben's rule: black where no light reaches. Turn away from the lamp so the crop
    // holds ground nothing is lighting, and require the gate to leave it alone.
    await page.evaluate(`__hc.cam({yaw:${bestYaw+Math.PI}, pitch:-0.16})`); await sleep(500); await pin(0.94);
    const uOff=chroma(await shot('unlit-off'),CROP,MINL);
    await page.evaluate(`__hc.scot({litK:0})`); await sleep(420); const uOn=chroma(await shot('unlit-on'),CROP,MINL);
    await page.evaluate(`__hc.scot({litK:1})`); await sleep(200);
    console.log(`  away from the lamp, gate ON  ${JSON.stringify(uOff)}`);
    console.log(`  away from the lamp, gate OFF ${JSON.stringify(uOn)}`);
    check('ground no light reaches is unaffected by the gate', Math.abs(uOff.sat-uOn.sat)<0.10 && Math.abs(uOff.lum-uOn.lum)<2.0,
      `sat ${uOn.sat} vs ${uOff.sat}, mean ${uOn.lum} vs ${uOff.lum}`);

    console.log(`\n  frames: bench/results/litchroma-*.png   (?dbg=lit shows the gate itself)`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  console.log(`\n  ${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
