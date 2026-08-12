// THE BLACK BAND ON THE FAR WATER (Ben 08-11: "I still see black blotches in the water from far away").
//
// Backlog item 6 has carried it as "4.3% at the render wall, every pixel with a lit neighbour, unmoved by any
// floor setting", and the frame shows why no floor setting reached it: the black is a NARROW HORIZONTAL BAND
// lying where the meshed chunk water hands over to the painted far-sea disc, not a property of the surface.
//
// FIRST, A NOISE FLOOR, which the seawall harness never had — the resume records the same configuration
// reading 13.7% and 12.8% on two runs because the sea animates. freezeT pins the shader clock so two frames
// of the same scene are identical, and the baseline row is repeated at the end regardless.
//
// THEN, WHOSE PIXELS ARE THEY? Both surfaces use waterMat and are told apart by the vFar attribute, so a
// screenshot cannot separate them. The dials can:
//   · farSeaOn(false)   removes the painted disc. If the band goes, it is the disc's.
//   · waterRefl({amt:0}) flattens the reflection to uRing. If the band goes, it is the reflection lobe.
// One dial per row, everything else restored explicitly (§4 rule 4).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench/results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function findBrowser(){ const c=[process.env.HC_CHROME,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean);
  for(const p of c) if(fs.existsSync(p)) return p; return undefined; }
const waitHttp=(u)=>new Promise((res,rej)=>{ let n=0; const t=setInterval(()=>{ http.get(u,r=>{ r.destroy(); clearInterval(t); res(); }).on('error',()=>{ if(++n>200){ clearInterval(t); rej(new Error('no server')); } }); },500); });

// Where the black actually IS, by screen row — a band is a row range, so the row profile is the diagnosis.
function scan(png, box){
  const {w:W,h:H,ch,data}=png;
  const x0=Math.round(box[0]*W), x1=Math.round(box[1]*W), y0=Math.round(box[2]*H), y1=Math.round(box[3]*H);
  let n=0, black=0, iso=0; const rowBlack=[];
  for(let y=y0;y<y1;y++){ let rb=0, rn=0;
    for(let x=x0;x<x1;x++){ const i=(y*W+x)*ch; rn++; n++;
      if(!data[i]&&!data[i+1]&&!data[i+2]){ black++; rb++;
        let bright=0;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const j=((y+dy)*W+(x+dx))*ch;
          if(j>=0&&j<data.length&&(0.2126*data[j]+0.7152*data[j+1]+0.0722*data[j+2])>10) bright++; }
        if(bright) iso++; } }
    rowBlack.push({y, pct:+(100*rb/Math.max(1,rn)).toFixed(2)}); }
  const hot=rowBlack.filter(r=>r.pct>1);
  return { pureBlack:+(100*black/n).toFixed(3), isoBlack:+(100*iso/n).toFixed(3),
           bandRows:hot.length, bandTop:hot.length?hot[0].y:-1, bandBot:hot.length?hot[hot.length-1].y:-1,
           bandPeak:hot.length?Math.max(...hot.map(r=>r.pct)):0 };
}

