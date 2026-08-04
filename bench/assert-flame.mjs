// #65 — FIRE. The four claims of the item, each as a measurement rather than a look.
//
//   1 IT MOVES, and not on one clean beat. The old shader flickered on a single sin(t*15); this samples the flame's
//     brightness over time and asserts it actually varies.
//   2 NEIGHBOURS ARE NOT IN LOCKSTEP. Two torches side by side carry different seeds, so their brightness series must
//     not track each other. A wall of flames pulsing together is the specific failure the seed exists to prevent, and
//     it is invisible in a screenshot of one torch.
//   3 THE TIP BREAKS AND EMBERS LEAVE IT. Measured as lit pixels DETACHED from the continuous body — above a gap.
//     A clean tapering teardrop with no embers scores zero here, which is exactly what the old flame was.
//   4 IT IS STILL FREE. Fire cost nothing before this item (147 fps clean, 151 with eighty-five torches); the point of
//     measuring first was to be able to assert it still does.
// usage: node bench/assert-flame.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let pass=0, fail=0;
const chk=(c,n,d)=>{ if(c){pass++;console.log('  PASS  '+n+(d?'   '+d:''));} else {fail++;console.log('  FAIL  '+n+(d?'   '+d:''));} };
const corr=(a,b)=>{ const n=Math.min(a.length,b.length); if(n<3) return 0;
  const ma=a.slice(0,n).reduce((x,y)=>x+y,0)/n, mb=b.slice(0,n).reduce((x,y)=>x+y,0)/n;
  let num=0,da=0,db=0; for(let i=0;i<n;i++){ const p=a[i]-ma,q=b[i]-mb; num+=p*q; da+=p*p; db+=q*q; }
  return (da&&db)?num/Math.sqrt(da*db):0; };

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,760']) });
      ctx=await browser.newContext({ viewport:{width:1280,height:720} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:180000});
    const pr=await page.evaluate('__hc.probe()');
    await page.evaluate(`__hc.tp(${pr.spawnX},${pr.spawnZ})`);
    await page.evaluate('__hc.setTime(0.70)');                 // uDay is 1 at t=0; 0.70 is night, which is the only time fire is what you see
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()',{timeout:60000}).catch(()=>{});
    await sleep(4000);

    const fpsNow=async(ms=3500)=>{ const s=[]; const t0=Date.now();
      while(Date.now()-t0<ms){ s.push((await page.evaluate('__hc.st()')).fps); await sleep(200); }
      s.sort((a,b)=>a-b); return s[s.length>>1]; };
    const clean=await fpsNow();

    // TWO torches side by side, both in frame, so lockstep is measurable at all.
    const a=await page.evaluate("__hc.setBlock(-1,1,-3,'torch')");
    const bpos=await page.evaluate("__hc.setBlock(1,1,-3,'torch')");
    await sleep(2500);
    await page.evaluate('__hc.look('+((a.wx+bpos.wx)/2+0.5)+','+(a.wy+0.6)+','+(a.wz+0.5)+')');
    await sleep(2000);

    const CLIP={x:400,y:120,width:480,height:440};
    const frames=[];
    for(let i=0;i<22;i++){ const buf=await page.screenshot({clip:CLIP});
      if(i===0) fs.writeFileSync(path.join(ROOT,'bench','results','flame-assert.png'), buf);
      frames.push(decodePNG(buf)); await sleep(90); }
    const lum=(im,x,y)=>{ const i=(y*im.w+x)*im.ch; return 0.2126*im.data[i]+0.7152*im.data[i+1]+0.0722*im.data[i+2]; };

    // NARROW COLUMNS, not halves. The crop is full of other bright things at night — fireflies especially — and a
    // wide band counts them as embers: the first run of this scored 93,000 "detached" pixels, which is not what a
    // torch throws off. Each band is only as wide as a flame plus its drift.
    const mid=CLIP.width>>1, BAND=46;
    const halves=[[mid-150-BAND,mid-150+BAND],[mid+150-BAND,mid+150+BAND]];
    const series=[[],[]], detached=[0,0];
    for(const im of frames){
      halves.forEach((hh,k)=>{
        let sum=0;
        // rows of lit pixels, bottom (base) upward; the body is the CONTIGUOUS run from the base
        const rowLit=new Array(im.h).fill(0);
        for(let y=0;y<im.h;y++){ let n=0; for(let x=hh[0];x<hh[1];x++){ const l=lum(im,x,y); if(l>120){ n++; sum+=l; } } rowLit[y]=n; }
        series[k].push(sum);
        let baseY=-1; for(let y=im.h-1;y>=0;y--) if(rowLit[y]>0){ baseY=y; break; }
        if(baseY<0) return;
        let topY=baseY; while(topY>0 && rowLit[topY-1]>0) topY--;      // walk up while the body is unbroken
        // and only just above the body: an ember is close to the flame that threw it, anything higher is scenery
        for(let y=Math.max(0,topY-70);y<topY-1;y++) detached[k]+=rowLit[y];
      });
    }
    const varOf=s=>{ const m=s.reduce((x,y)=>x+y,0)/s.length; return Math.sqrt(s.reduce((x,y)=>x+(y-m)*(y-m),0)/s.length)/(m||1); };

    console.log('\n--- 1  the flame moves ---');
    chk(series[0].length>10 && series[0].some(v=>v>0), 'a flame is actually in frame', 'brightness sum '+Math.round(series[0][0]));
    chk(varOf(series[0])>0.02, 'its brightness varies frame to frame', 'relative variation '+(100*varOf(series[0])).toFixed(1)+'%');

    console.log('\n--- 2  neighbours are not in lockstep ---');
    const c=corr(series[0],series[1]);
    chk(Math.abs(c)<0.85, 'two seeds do not pulse together', 'correlation '+c.toFixed(3));

    console.log('\n--- 3  the tip breaks, and embers leave it ---');
    chk(detached[0]+detached[1] > 20, 'lit pixels appear detached above the body', detached[0]+' + '+detached[1]+' over '+frames.length+' frames');

    console.log('\n--- 4  it is still free ---');
    await page.evaluate(`(()=>{ let k=0; for(let i=0;i<9;i++) for(let j=0;j<9 && k<85;j++){ __hc.setBlock(2+i*2, j%3, -3-((j/3)|0)*2, 'torch'); k++; } return k; })()`);
    await sleep(7000);
    const many=await fpsNow();
    chk(many > clean*0.88, 'eighty-five flames cost under 12% of frame rate', clean+' fps clean → '+many+' fps');

    console.log('\n'+pass+'/'+(pass+fail)+' passed');
    await browser.close();
    process.exit(fail?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
