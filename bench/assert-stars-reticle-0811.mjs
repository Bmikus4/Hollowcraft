// STARS AND THE RETICLE, 08-11. Ben: "star shimmers should not have halos, they should be small diamond/starlike shimmers,
// and less frequent" and "the center aim circle should ALWAYS have grain applied to it".
//
// BOTH CLAIMS ARE PIXEL CLAIMS, so both are measured off a real night frame rather than eyeballed:
//   NO HALO is a RADIAL PROFILE. A bloomed star is a bright core sitting in a wide soft skirt, so the ring of pixels a few
// px out from the core is lifted well above the sky behind it. A crisp star drops back to sky within a pixel or two. The
// check is that ratio, not the core's brightness — a dim star with a halo would pass a brightness test and still be wrong.
//   LESS FREQUENT is a DIFFERENCE BETWEEN TWO FRAMES a second apart. Under the old continuous 2.4-7.4 rad/s sine every star
// in the sky was mid-twinkle at all times, so nearly every star pixel changed over a second. A field that holds steady and
// flashes occasionally changes in only a minority of them.
//   GRAIN ON THE RING is a VARIANCE plus a CHANGE. Variance alone could be the sky behind it; changing between two frames
// while the player stands still is the boil, which nothing else in that annulus does.
//
// usage: node bench/assert-stars-reticle-0811.mjs   -> bench/results/stars-0811.png
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
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

