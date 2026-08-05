// WHY IS THE SCARECROW BLACK, and are the "random dark blocks on the forest floor" the same fault?
// Ben, 08-05: "the scarecrow that spawns near spawn ... RIGHT NOW it is completely black, and I think its the same thing
// causing random dark/black blocks all over the forest floor".
// Three questions, all answered from inside the page rather than from a screenshot:
//   1. is any ATLAS TILE itself black — mean RGB per tile, so a mispainted tile names itself;
//   2. what do the scarecrow's own materials carry — map present, and the mean colour of the map's canvas;
//   3. what does it look like in the world, lit, at noon.
//   node bench/tmp-black-scarecrow.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  fs.mkdirSync(OUT,{recursive:true});
  let browser=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const ctx=await browser.newContext({viewport:{width:1000,height:560},deviceScaleFactor:1});
    const page=await ctx.newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`, null, {timeout:180000});
    await page.waitForFunction(`(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()`, null, {timeout:240000});
    // ---- 1. EVERY ATLAS TILE'S MEAN, over its opaque texels only. A tile painted colour-at-alpha-0 has a fine mean and a
    //         tile that is genuinely black does not, so the alpha is reported beside it.
    const tiles=await page.evaluate(`__hc.atlasLuma()`);
    const dark=tiles.filter(t=>t.lum<16);
    console.log(`  ${tiles.length} atlas tiles; ${dark.length} with an opaque-texel luma under 16:`);
    for(const t of dark) console.log(`    ${t.tile.padEnd(22)} lum ${String(t.lum).padStart(6)}  meanAlpha ${String(t.alpha).padStart(6)}  opaqueFrac ${t.opaqueFrac}`);
    console.log(`  the ten darkest: ${tiles.slice(0,10).map(t=>t.tile+' '+t.lum).join(', ')}`);
    // ---- 2. THE SCARECROW'S OWN MATERIALS, built the way the mesher builds it.
    const sc=await page.evaluate(`__hc.modelMats('scarecrow')`);
    console.log(`  scarecrow: ${sc.meshes} meshes`);
    for(const m of sc.mats) console.log(`    ${m.type} color ${m.color} map ${m.hasMap?JSON.stringify(m.map):'NONE'}`);
    // ---- 3. IN THE WORLD, AT NOON. Place one in front of the camera on the ground and photograph it.
    const S=await page.evaluate(`__hc.st()`);
    await page.evaluate(`__hc.lock(true); __hc.pinScene(); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on');`);
    const place=await page.evaluate(`(()=>{ const st=__hc.st(); const gx=st.sx+3, gz=st.sz;
      let gy=null; for(let y=120;y>0;y--){ if(__hc.blockAt(gx,y,gz)!==0){ gy=y+1; break; } }
      __hc.tpAt(st.sx+0.5, gy+1.6, st.sz+0.5);
      __hc.cmdRun('/setblock '+gx+' '+gy+' '+gz+' scarecrow');
      return { gx, gy, gz, id:__hc.blockAt(gx,gy,gz), want:__hc.bid('scarecrow') }; })()`);
    console.log(`  placed ${JSON.stringify(place)}`);
    await sleep(1200);
    const aim=await page.evaluate(`(()=>{ const p=__hc.pos(); const dx=${place.gx}+0.5-p.x, dz=${place.gz}+0.5-p.z, dy=${place.gy}+1.0-p.y;
      const yaw=Math.atan2(-dx,-dz), pitch=Math.atan2(dy, Math.hypot(dx,dz)); __hc.cam({yaw,pitch});
      return {yaw:+yaw.toFixed(3), pitch:+pitch.toFixed(3)}; })()`);
    // THE TORSO IS THE MEASUREMENT, NOT THE FRAME. The body sits just under the hat brim, which is what shadows it, so the
    // crop is a narrow box below the block centre — and the reference is a crop of the shaded canopy beside it, because the
    // claim is not "the scarecrow is bright enough" but "the scarecrow is as lit as the shade it stands in".
    const { decodePNG }=await import('./pngprobe.mjs');
    const crop=(file,cx,cy,w,h)=>{ const P=decodePNG(fs.readFileSync(file)); let s=0,n=0,blk=0;
      for(let y=cy;y<cy+h;y++) for(let x=cx;x<cx+w;x++){ const i=(y*P.w+x)*P.ch; const l=0.2126*P.data[i]+0.7152*P.data[i+1]+0.0722*P.data[i+2];
        s+=l; n++; if(l<8) blk++; }
      return { mean:+(s/n).toFixed(2), blackFrac:+(blk/n).toFixed(3) }; };
    for(const [tag,t] of [['noon',0.25],['dusk',0.47],['night',0.75]]){
      await page.evaluate(`__hc.setTime(${t})`); await sleep(700); await page.evaluate(`__hc.setTime(${t})`); await sleep(400);
      const rows=[];
      for(const [label,set] of [['off',`__hc.propFill({on:false})`],['k=0.078',`__hc.propFill({k:0.078})`],['k=0.16',`__hc.propFill({k:0.16})`],['k=0.30',`__hc.propFill({k:0.30})`]]){
        await page.evaluate(set); await sleep(260); await page.evaluate(`__hc.setTime(${t})`); await sleep(180);
        const f=path.join(OUT,`scarecrow-${tag}-${label}.png`); await page.screenshot({path:f});
        const s=await page.evaluate(`__hc.screenOf(${place.gx}+0.5,${place.gy}+1.0,${place.gz}+0.5)`);
        const px=(s&&s.px|0)||500, py=(s&&s.py|0)||454;
        const body=crop(f, px-14, py-14, 28, 34);                 // torso + head, under the brim
        const shade=crop(f, px+90, py-10, 60, 40);                // the canopy beside it, in the same shade
        rows.push(`${label.padEnd(8)} body ${String(body.mean).padStart(6)} (black ${body.blackFrac})   canopy beside it ${shade.mean}`);
      }
      console.log(`  ${tag}:`); for(const r of rows) console.log(`    ${r}`);
    }
    await page.evaluate(`__hc.propFill({k:0.078})`);
    console.log(`  aim ${JSON.stringify(aim)}; frames bench/results/scarecrow-*.png`);
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
