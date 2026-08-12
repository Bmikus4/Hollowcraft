// DID PER-CORNER SKY PUT THE BLACK TEXELS THERE? (Ben, 08-11 19:51: "the black voxels are absolutely
// everywhere, full regression", plus "half of the surfaces in game are completely matted".)
//
// The step-1 bench measured ONE crop at ONE quad and reported the cost as a night-canopy 0.889% -> 3.145%.
// That was true and it was not representative: the vantage was chosen to contain the worst STEPPING, which
// is not where the worst BLACK is. This harness measures what Ben is looking at instead — a wood, at eye
// height, over several bearings — and reports pure black as a share of the frame, plus how FLAT the
// surfaces are, because "matted" is a texture-contrast complaint and needs its own number.
//
// FLATNESS: the standard deviation of luminance inside small tiles, averaged. A textured dirt face has
// texel-to-texel variation; a face whose lighting has crushed or washed it reads uniform. This separates
// "matted" from "dark", which luminance alone cannot.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench/results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function findBrowser(){ const c=[process.env.HC_CHROME,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean);
  for(const p of c) if(fs.existsSync(p)) return p; return undefined; }
const waitHttp=(url)=>new Promise((res,rej)=>{ let n=0; const t=setInterval(()=>{ http.get(url,r=>{ r.destroy(); clearInterval(t); res(); }).on('error',()=>{ if(++n>200){ clearInterval(t); rej(new Error('no server')); } }); },500); });

function metrics(png, box){
  const {w:W,h:H,ch,data}=png;
  const x0=Math.round(box[0]*W), x1=Math.round(box[1]*W), y0=Math.round(box[2]*H), y1=Math.round(box[3]*H);
  let n=0, black=0, near=0, sum=0; const lum=[];
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
    const i=(y*W+x)*ch, r=data[i],g=data[i+1],b=data[i+2];
    const L=0.2126*r+0.7152*g+0.0722*b; lum.push(L); sum+=L; n++;
    if(r===0&&g===0&&b===0) black++;
    if(L<4) near++;
  }
  // ISOLATED black: a pure-black pixel with a clearly lit neighbour is the speckle Ben photographs; a black
  // REGION is just an unlit surface. This is the metric that separates the two.
  let iso=0;
  for(let y=y0+1;y<y1-1;y++) for(let x=x0+1;x<x1-1;x++){
    const i=(y*W+x)*ch; if(data[i]||data[i+1]||data[i+2]) continue;
    let bright=0;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const j=((y+dy)*W+(x+dx))*ch;
      const L=0.2126*data[j]+0.7152*data[j+1]+0.0722*data[j+2]; if(L>10) bright++; }
    if(bright>=1) iso++;
  }
  // FLATNESS: mean per-tile standard deviation over 8x8 tiles. Low = matted.
  let sdSum=0, tiles=0;
  for(let ty=y0;ty+8<=y1;ty+=8) for(let tx=x0;tx+8<=x1;tx+=8){
    let s=0,s2=0;
    for(let y=ty;y<ty+8;y++) for(let x=tx;x<tx+8;x++){ const i=(y*W+x)*ch;
      const L=0.2126*data[i]+0.7152*data[i+1]+0.0722*data[i+2]; s+=L; s2+=L*L; }
    const m=s/64, v=Math.max(0,s2/64-m*m); sdSum+=Math.sqrt(v); tiles++;
  }
  return { pureBlack:+(100*black/n).toFixed(3), isoBlack:+(100*iso/n).toFixed(3),
           nearBlack:+(100*near/n).toFixed(2), med:+([...lum].sort((a,b)=>a-b)[lum.length>>1]).toFixed(2),
           mean:+(sum/n).toFixed(2), texSD:+(sdSum/Math.max(1,tiles)).toFixed(2) };
}

