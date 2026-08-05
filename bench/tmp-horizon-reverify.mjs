// RE-VERIFY THE HORIZON BAND WITH A CAMERA THAT ACTUALLY WENT WHERE IT WAS TOLD.
//
// The earlier before/after used __hc.tp(500,-380) — and at that time `tp` was declared twice in the __hc object
// literal, so the later tp(x,y,z,...) shadowed tp(x,z) and the call ran pos.set(500,-380,undefined). The camera was
// never at the coast, so those PASS numbers are void even though the direction of the change was right.
//
// This measures the SAME camera on BOTH builds: old-index.html (git show 73ef76a, the commit before the horizon work)
// and the live index.html. Positioning uses __hc.tpAt, which has only ever had ONE declaration and so was never
// shadowed. stillFrame is deliberately NOT used — the old build does not have it, and using it on only one side would
// make the two runs differ by more than the thing under test. Film grain averages out across a 400 px-wide band.
// usage: node bench/tmp-horizon-reverify.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePNG, bands } from './pngprobe.mjs';

const ROOT = 'D:\\code\\Minecraft';
const OUT = 'C:/Users/thera/AppData/Local/Temp/claude/C--Users-thera/b81b0b86-2fc5-472c-bd08-724753d453f0/scratchpad';
fs.mkdirSync(OUT, { recursive:true });

function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

async function boot(page, base, file){
  await page.goto(base+'/'+file+'?debug=1&rd=6', { waitUntil:'load', timeout:90000 });
  await page.waitForFunction(`(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()`,null, {timeout:90000});
  await page.waitForFunction(`(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()`,null, {timeout:90000});
}

// Sea-line row: find the steepest vertical brightness drop in the middle strip — that IS the waterline — and report
// the band just above it (sky), the band just below it (sea), and the brightest row in the lowest third of sky.
function analyse(file){
  const img = decodePNG(fs.readFileSync(file));
  const rows = bands(img, 0.35, 0.65, 0.20, 0.75, 0.006);
  const lum = r => r.rgb[0]*0.299 + r.rgb[1]*0.587 + r.rgb[2]*0.114;
  let bi=1, bd=0;
  for(let i=1;i<rows.length;i++){ const d = lum(rows[i-1]) - lum(rows[i]); if(d>bd){ bd=d; bi=i; } }
  // brightest sky row above the waterline = the pale band, if there is one
  let pk=rows[0]; for(let i=0;i<bi;i++) if(lum(rows[i])>lum(pk)) pk=rows[i];
  return { waterlineY: rows[bi].y, drop:+bd.toFixed(1),
           skyAbove: rows[Math.max(0,bi-2)].rgb, seaBelow: rows[Math.min(rows.length-1,bi+3)].rgb,
           brightestSky: pk.rgb, brightestSkyY: pk.y };
}

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:1280,height:720} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl=`(()=>{try{const c=document.createElement('canvas');const g=c.getContext('webgl2')||c.getContext('webgl');if(!g)return 'NO';const e=g.getExtension('WEBGL_debug_renderer_info');return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):'?';}catch(e){return 'E';}})()`;
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=1300,780']) });
      ctx=await browser.newContext({ viewport:{width:1280,height:720} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }

    // --- pick a coastal camera on the NEW build, where surfH exists ---
    await boot(page, base, 'index.html');
    const cam = await page.evaluate(`(()=>{ const SEA=__hc.island().sea; const P=__hc.pos();
      for(let r=6;r<140;r++) for(let a=0;a<48;a++){ const th=a/48*6.2831853;
        const x=Math.round(P.x+Math.cos(th)*r*6), z=Math.round(P.z+Math.sin(th)*r*6);
        const g=__hc.surfH(x,z); if(g<SEA+1 || g>SEA+5) continue;                 // right at the shore
        // open ocean straight out: every sample seaward must be under sea level for 260 blocks
        const dx=Math.cos(th), dz=Math.sin(th); let open=true;
        for(let s=20;s<=260;s+=10) if(__hc.surfH(Math.round(x+dx*s), Math.round(z+dz*s))>SEA){ open=false; break; }
        if(!open) continue;
        return { x, z, g, sea:SEA, az:Math.atan2(dz,dx), yaw:-Math.PI/2-Math.atan2(dz,dx) }; }
      return null; })()`);
    if(!cam) throw new Error('no open-ocean coastal camera found');
    console.log('camera', JSON.stringify(cam));

    const results={};
    const PAIRS=[['NEW (live)','index.html']]; if(fs.existsSync(path.join(ROOT,'old-index.html'))) PAIRS.unshift(['OLD (73ef76a)','old-index.html']);
    for(const [label,file] of PAIRS){
      await boot(page, base, file);
      // tpAt has only ever had ONE declaration in this object, so it was never shadowed — unlike tp.
      await page.evaluate(`__hc.tpAt(${cam.x}, ${cam.g+3}, ${cam.z})`);
      await sleep(7000);
      const at = await page.evaluate(`__hc.pos()`);
      console.log('---', label, 'at', JSON.stringify({x:+at.x.toFixed(1),y:+at.y.toFixed(1),z:+at.z.toFixed(1)}));
      if(Math.abs(at.x-cam.x)>2 || Math.abs(at.z-cam.z)>2) console.log('   !! camera did not land where asked');
      for(const [tname,frac] of [['day',0.42],['night',0.72]]){
        await page.evaluate(`__hc.setTime(${frac})`);
        await sleep(1600);
        await page.evaluate(`__hc.cam({yaw:${cam.yaw}, pitch:0.0})`);
        await sleep(1200);
        const uday = await page.evaluate(`__hc.seaColor().day`);
        const f = path.join(OUT, 'rv-'+(file==='index.html'?'new':'old')+'-'+tname+'.png');
        await page.screenshot({ path:f });
        const a = analyse(f);
        results[label+' '+tname] = Object.assign({uDay:uday}, a);
        console.log('   '+tname+' uDay='+uday+'  waterline y='+a.waterlineY+
                    '  skyAbove rgb('+a.skyAbove.join(',')+')  seaBelow rgb('+a.seaBelow.join(',')+')'+
                    '  brightestSky rgb('+a.brightestSky.join(',')+') @y'+a.brightestSkyY);
      }
    }
    fs.writeFileSync(path.join(OUT,'rv-horizon.json'), JSON.stringify({camera:cam, results},null,1));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('DONE');
})().catch(e=>{ console.error(e); process.exit(1); });
