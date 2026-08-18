// BEN'S OWN VANTAGE FOR THE HORIZON PINES: standing on the ground at the shore, at eye height, looking straight out
// to sea, on all four sides of the island. Seven rejections have been judged from the air or from a crop chosen to
// show the band; this stands where he stands and reports, per side, the distance to the LAST LAND BLOCK on that
// bearing next to the band's own drawn extent in the frame, in pixels.
//
//   node bench/tmp-pines-shore4.mjs [--set '{"d":900,"h":225}'] [--tag before] [--hours]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const argv=process.argv.slice(2);
const SET=(()=>{ const i=argv.indexOf('--set'); return i<0?null:argv[i+1]; })();
const TAG=(()=>{ const i=argv.indexOf('--tag'); return i<0?'now':argv[i+1]; })();
const HOURS=argv.includes('--hours')?[['noon',0.25],['night',0.75]]:[['noon',0.25]];
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// One row of the frame at a time: its median level and its mean green dominance. Read off the PNG on the page's own
// canvas so the numbers and the photograph cannot come from different frames.
async function rowStats(page,file){
  const buf=fs.readFileSync(file).toString('base64');
  return await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
    await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
    const g=c.getContext('2d'); g.drawImage(im,0,0); const out=[];
    for(let y=0;y<im.height;y++){ const d=g.getImageData(0,y,im.width,1).data; const a=[]; let gs=0;
      for(let i=0;i<d.length;i+=4){ a.push(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]); gs+=d[i+1]-(d[i]+d[i+2])/2; }
      a.sort((p,q)=>p-q); out.push({l:+a[a.length>>1].toFixed(2), g:+(gs/(d.length/4)).toFixed(2)}); }
    return out; })()`);
}

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await ctx.addInitScript(()=>{ try{ localStorage.setItem('hollowcraft_grain','0'); }catch(e){} });
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:300000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`,null,{timeout:420000});
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.freezeT(0);`);
    if(SET) await page.evaluate(`__hc.pines(true, ${SET})`);
    console.log('  pines', JSON.stringify(await page.evaluate('__hc.pines()')));
    const IC=await page.evaluate('__hc.isleStats()'); const SEA=await page.evaluate('__hc.island().sea');
    console.log('  island', JSON.stringify(IC), 'sea', SEA);
    // FOUR SIDES, and the shore on each is FOUND by walking inward from well past the coast until a dry column
    // appears - the outermost dry land on the bearing, which is the waterline itself and not an inland flat.
    const SIDES=[['W',-1,0],['E',1,0],['N',0,-1],['S',0,1]];
    for(const [name,dx,dz] of SIDES){
      const found=await page.evaluate(`(()=>{ const cx=${IC.x}, cz=${IC.z};
        for(let d=Math.round(${IC.R}*2.2); d>30; d-=1){ const x=Math.round(cx+${dx}*d), z=Math.round(cz+${dz}*d);
          if(__hc.groundY(x,z)>${SEA}) return {x,z,g:__hc.groundY(x,z),d}; }
        return null; })()`);
      if(!found){ console.log(`  ${name}: no shore found`); continue; }
      // THE LAST LAND BLOCK ON THE BEARING, from this vantage outward. Ben asked for this number beside the one I chose.
      const last=await page.evaluate(`(()=>{ let far=0;
        for(let s=1; s<3000; s+=2){ const x=Math.round(${found.x}+${dx}*s), z=Math.round(${found.z}+${dz}*s);
          if(__hc.groundY(x,z)>${SEA}) far=s; }
        return far; })()`);
      // TWO LOOKS PER SIDE. Straight out to sea is where a treeline must NOT be, and 70 degrees off it is along the
      // coast, which is where Ben's "the coast extends well beyond the render distance" actually asks for one. Judging
      // only the seaward look reads an empty horizon as a failure; judging only the tangent misses the panel over water.
      for(const [view,off] of [['out',0],['along',70]]){
      const yaw=Math.atan2(-dx,-dz)+off*Math.PI/180;
      await page.evaluate(`__hc.tpAt(${found.x}+0.5, ${found.g}+1, ${found.z}+0.5); __hc.cam({yaw:${yaw}, pitch:0});`);
      for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await sleep(2500);
      for(const [when,t] of HOURS){
        await page.evaluate(`__hc.setTime(${t})`); await sleep(900); await page.evaluate(`__hc.setTime(${t})`); await sleep(500);
        const f=path.join(OUT,`p4-${TAG}-${name}${view==='out'?'':'x'}-${when}.png`); await page.screenshot({path:f});
        const on=await rowStats(page,f);
        // WHERE THE BAND IS IN THE FRAME, measured not eyeballed: with the pines off and on, the rows whose median
        // level moved are the band's own rows, so its top and bottom in pixels are a fact about the two frames.
        await page.evaluate('__hc.pines(0)'); await sleep(700);
        const fo=path.join(OUT,`p4-${TAG}-${name}${view==='out'?'':'x'}-${when}-off.png`); await page.screenshot({path:fo});
        const off=await rowStats(page,fo);
        await page.evaluate('__hc.pines(1)'); await sleep(700);
        let top=-1,bot=-1,moved=0; const green=[];
        for(let y=0;y<on.length;y++){ const dl=Math.abs(on[y].l-off[y].l);
          if(dl>1.2){ if(top<0) top=y; bot=y; moved++; green.push(on[y].g); } }
        const gm=green.length?+(green.reduce((a,b)=>a+b,0)/green.length).toFixed(2):0;
        console.log(`  ${name}-${view} ${when}: shore(${found.x},${found.z}) g=${found.g} lastLand=${last}b  bandRows ${top}..${bot} (${moved}/720)  green ${gm}  -> ${path.basename(f)}`);
      }
      }
    }
    // ---- AND BEN'S OWN FRAME: INSIDE THE FOREST, LOOKING OUT OVER THE CANOPY ----
    // Screenshot 2026-08-18 091325 is taken from high ground inland with the real wood in front of the band, which is the
    // only vantage where "the bands sit well above the real treeline with open sky beneath" can be judged. The spot is
    // FOUND: the highest grass column inside half the island radius, so it is a hill in a wood and not a beach.
    // A WOODED RISE, NOT THE SUMMIT. The first cut of this took the highest column inside half the radius and landed on a
    // mountain peak at y=100, above the haze, with no terrain drawn below it at all - a frame that isolates the band
    // beautifully and cannot show whether the real forest hides its foot, which is the whole question. Ben's frame is
    // taken from a rise INSIDE the wood, so the search wants the highest column in the window a forest occupies.
    const hill=await page.evaluate(`(()=>{ let best=null;
      for(let r=60; r<${IC.R}*0.7; r+=7) for(let k=0;k<48;k++){ const th=k/48*6.2831853;
        const x=Math.round(${IC.x}+Math.cos(th)*r), z=Math.round(${IC.z}+Math.sin(th)*r), g=__hc.groundY(x,z);
        if(g>${SEA}+14 && g<${SEA}+30 && (!best || g>best.g)) best={x,z,g}; }
      return best; })()`);
    if(hill){
      for(const [tag,yaw] of [['f0',0],['f90',Math.PI/2],['f180',Math.PI],['f270',-Math.PI/2]]){
        await page.evaluate(`__hc.tpAt(${hill.x}+0.5, ${hill.g}+1, ${hill.z}+0.5); __hc.cam({yaw:${yaw}, pitch:0});`);
        for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
        await sleep(2500);
        for(const [when,t] of HOURS){
          await page.evaluate(`__hc.setTime(${t})`); await sleep(900); await page.evaluate(`__hc.setTime(${t})`); await sleep(500);
          const f=path.join(OUT,`p4-${TAG}-${tag}-${when}.png`); await page.screenshot({path:f});
          const on=await rowStats(page,f);
          await page.evaluate('__hc.pines(0)'); await sleep(700);
          const fo=path.join(OUT,`p4-${TAG}-${tag}-${when}-off.png`); await page.screenshot({path:fo});
          const off=await rowStats(page,fo);
          await page.evaluate('__hc.pines(1)'); await sleep(700);
          let top=-1,bot=-1,moved=0;
          for(let y=0;y<on.length;y++){ if(Math.abs(on[y].l-off[y].l)>1.2){ if(top<0) top=y; bot=y; moved++; } }
          console.log(`  forest-${tag} ${when}: hill(${hill.x},${hill.z}) g=${hill.g}  bandRows ${top}..${bot} (${moved}/720)  -> ${path.basename(f)}`);
        }
      }
    }
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