(async()=>{
  const PORT=+(process.env.HC_PORT||8123), base='http://127.0.0.1:'+PORT;
  await waitHttp(base+'/index.html');
  const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
  const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
  await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
  const page=await ctx.newPage(); const errs=[];
  page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,180)); });
  page.on('console',m=>{ const t=m.text(); if(/ERROR: \d|GL_INVALID/i.test(t)){ errs.push(t); console.log('  GLSL:',t.slice(0,300)); } });
  await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
  await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
  for(let i=0;i<200;i++){ if(await page.evaluate(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`)) break; await sleep(1000); }
  await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.holdNone();`);
  for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
  await page.evaluate(`__hc.freezeT(0)`); await sleep(1000);

  // THE VANTAGE IS tmp-texel-day's SEAWALL, VERBATIM, because it is the one that provably contains the fault:
  // it reads 4.3-4.7% pure black there, where my own first attempt at a shore found 0.04% and could not tell
  // the band from the noise. Walk WEST from the island centre to sea level, step 4 blocks back onto land,
  // stand 3 above the ground and look east along +x, level.
  const IC=await page.evaluate(`__hc.island()`);
  const site=await page.evaluate(`(()=>{ const c=__hc.island();
    for(let d=40; d<c.R*1.4; d+=2){ const x=(c.cx|0)-d, g=__hc.groundY(x, c.cz|0);
      if(g>0 && g<=c.sea+1){ const bx=x+4, bz=c.cz|0, bg=__hc.groundY(bx,bz);
        // forward is (-sin yaw, -cos yaw), so yaw = atan2(1,-0) looks along +x — tmp-texel-day's own value.
        __hc.tpAt(bx+0.5, bg+3, bz+0.5); __hc.cam({yaw:Math.atan2(1,-0), pitch:-0.02});
        return {x:bx, z:bz, g:bg}; } }
    return null; })()`);
  if(!site){ console.log('  no shore found'); await browser.close(); process.exit(2); }
  console.log(`  seawall ${site.x},${site.g},${site.z} looking east along +x (tmp-texel-day's vantage)`);
  await sleep(1200);

  const rd=await page.evaluate(`__hc.fill()`);
  console.log(`  rd ${rd.rd} -> mesh water reaches ${rd.rd*16} blocks, uMeshR hands over at ${(rd.rd-1)*16}`);

  const CROP=[0.20,0.80,0.47,0.58];   // tmp-texel-day s own seawall crop: a TIGHT horizontal strip on the horizon. A wide crop dilutes a 5-row band into the noise, which is what my first attempt did.
  const rows=[];
  const shoot=async(tag)=>{ const p=path.join(OUT,'waterband-'+tag+'.png'); await page.screenshot({path:p}); return scan(decodePNG(fs.readFileSync(p)),CROP); };
  const restore=async()=>{ await page.evaluate(`__hc.farSeaOn(true); __hc.waterRefl({amt:1, sharp:1, streak:0, fine:0});`); await sleep(500); };
  const run=async(tag, setup)=>{ await restore(); if(setup){ await page.evaluate(setup); } await sleep(800);
    const m=await shoot(tag); rows.push({tag,m}); console.log(`  ${tag.padEnd(22)} ${JSON.stringify(m)}`); return m; };

  await run('base', null);
  await run('nofarsea',  `__hc.farSeaOn(false)`);
  await run('norefl',    `__hc.waterRefl({amt:0})`);
  await run('base-again', null);   // noise floor (§4 rule 3)

  const g=t=>rows.find(r=>r.tag===t).m;
  console.log('');
  console.log(`  NOISE FLOOR (base vs base-again, clock frozen): pureBlack ${Math.abs(g('base').pureBlack-g('base-again').pureBlack).toFixed(3)}  bandPeak ${Math.abs(g('base').bandPeak-g('base-again').bandPeak).toFixed(2)}`);
  console.log(`  base        pureBlack ${g('base').pureBlack}%  band rows ${g('base').bandTop}..${g('base').bandBot} (${g('base').bandRows} rows), peak ${g('base').bandPeak}%`);
  console.log(`  no far sea  pureBlack ${g('nofarsea').pureBlack}%  band rows ${g('nofarsea').bandRows}, peak ${g('nofarsea').bandPeak}%`);
  console.log(`  no refl     pureBlack ${g('norefl').pureBlack}%  band rows ${g('norefl').bandRows}, peak ${g('norefl').bandPeak}%`);
  console.log(`  page/GLSL errors: ${errs.length}`);
  console.log('  frames: bench/results/waterband-*.png');
  fs.writeFileSync(path.join(OUT,'waterband.json'), JSON.stringify(rows,null,1));
  await browser.close();
})();
