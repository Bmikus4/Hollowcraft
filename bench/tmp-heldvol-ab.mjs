// Does the held-light VOLUME term actually fix the dark floors? A/B: HEAD (no term) against the working tree (term), in
// the same cave, aimed at the same far wall.
//
// SIX FRAMES PER ARM, AVERAGED, because a held torch FLICKERS - heldLight.intensity carries sin(t*11) and sin(t*1.9) -
// and the note in this repo says a single-frame luminance swings 14.5 on flicker phase. Reading one frame per arm is
// what made the first three runs of tmp-held-dark report 162, then 113, then 422 dark pixels for builds that differed
// by a constant. A median over six frames is the smallest thing that can tell a fix from a phase.
// node bench/tmp-heldvol-ab.mjs
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT='D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const med=a=>{ const s=[...a].sort((x,y)=>x-y); return +s[s.length>>1].toFixed(2); };
function stat(f){ const P=decodePNG(fs.readFileSync(f)); const ch=P.ch; let s=0,n=0,d=0;
  for(let y=150;y<300;y++) for(let x=300;x<500;x++){ const i=(y*P.w+x)*ch; const L=(P.data[i]+P.data[i+1]+P.data[i+2])/3;
    s+=L; n++; if(L<24) d++; }
  return { mean:s/n, dark:100*d/n }; }

const FINDCAVE=`(function(){ const P=__hc.probe(); let best=null;
  for(let r=8;r<260;r+=4) for(let a=0;a<24;a++){ const th=a*0.2618;
    const x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
    const g=__hc.treeGates(x,z); const h=g&&g.h; if(h==null||h<=P.sea+4) continue;
    for(let y=h-30; y<h-8; y++){
      if(__hc.blockAt(x,y,z)!==0 || __hc.blockAt(x,y+1,z)!==0) continue;
      if(__hc.blockAt(x,y-1,z)===0) continue;
      let roof=true; for(let k=2;k<=5;k++) if(__hc.blockAt(x,y+k,z)===0){ roof=false; break; }
      if(!roof) continue;
      let air=0; for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) for(let dy=0;dy<=2;dy++)
        if(__hc.blockAt(x+dx,y+dy,z+dz)===0) air++;
      if(air<18) continue;
      let wide=0; for(let dx=-6;dx<=6;dx++) for(let dz=-6;dz<=6;dz++) for(let dy=0;dy<=3;dy++)
        if(__hc.blockAt(x+dx,y+dy,z+dz)===0) wide++;
      if(!best || wide>best.wide) best={x,y,z,h,air,wide};
      if(wide<220) continue;
    } }
  return best || {err:'no cave'}; })`;

(async()=>{
  // HC_BASE names the commit the first arm is built from - default HEAD, but once a fix is IN head the baseline has to
  // be the commit before it. HC_SURFACE=1 stands on open ground instead of in a cave and HC_TIME pins the clock, which
  // is how the same rig checks that a cave fix has not brightened a signed-off night or daylight.
  const BASE = process.env.HC_BASE || 'HEAD';
  fs.writeFileSync(path.join(ROOT,'_head.html'), execSync('git show '+BASE+':index.html',{cwd:ROOT,maxBuffer:64*1024*1024}));
  console.log('baseline ' + BASE + (process.env.HC_SURFACE?'   SURFACE':'   cave') + '   time ' + (process.env.HC_TIME||'0.25'));
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
  const run=async(file,tag)=>{
    const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/'+file+'?debug=1',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    const T = process.env.HC_TIME || '0.25';
    await page.evaluate('__hc.setTime('+T+')');
    await sleep(3000);
    // HC_CAVE=x,y,z pins the cave instead of searching. The search returns the BIGGEST chamber, which is not the same
    // as one that shows the defect: (350,32,28) has no dark pixels in either arm and cannot grade a fix, while
    // (288,27,12) is where dark y-faces were actually seen. A fixture has to be the place the symptom lives.
    const site = process.env.HC_SURFACE
      ? await page.evaluate(`(()=>{ const P=__hc.probe();
          for(let r=12;r<200;r+=4) for(let a=0;a<16;a++){ const th=a*0.3927;
            const x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
            const g=__hc.treeGates(x,z); if(g&&g.h!=null&&g.h>P.sea+3&&!g.emits) return {x, y:g.h+1, z, surface:true}; }
          return {err:'no open ground'}; })()`)
      : process.env.HC_CAVE
      ? (([x,y,z])=>({x:+x,y:+y,z:+z,pinned:true}))(process.env.HC_CAVE.split(','))
      : await page.evaluate(FINDCAVE+'()');
    if(site.err) throw new Error(site.err);
    await page.evaluate('__hc.tpAt('+(site.x+0.5)+','+site.y+','+(site.z+0.5)+')');
    await sleep(1500);
    const held=await page.evaluate('__hc.hold("torch")');
    await sleep(1200);
    // THE FLOOR, not a wall. The mechanism under test says a wall is fine either way - its normal points at the light -
    // and that the gain is on GRAZING faces, so aiming at a wall measures the one surface the fix is not for. The first
    // run of this A/B did exactly that and reported +7 luma on a wall with no dark pixels in either arm.
    // SWEEP THE AIMS. One view cannot be assumed to hold the defect: the fixture is whichever view shows dark pixels in
    // the HEAD arm, and it has to show them on every frame, not on a lucky flicker phase.
    const AIMS=[];
    for(const dz of [2,4,6]) for(const dy of [-1.2,-0.6,0.2]) AIMS.push({tag:'z'+dz+'y'+dy, x:site.x+0.5, y:site.y+dy, z:site.z+0.5-dz});
    const views=[];
    for(const A of AIMS){
      await page.evaluate('__hc.look('+A.x+','+A.y+','+A.z+')'); await sleep(500);
      await page.evaluate('__hc.look('+A.x+','+A.y+','+A.z+')'); await sleep(300);
      const means=[], darks=[];
      for(let i=0;i<6;i++){
        await page.evaluate('__hc.setTime('+T+')'); await sleep(300);
        const f=path.join(ROOT,'bench','results','heldvol-'+tag+'-'+A.tag+'-'+i+'.png');
        await page.screenshot({path:f});
        const st=stat(f); means.push(st.mean); darks.push(st.dark);
      }
      views.push({ aim:A.tag, mean:med(means), dark:med(darks), darkMin:+Math.min(...darks).toFixed(2),
                   spread:+(Math.max(...means)-Math.min(...means)).toFixed(2) });
    }
    await page.context().close();
    return { site, held, views };
  };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    const before=await run('_head.html','head');
    const after =await run('index.html','fix');
    console.log('cave ' + JSON.stringify(after.site) + '   torch ' + JSON.stringify(after.held));
    console.log('  aim        HEAD mean / dark%   |   ARM2 mean / dark%   (dark% is a median of 6 frames; darkMin is the worst frame)');
    for(let i=0;i<before.views.length;i++){
      const b=before.views[i], a=after.views[i];
      const fixture = b.darkMin>0.3 ? '   <== FIXTURE: shows the defect on every frame' : '';
      console.log('  '+b.aim.padEnd(9)+'  '+String(b.mean).padStart(7)+' / '+String(b.dark).padStart(5)+'%  |  '+
                  String(a.mean).padStart(7)+' / '+String(a.dark).padStart(5)+'%   spread '+b.spread+fixture);
    }
  } finally { await browser.close(); server.kill(); try{ fs.unlinkSync(path.join(ROOT,'_head.html')); }catch(e){} }
})();
