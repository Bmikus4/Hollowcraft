// SECTION B, IN ONE PAGE: the red-brown night cast, and the flashlight's lens origin and cone.
// Two questions the brief leaves open (items 2 and 3) that share a vantage — midnight, on open ground — and a
// page load costs 25 seconds, so they run together. The box's cooling fan is failing, so configurations are
// interleaved rather than blocked: the night rows are taken before and after the flashlight work.
//
// THE CAST (6632ee1 / ce535d4). Ben's tell is that the part of the sky FURTHEST from the horizon is the part
// that looks right, so warmth measured band by band from zenith to ground separates the two candidates: a flat
// cast is the grade, a cast that grows toward the horizon is atmospheric. His numbers, empty-handed at midnight
// on the shore, were ground luminance 21 at warmth +0.05; a torch put it at 54/+0.23 and the near-clamp landed
// it at 37/+0.13. The control is the grade neutralised — sat 1, warm 0, temp 0 — because a cast that survives
// that is in the scene and not in the grade, and no amount of grading will be the fix.
//
// THE BEAM. The origin is pushed 0.45 down the beam from a point 0.30 to the side of the eye and 0.18 below it,
// and the direction is the CAMERA's forward — so the hotspot is displaced sideways by a constant 0.30 blocks at
// every range, which is a real handheld light and is large in angle up close and nothing at distance. Against a
// wall at three blocks that is the difference between a beam that lands where you look and one that does not,
// so the measurement is the hotspot's offset from frame centre AND the radial falloff that says whether the
// penumbra is real or a hard disc. `__hc.flashOn` is the only way in: the switch is a keydown behind the
// pointer lock, so every flashlight frame taken before it existed was of an unlit torch.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b64=f=>'data:image/png;base64,'+fs.readFileSync(f).toString('base64');
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

// Zenith-to-ground bands. Decoded from the PNG in the page, never read back off the game's own canvas — that
// buffer is cleared after present and reads all black, which is how two earlier lighting claims measured nothing.
const BANDS=(page,file)=>page.evaluate(async(src)=>{
  const img=await new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.src=src; });
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
  const W=c.width,H=c.height,d=g.getImageData(0,0,W,H).data, out=[];
  for(let b=0;b<6;b++){ const y0=(H*b/6)|0, y1=(H*(b+1)/6)|0; let r=0,gg=0,bb=0,n=0;
    for(let y=y0;y<y1;y++)for(let x=0;x<W;x++){ const i=(y*W+x)*4; r+=d[i]; gg+=d[i+1]; bb+=d[i+2]; n++; }
    r/=n; gg/=n; bb/=n;
    out.push({ lum:+(0.2126*r+0.7152*gg+0.0722*bb).toFixed(1), warmth:+((r-bb)/Math.max(1e-4,r+bb)).toFixed(3) }); }
  return out;
}, b64(file));