(async()=>{
  const PORT=+(process.env.HC_PORT||8123), base='http://127.0.0.1:'+PORT;
  await waitHttp(base+'/index.html');
  const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
  const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
  await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
  const page=await ctx.newPage(); const errs=[];
  page.on('pageerror',e=>{ errs.push(String(e.message||e)); console.log('  PAGEERROR:',String(e.message||e).slice(0,200)); });
  page.on('console',m=>{ const t=m.text(); if(/ERROR: \d|GL_INVALID|shader|compil|link/i.test(t)){ errs.push(t); console.log('  GLSL:',t.slice(0,600)); } });
  await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
  await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
  for(let i=0;i<200;i++){ if(await page.evaluate(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`)) break; await sleep(1000); }
  await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.holdNone();`);
  for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
  await page.evaluate(`__hc.freezeT(0)`); await sleep(1200);

  // A WOOD, not a beach. Walk out from spawn to a spot with real canopy overhead and trunks around, which
  // is what the screenshots show; a crop of open shore would contain none of the fault.
  const site=await page.evaluate(`(()=>{ const SX=Math.round(__hc.st().sx), SZ=Math.round(__hc.st().sz);
    const cand=[];
    for(let ox=-60;ox<=60;ox+=6) for(let oz=-60;oz<=60;oz+=6){
      const x=SX+ox, z=SZ+oz, gy=__hc.groundY(x,z); if(gy<44) continue;
      let cover=0, trunk=0;
      for(let y=gy+2;y<=gy+14;y++) if(__hc.blockAt(x,y,z)>0) cover++;
      for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) if(__hc.blockAt(x+dx,gy+3,z+dz)>0) trunk++;
      if(__hc.blockAt(x,gy+1,z)>0) continue;   // must be able to stand here
      cand.push({x,z,gy,cover,trunk,score:cover*3+trunk});
    }
    cand.sort((a,b)=>b.score-a.score); return cand[0]||null; })()`);
  if(!site){ console.log('  no wooded site found'); await browser.close(); process.exit(2); }
  console.log(`  wood at ${site.x},${site.gy},${site.z} — ${site.cover} covered cells overhead, ${site.trunk} solid in a 9x9 at head height`);

  const CROP=[0.10,0.90,0.10,0.86];
  const rows=[];
  const shoot=async(tag)=>{ const p=path.join(OUT,'blacktex-'+tag+'.png'); await page.screenshot({path:p}); return metrics(decodePNG(fs.readFileSync(p)),CROP); };
  const run=async(mode,t,bearing,tag)=>{
    await page.evaluate(`__hc.skySmooth(${mode})`);
    for(let i=0;i<40;i++){ const f=await page.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await page.evaluate(`__hc.tpAt(${site.x}+0.5, ${site.gy}+1.6, ${site.z}+0.5); __hc.cam({yaw:${bearing}, pitch:-0.12});`);
    await page.evaluate(`__hc.setTime(${t})`); await sleep(500); await page.evaluate(`__hc.setTime(${t})`); await sleep(700);
    const m=await shoot(tag);
    rows.push({tag,mode,t,bearing,m});
    console.log(`  ${tag.padEnd(26)} ${JSON.stringify(m)}`);
  };

  // Interleaved off/on/off at two clocks and two bearings — never blocked (the cooling fan).
  for(const [tname,t] of [['dusk',0.46],['noon',0.25]]){
    for(const [bname,b] of [['b0',0],['b2',2.1]]){
      await run(0, t, b, `${tname}-${bname}-off`);
      await run(1, t, b, `${tname}-${bname}-on`);
    }
  }
  await run(0, 0.46, 0, 'dusk-b0-off-again');

  console.log('');
  const g=t=>rows.find(r=>r.tag===t);
  const nf=Math.abs(g('dusk-b0-off').m.isoBlack - g('dusk-b0-off-again').m.isoBlack);
  console.log(`  NOISE FLOOR (off vs off again): isoBlack ${nf.toFixed(3)}  pureBlack ${Math.abs(g('dusk-b0-off').m.pureBlack-g('dusk-b0-off-again').m.pureBlack).toFixed(3)}`);
  console.log('  per-corner sky OFF -> ON, in a wood:');
  for(const [tname] of [['dusk'],['noon']]) for(const bname of ['b0','b2']){
    const o=g(`${tname}-${bname}-off`), n=g(`${tname}-${bname}-on`); if(!o||!n) continue;
    console.log(`    ${tname}/${bname}  pureBlack ${o.m.pureBlack} -> ${n.m.pureBlack}   isoBlack ${o.m.isoBlack} -> ${n.m.isoBlack}   texSD ${o.m.texSD} -> ${n.m.texSD}   med ${o.m.med} -> ${n.m.med}`);
  }
  console.log(`  page/GLSL errors: ${errs.length}`);
  console.log('  frames: bench/results/blacktex-*.png');
  fs.writeFileSync(path.join(OUT,'blacktex.json'), JSON.stringify(rows,null,1));
  await browser.close();
})();
