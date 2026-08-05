// A CRIMSON TORCH LIGHTS ITS ALCOVE RED, AND A LANTERN STILL LIGHTS ITS OWN AMBER.
//
// Plan §4 item 9. The block-light volume carried INTENSITY only — one byte a cell — and the shader multiplied it by a single
// hard-coded vec3(3.6,1.95,0.80). So every emitter in the game cast the same orange: the shrine's red_torch had a red flame and
// lit the stone around it exactly like a kitchen candle, and the industrial hanging lights could not read cold.
//
// The level stays ONE BYTE a cell and the colour is per CHUNK: the flood carries a palette index per cell, and the chunk's dominant
// emitter colour — weighted by the light each one actually delivers, so a dim candle cannot outvote a shrine — rides on the light
// texture into a per-clone uniform. Written first as per-cell RGBA radiance, which is exactly right and four times the upload
// (128 KB a chunk against 32, 37 MB of texture at rd 8 against 9.5), paid in the `stream` scope of every walk — the one scope this
// game is already over budget in. What the cheap form gives up is a chunk holding two DIFFERENT-coloured lights, which takes the
// stronger one's colour for both; lights are grouped by what they are, so that is rare, and being exact about it costs 4x on every
// chunk in the world.
//
// TWO CLAIMS, and the second is the one that protects everything already shipped:
//   1. the stone around a red_torch is measurably RED-SHIFTED against the same stone around a lantern;
//   2. a lantern's own light is UNCHANGED, by construction rather than by tuning: LIGHT_PAL[0] is the old constant divided by 3.6
//      and the shader multiplies by 3.6 again, so a torch, a candle and a campfire come out where they were. The check holds the
//      lantern wall's channel ratios against that palette entry — not against a remembered frame, which does not exist.
//
// Both alcoves are built by /setblock in the AIR at y=96, for the reason assert-directional-sky records: built on the hillside,
// the terrain rises through the floor and the crops read grass instead of stone. Above CFG.WORLD_H (128) /setblock silently does
// nothing at all.
//
//   node bench/assert-coloured-light.mjs
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
// The claim is about HUE, so the statistic is the channel ratio, not luminance: a red light and a warm light of the same
// brightness differ only in how much green and blue they carry. The emitter's own pixels are excluded by cropping beside it.
function hue(file,c){
  const P=decodePNG(fs.readFileSync(file));
  const x0=(P.w*c[0])|0,x1=(P.w*c[1])|0,y0=(P.h*c[2])|0,y1=(P.h*c[3])|0;
  let R=0,G=0,B=0,n=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*P.w+x)*P.ch; R+=P.data[i]; G+=P.data[i+1]; B+=P.data[i+2]; n++; }
  R/=n; G/=n; B/=n;
  return { rgb:[+R.toFixed(2),+G.toFixed(2),+B.toFixed(2)], gr:+(G/Math.max(R,0.01)).toFixed(4), br:+(B/Math.max(R,0.01)).toFixed(4),
           lum:+(0.2126*R+0.7152*G+0.0722*B).toFixed(2) };
}
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null, fails=0, checks=0; const errs=[];
  const check=(n,ok,d)=>{ checks++; if(!ok)fails++; console.log((ok?'  PASS  ':'  FAIL  ')+n+(d!==undefined?'   '+d:'')); };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,160)); });
    const PAGE='/'+String(process.env.HC_PAGE||'index.html').replace(/^\/+/,'');
    await page.goto(base+PAGE+'?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:180000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const S=await page.evaluate(`__hc.st()`);
    const FY=96, BZ=Math.round(S.sz), BX=Math.round(S.sx)+8;
    // A SEALED STONE CELL, so nothing but the block light is in the frame. Two of them, 24 blocks apart so neither light reaches
    // the other: one holds a lantern, one a red_torch. Both lights sit on the floor at the far end, out of the crop.
    const build=async(x0)=>page.evaluate(`(()=>{
      for(let dx=-1;dx<=9;dx++) for(let dz=-4;dz<=4;dz++) for(const y of [${FY}, ${FY}+6]) __hc.cmdRun('/setblock '+(${x0}+dx)+' '+y+' '+(${BZ}+dz)+' stone');
      for(let dz=-4;dz<=4;dz++) for(let y=${FY}+1;y<${FY}+6;y++){ __hc.cmdRun('/setblock '+(${x0}+9)+' '+y+' '+(${BZ}+dz)+' stone'); __hc.cmdRun('/setblock '+(${x0}-1)+' '+y+' '+(${BZ}+dz)+' stone'); }
      for(let dx=-1;dx<=9;dx++) for(let y=${FY}+1;y<${FY}+6;y++){ __hc.cmdRun('/setblock '+(${x0}+dx)+' '+y+' '+(${BZ}-4)+' stone'); __hc.cmdRun('/setblock '+(${x0}+dx)+' '+y+' '+(${BZ}+4)+' stone'); }
    })()`);
    await build(BX); await build(BX+24);
    await page.evaluate(`__hc.cmdRun('/setblock ${BX+7} ${FY+1} ${BZ} lantern')`);
    await page.evaluate(`__hc.cmdRun('/setblock ${BX+31} ${FY+1} ${BZ} red_torch')`);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2200);
    const ids=await page.evaluate(`[__hc.blockAt(${BX+7},${FY+1},${BZ}), __hc.bid('lantern'), __hc.blockAt(${BX+31},${FY+1},${BZ}), __hc.bid('red_torch')]`);
    check('both lights are in the world', ids[0]===ids[1] && ids[2]===ids[3], `lantern ${ids[0]}/${ids[1]}, red_torch ${ids[2]}/${ids[3]}`);
    const pin=async t=>{ await page.evaluate(`__hc.setTime(${t})`); await sleep(450); await page.evaluate(`__hc.setTime(${t})`); await sleep(200); };
    await pin(0.75);   // midnight, so no skylight leaks into the claim through the walls' _sskyOpen lateral rule
    // Stand at the near end looking down the cell: the crop is the SIDE WALL beside the light, never the light itself.
    const look=async(x0,tag)=>{
      await page.evaluate(`__hc.tpAt(${x0}+1.5, ${FY}+3.0, ${BZ}+0.5)`); await sleep(600);
      await page.evaluate(`__hc.cam({yaw:-1.5708, pitch:0.0})`); await sleep(350); await pin(0.75);
      const f=path.join(OUT,`collight-${tag}.png`); await page.screenshot({path:f}); return f; };
    const fl=await look(BX,'lantern'), fr=await look(BX+24,'redtorch');
    const WALL=[0.10,0.34,0.34,0.62];   // the left-hand wall, well off the light at frame centre
    const L=hue(fl,WALL), R=hue(fr,WALL);
    console.log(`  lantern cell wall  rgb ${JSON.stringify(L.rgb)}  G/R ${L.gr}  B/R ${L.br}  lum ${L.lum}`);
    console.log(`  red_torch cell wall rgb ${JSON.stringify(R.rgb)}  G/R ${R.gr}  B/R ${R.br}  lum ${R.lum}`);
    // 1. THE SHRINE TORCH IS RED. Its light has to carry markedly less green and blue per unit red than the lantern's does.
    check('the crimson torch tints its cell red', R.gr < L.gr*0.75 && R.br < L.br*0.85, `G/R ${L.gr} -> ${R.gr}, B/R ${L.br} -> ${R.br}`);
    check('and it is still a LIGHT, not a black hole', R.lum > 6, `lum ${R.lum}`);
    // 2. THE WARM LIGHTS DID NOT MOVE. The number to hold is LIGHT_PAL[0] itself — (1, 0.5417, 0.2222), the old
    // vec3(3.6,1.95,0.80) divided by 3.6 — because the shader multiplies by 3.6 again, so a torch, a candle and a campfire come
    // out where they were. The lantern wall measures G/R 0.5811 and B/R 0.2633 rather than exactly those: the wall also carries
    // the night ambient and the grade's own warm-highlight split-tone, neither of which is block light. What this guards is drift
    // away from that pair — someone "tidying" the decimals, or normalising the hue after the falloff curve instead of before.
    check('a lantern still lights amber, unchanged', Math.abs(L.gr-0.5417)<0.06 && Math.abs(L.br-0.2222)<0.05, `G/R ${L.gr} against the palette's 0.5417, B/R ${L.br} against 0.2222`);
    // 3. AND THE LEVEL CURVE IS UNTOUCHED. ?dbg=bl renders the sampled intensity, which is now the volume's largest channel: a
    // crimson light's own cells must still read a high level, or the falloff has been quietly scaled by the tint.
    const p2=await ctx.newPage();
    await p2.goto(base+PAGE+'?debug=1&rd=8&dbg=bl',{waitUntil:'load',timeout:120000});
    await p2.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:180000});
    await p2.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    await p2.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const build2=async(x0)=>p2.evaluate(`(()=>{
      for(let dx=-1;dx<=9;dx++) for(let dz=-4;dz<=4;dz++) for(const y of [${FY}, ${FY}+6]) __hc.cmdRun('/setblock '+(${x0}+dx)+' '+y+' '+(${BZ}+dz)+' stone');
      for(let dz=-4;dz<=4;dz++) for(let y=${FY}+1;y<${FY}+6;y++){ __hc.cmdRun('/setblock '+(${x0}+9)+' '+y+' '+(${BZ}+dz)+' stone'); __hc.cmdRun('/setblock '+(${x0}-1)+' '+y+' '+(${BZ}+dz)+' stone'); }
      for(let dx=-1;dx<=9;dx++) for(let y=${FY}+1;y<${FY}+6;y++){ __hc.cmdRun('/setblock '+(${x0}+dx)+' '+y+' '+(${BZ}-4)+' stone'); __hc.cmdRun('/setblock '+(${x0}+dx)+' '+y+' '+(${BZ}+4)+' stone'); }
    })()`);
    await build2(BX); await build2(BX+24);
    await p2.evaluate(`__hc.cmdRun('/setblock ${BX+7} ${FY+1} ${BZ} lantern')`);
    await p2.evaluate(`__hc.cmdRun('/setblock ${BX+31} ${FY+1} ${BZ} red_torch')`);
    for(let i=0;i<40;i++){ const f=await p2.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await sleep(2000);
    const look2=async(x0,tag)=>{ await p2.evaluate(`__hc.tpAt(${x0}+1.5, ${FY}+3.0, ${BZ}+0.5)`); await sleep(500);
      await p2.evaluate(`__hc.cam({yaw:-1.5708, pitch:0.0})`); await sleep(350);
      const f=path.join(OUT,`colight-bl-${tag}.png`); await p2.screenshot({path:f}); return f; };
    const bl=hue(await look2(BX,'lantern'),WALL), br=hue(await look2(BX+24,'redtorch'),WALL);
    console.log(`  ?dbg=bl level grey: lantern wall ${bl.lum}   red_torch wall ${br.lum}`);
    // The two are not equal and must not be: a red_torch is light level 12 against a lantern's 15, so the levels should sit at
    // about that ratio (measured 133.1/173.5 = 0.77 against 12/15 = 0.80). What would fail here is the TINT leaking into the
    // falloff — a crimson light reading 0.16 of a warm one, which is what happens if the curve is applied to the raw radiance
    // instead of to its largest channel.
    check('the sampled LEVEL follows the light level, not the tint', Math.abs((br.lum/Math.max(bl.lum,0.01)) - 12/15) < 0.15,
          `${bl.lum} vs ${br.lum} = ${(br.lum/Math.max(bl.lum,0.01)).toFixed(3)}, against the levels' own 0.80`);
    check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    console.log('  frames: bench/results/colight-*.png, colight-bl-*.png');
    console.log(`\n${checks-fails}/${checks} checks pass`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