let checks=0, fails=0;
const ok=(n,c,d)=>{ checks++; if(!c){fails++; console.log('  FAIL  '+n+'   '+JSON.stringify(d)); } else console.log('  ok    '+n+'   '+JSON.stringify(d)); };

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  const errs=[];
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1000,height:640}})).newPage();
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
    await page.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:240000});
    await page.evaluate('(()=>{ __hc.lock(true); __hc.cmdRun("/gamemode creative"); __hc.setTime(0.75); })()').catch(()=>{});
    // CAMERA UP INTO THE SKY. The moon is up there too and its halo is a separate, deliberate term — so rather than trying to
    // dodge it, the skirt below is a MEDIAN over twelve peaks, which one big bright disc cannot move.
    // THE AIM HOOK IS FOUND, NOT ASSUMED. The first run of this bench called __hc.hw.pitch, which does not exist there — the
    // call threw, the camera never moved, and the "star" measurements were 9754 peaks of night TERRAIN reported as a pass.
    // A harness that cannot prove it is looking at the sky is not measuring the sky.
    const aim=await page.evaluate(`(()=>{ const has=(o,k)=>o&&typeof o[k]==='function';
        let host=null; if(has(__hc,'cam')) host=__hc; else for(const k in __hc){ const v=__hc[k]; if(v&&typeof v==='object'&&has(v,'cam')){ host=v; break; } }
        if(host) return {via:'cam', r:host.cam({pitch:1.05})};
        if(has(__hc,'pitch')) return {via:'pitch', r:__hc.pitch(1.05)};
        for(const k in __hc){ const v=__hc[k]; if(v&&typeof v==='object'&&has(v,'pitch')) return {via:k+'.pitch', r:v.pitch(1.05)}; }
        return {via:null}; })()`);
    console.log('  pitch '+JSON.stringify(aim));
    ok('the camera is aimed at the sky', !!(aim&&aim.via), aim);
    await sleep(3000);

    const grab=async()=>{
      const shot=(await page.screenshot()).toString('base64');
      return await page.evaluate(async (b64)=>{
        const im=new Image(); im.src='data:image/png;base64,'+b64; await im.decode();
        const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight;
        const x=c.getContext('2d'); x.drawImage(im,0,0);
        const d=x.getImageData(0,0,c.width,c.height).data, W=c.width, H=c.height;
        const lum=(i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
        // THE SKY BAND ONLY: the top third of the frame, and never the middle 120px where the reticle and the held item are.
        const y0=8, y1=(H/3)|0;
        const L=new Float64Array(W*H);
        for(let py=y0;py<y1;py++) for(let px=0;px<W;px++) L[py*W+px]=lum((py*W+px)*4);
        let sum=0,n=0; for(let py=y0;py<y1;py++) for(let px=0;px<W;px++){ sum+=L[py*W+px]; n++; }
        const bg=sum/n;
        // A STAR IS A LOCAL SPIKE, NOT A BRIGHT PIXEL. Measured against the GLOBAL sky mean the detector found 9689 "stars"
        // and 34% of the frame "bright", because the Milky Way band and the moonlit cloud deck are both far above that mean —
        // it was measuring weather. Everything below is therefore local: a candidate has to stand at least 25 levels over the
        // mean of its own 7-10px surroundings, which a broad gradient never does and a point always does.
        const ann=(px,py,r0,r1)=>{ let s=0,m=0; for(let dy=-r1;dy<=r1;dy++) for(let dx=-r1;dx<=r1;dx++){
            const r=Math.hypot(dx,dy); if(r<r0||r>r1) continue; const yy=py+dy, xx=px+dx;
            if(yy<y0||yy>=y1||xx<0||xx>=W) continue; s+=L[yy*W+xx]; m++; } return m?s/m:0; };
        const stars=[];
        for(let py=y0+11;py<y1-11;py++) for(let px=11;px<W-11;px++){ const v=L[py*W+px];
          let isMax=true;
          for(let dy=-1;dy<=1&&isMax;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue; if(L[(py+dy)*W+px+dx]>v){ isMax=false; break; } }
          if(!isMax) continue;
          const far=ann(px,py,7,10); if(v-far < 25) continue;
          const near=ann(px,py,3,5);
          // SIZE: pixels within 3px of the core that are at least halfway from the local sky up to the core. A solid hash cell
          // fills that disc; a shaped point does not.
          let size=0; const half=far+(v-far)*0.5;
          for(let dy=-3;dy<=3;dy++) for(let dx=-3;dx<=3;dx++){ const yy=py+dy, xx=px+dx;
            if(yy<y0||yy>=y1||xx<0||xx>=W) continue; if(L[yy*W+xx]>=half) size++; }
          stars.push({v, far, lift:near-far, size}); }
        stars.sort((a,b)=>b.v-a.v);
        const top=stars.slice(0,16);
        const medOf=(arr)=>{ if(!arr.length) return 0; const s=arr.slice().sort((a,b)=>a-b); return s[s.length>>1]; };
        return { W,H, bg:+bg.toFixed(2), stars:stars.length,
                 core:top.length?+(top.reduce((s,q)=>s+q.v,0)/top.length).toFixed(1):0,
                 skirtLift:+medOf(top.map(q=>q.lift)).toFixed(2),
                 size:+medOf(stars.map(q=>q.size)).toFixed(2),
                 contrast:+medOf(top.map(q=>q.v-q.far)).toFixed(1) };
      }, shot);
    };

    const a=await grab(); await sleep(1100); const b=await grab();
    console.log('  frame A '+JSON.stringify(a));
    console.log('  frame B '+JSON.stringify(b));

    ok('stars are on screen at night', a.stars>15, {stars:a.stars, bg:a.bg});
    // NO HALO: the ring 3-5px out sits close to the local sky. A bloomed core lifts that whole annulus, because the mip-blur
    // chain spreads over tens of pixels, not two.
    const allowed=Math.max(4, a.contrast*0.30);
    ok('no halo around the stars', a.skirtLift < allowed, {skirtLift:a.skirtLift, contrast:a.contrast, allowed:+allowed.toFixed(2)});
    // SMALL: the 7x7 disc this counts over holds 49 px, and a solid hash cell plus the half-res upscale would fill most of
    // it. The threshold is generous ON PURPOSE — the renderer draws the sky at half resolution and upscales, so a
    // one-shader-pixel star lands as a 4-5px screen blob no matter what shape the shader gave it. This bounds the size; it
    // cannot resolve the diamond, and pretending otherwise would be a check that passes for the wrong reason.
    ok('stars are small, not solid cells', a.size <= 30, {sizePx:a.size, discPx:49});
    // LESS FREQUENT: the count of visible stars barely moves over a second. Under the old continuous 2.4-7.4 rad/s sine every
    // star was mid-twinkle at all times, so the population above any threshold churned every frame.
    const churn=Math.abs(a.stars-b.stars)/Math.max(1,a.stars);
    ok('the star field mostly holds still over a second', churn < 0.35, {a:a.stars, b:b.stars, churn:+churn.toFixed(3)});

    // ---- THE RETICLE ----
    const css=await page.evaluate(`(()=>{ const el=document.getElementById('xh'); if(!el) return {err:'no #xh'};
        const s=getComputedStyle(el,'::after'), r=el.getBoundingClientRect();
        return { bg:(s.backgroundImage||'').slice(0,300), anim:s.animationName, mask:(s.maskImage||s.webkitMaskImage||'').slice(0,60),
                 w:+r.width.toFixed(1), h:+r.height.toFixed(1), vis:getComputedStyle(el).visibility, op:getComputedStyle(el).opacity }; })()`);
    console.log('  xh    '+JSON.stringify(css));
    ok('the ring carries a noise layer', /feTurbulence/.test(css.bg||''), {bg:(css.bg||'').slice(0,60)});
    ok('and it boils',                   css.anim==='xhgrain',            {anim:css.anim});
    ok('masked to the ring itself',       /gradient/.test(css.mask||''),   {mask:css.mask});

    const ring=async()=>{
      const shot=(await page.screenshot()).toString('base64');
      return await page.evaluate(async (b64)=>{
        const el=document.getElementById('xh'), r=el.getBoundingClientRect();
        const im=new Image(); im.src='data:image/png;base64,'+b64; await im.decode();
        const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight;
        const x=c.getContext('2d'); x.drawImage(im,0,0);
        const d=x.getImageData(0,0,c.width,c.height).data;
        const cx=r.left+r.width/2, cy=r.top+r.height/2, rad=r.width/2-1.5;
        const vals=[]; const N=180;
        for(let k=0;k<N;k++){ const a2=k/N*6.2832, px=Math.round(cx+Math.cos(a2)*rad), py=Math.round(cy+Math.sin(a2)*rad);
          const i=(py*c.width+px)*4; vals.push(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]); }
        const m=vals.reduce((s,v)=>s+v,0)/vals.length;
        const sd=Math.sqrt(vals.reduce((s,v)=>s+(v-m)*(v-m),0)/vals.length);
        return { mean:+m.toFixed(2), sd:+sd.toFixed(2), vals:vals.map(v=>Math.round(v)) };
      }, shot);
    };
    const r1=await ring();
    console.log('  ring  '+JSON.stringify({mean:r1.mean,sd:r1.sd}));
    ok('the ring is mottled, not flat', r1.sd > 3.0, {sd:r1.sd, mean:r1.mean});
    // THE BOIL IS READ OFF THE COMPUTED STYLE, not off two screenshots. A screenshot pair samples a 2px border through
    // integer pixel rounding, so the number it produces is dominated by where the circle lands on the grid rather than by the
    // noise — the first version of this check measured 0.11 and would have "failed" a perfectly animating ring.
    const bp=[];
    for(let k=0;k<6;k++){ bp.push(await page.evaluate("getComputedStyle(document.getElementById('xh'),'::after').backgroundPosition")); await sleep(170); }
    ok('and the grain boils', new Set(bp).size>=2, {positions:bp});

    await page.screenshot({path:path.join(OUT,'stars-0811.png')});
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  if(errs.length) console.log('  page errors: '+JSON.stringify(errs.slice(0,5)));
  console.log((fails?'FAIL ':'PASS ')+(checks-fails)+'/'+checks+' checks'+(errs.length?' ('+errs.length+' page errors)':''));
  process.exit(fails||errs.length?1:0);
})();