// The beam on a wall: where its hotspot sits relative to frame centre, and how it falls off. The profile is the
// penumbra question — a spot with a real soft edge falls smoothly over many rings, a hard disc drops in one.
const BEAM=(page,file)=>page.evaluate(async(src)=>{
  const img=await new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.src=src; });
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
  const W=c.width,H=c.height,d=g.getImageData(0,0,W,H).data;
  const lum=(i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
  // The viewmodel occupies the bottom-right; the wall is the rest. Centroid over the top 70% only, so the lit
  // gun cannot vote for the beam's position — that is the same mistake as measuring the sway and calling it glass.
  let sx=0,sy=0,sw=0,best=0,bx=0,by=0;
  for(let y=0;y<H*0.7;y++)for(let x=0;x<W;x++){ const i=(y*W+x)*4, l=lum(i);
    if(l>best){ best=l; bx=x; by=y; }
    const w=Math.max(0,l-12); sx+=x*w; sy+=y*w; sw+=w; }
  const cx=sw?sx/sw:0, cy=sw?sy/sw:0;
  const prof=[]; for(let r=0;r<9;r++){ const r0=r*40, r1=r0+40; let s=0,n=0;
    for(let y=0;y<H*0.7;y++)for(let x=0;x<W;x++){ const dx=x-cx, dy=y-cy, dd=Math.sqrt(dx*dx+dy*dy);
      if(dd>=r0&&dd<r1){ s+=lum((y*W+x)*4); n++; } }
    if(n) prof.push(+(s/n).toFixed(1)); }
  return { hotspot:[bx,by], peak:+best.toFixed(0), centroid:[+cx.toFixed(0),+cy.toFixed(0)],
           offsetFromCentrePx:[+(cx-W/2).toFixed(0),+(cy-H/2).toFixed(0)], ringsFromCentroid:prof };
}, b64(file));

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1100,height:620}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(9000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.dayLock(0.75)'); await sleep(2500);      // 0.75 IS midnight; 0.95 is near sunrise
    console.log('  tod', JSON.stringify(await page.evaluate('__hc.tod()')).slice(0,220));

    const shot=async(tag)=>{ await sleep(1500); const f=path.join(OUT,'secb-'+tag.replace(/[^a-z0-9-]/gi,'_')+'.png'); await page.screenshot({path:f}); return f; };
    // SETTLE BEFORE READING. Draft 1 of this table read 8.4 then 44.5 then 37.1 luminance for the same
    // configuration: the sky was still arriving. Two consecutive frames whose band-0 luminance agrees within
    // half a level is the gate, and the state that produced each row is printed beside it so a row that moved
    // can be attributed instead of averaged.
    const settle=async(tag)=>{ let prev=null;
      for(let i=0;i<10;i++){ const f=await shot(tag); const b=await BANDS(page,f);
        if(prev!=null && Math.abs(b[0].lum-prev)<0.5) return b; prev=b[0].lum; }
      console.log('    (never settled)'); return null; };
    const night=async(tag,pre)=>{ if(pre) console.log('    set', JSON.stringify(await page.evaluate(pre)).slice(0,150));
      const b=await settle(tag); if(!b) return;
      const s=await page.evaluate('(()=>{const s=__hc.st();return {y:s.py,day:s.day,fps:s.fps};})()');
      console.log('   ', tag.padEnd(22), b.map(x=>String(x.lum).padStart(5)+'/'+String(x.warmth).padStart(6)).join(' '), '  ', JSON.stringify(s)); };

    console.log('\n  === THE RED-BROWN CAST AT MIDNIGHT — lum/warmth, zenith band 0 → ground band 5 ===');
    await page.evaluate('__hc.cam({yaw:0.6,pitch:-0.06})'); await sleep(1500);
    await night('empty hand');
    await night('grade neutral','__hc.grade({sat:1,warm:0,temp:0,vib:0})');
    // `__hc.grade("shipped")` is NOT the restore — it is the pre-nordic look kept for comparison, and setting any
    // dial by hand PINS it against the time-of-day grade. Handing the dials back to the hour is tod({release:1}).
    await night('grade restored','__hc.tod({release:1})');
    await night('empty hand (repeat)');                                 // the baseline row, repeated: thermal drift check

    console.log('\n  === THE FLASHLIGHT ON A WALL AT THREE BLOCKS ===');
    const spot=await page.evaluate(`(function(){
      const p=__hc.probe(); const cx=Math.round(p.x), cz=Math.round(p.z);
      const gy=__hc.groundY(cx,cz);
      for(let dx=-5;dx<=5;dx++) for(let dz=-4;dz<=2;dz++) for(let y=gy+1;y<=gy+6;y++) __hc.cmdRun('/setblock '+(cx+dx)+' '+y+' '+(cz+dz)+' air');
      for(let dx=-5;dx<=5;dx++) for(let y=gy+1;y<=gy+6;y++) __hc.cmdRun('/setblock '+(cx+dx)+' '+y+' '+(cz-4)+' stone');
      return [cx,gy,cz];
    })()`);
    for(let i=0;i<40;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
    // yaw 0 faces -Z (forward is (-sin yaw, -cos yaw)), which is the wall four blocks up-negative-Z
    await page.evaluate(`__hc.tp(${spot[0]}, ${spot[1]+2}, ${spot[2]}, 0, 0)`); await sleep(2500);
    console.log('   ', 'give ar15 + weapon light:', JSON.stringify(await page.evaluate('(__hc.cmdRun("/give ar15"), __hc.fitAtt("light","weapon_light"))')).slice(0,140));
    await sleep(1200);
    const off=await shot('flash-off');
    console.log('    off ', JSON.stringify(await page.evaluate('__hc.flashOn(0)')));
    console.log('        ', JSON.stringify(await BEAM(page,off)));
    console.log('    on  ', JSON.stringify(await page.evaluate('__hc.flashOn(1)')));
    const on=await shot('flash-on');
    console.log('        ', JSON.stringify(await BEAM(page,on)));

    console.log('\n  === and the night rows again, after the beam work (thermal + state drift) ===');
    await page.evaluate('__hc.flashOn(0)');
    await night('empty hand (end)');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('\nDONE');
})().catch(e=>{ console.error(e); process.exit(1); });
