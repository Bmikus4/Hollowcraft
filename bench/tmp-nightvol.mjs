// WHAT IS GREY AT NIGHT? Ben: "for the black fog adjustments I meant that we need to fix volumetric fog, not weather fog."
//
// Distance fog and the weather bank are both dark now (0.0062 / 0.009 measured). So something ELSE is lit at night and it has
// to be named before it can be fixed. Guessing which pass he means has already cost a day elsewhere, so this does not guess:
// it stands in the world at deep night, photographs the frame, and reports the luminance of each band of the image; then it
// hides the horizon layers ONE AT A TIME through __hc.hideLayer and reports which removal makes the grey go away.
//
// The layer whose removal drops the reading is the answer. Nothing here proposes a fix.
//
// usage: node bench/tmp-nightvol.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT = 'D:\\code\\Minecraft', OUT = path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// Mean rgb over a rectangle given in fractions of the frame, so the bands mean the same thing at any viewport.
function band(im, x0,y0,x1,y1){ let r=0,g=0,b=0,n=0;
  for(let y=Math.floor(im.h*y0); y<Math.floor(im.h*y1); y++) for(let x=Math.floor(im.w*x0); x<Math.floor(im.w*x1); x++){
    const i=(y*im.w+x)*im.ch; r+=im.data[i]; g+=im.data[i+1]; b+=im.data[i+2]; n++; }
  return { rgb:[r/n,g/n,b/n], lum:(0.2126*r+0.7152*g+0.0722*b)/n };
}

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1100,height:640} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,240)));
    await page.goto(base+'/index.html?debug=1&rd=10', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.setTime(0.70)'); await sleep(2500);

    const atm=await page.evaluate('__hc.horizonDbg()');
    console.log('  atmosphere at deep night: '+JSON.stringify(atm));

    // Stand on the shore looking out, which is where the far field fills the frame and where he keeps looking.
    const P=await page.evaluate('__hc.probe()');
    await page.evaluate('__hc.tpExact('+(P.x-30)+','+P.z+','+(P.sea+16)+')'); await sleep(2600);
    await page.evaluate('__hcBR.look('+Math.PI+',0.012)'); await sleep(1600);

    const shoot=async(tag)=>{ const f=path.join(OUT,'nightvol-'+tag+'.png'); await page.screenshot({path:f}); return decodePNG(fs.readFileSync(f)); };
    const report=(tag,im)=>{ const rows=[['upper sky',0.10,0.30],['horizon band',0.42,0.52],['mid distance',0.52,0.62],['near ground',0.72,0.92]];
      console.log('  '+tag+':');
      for(const [nm,y0,y1] of rows){ const b=band(im,0.20,y0,0.80,y1);
        console.log('     '+nm.padEnd(14)+' rgb('+b.rgb.map(v=>v.toFixed(1)).join(',')+')  lum '+b.lum.toFixed(2)); } };

    const baseImg=await shoot('all'); report('everything visible', baseImg);
    const baseH=band(baseImg,0.20,0.42,0.80,0.62).lum;

    // ONE LAYER AT A TIME. Restore between each, so what is measured is that layer's own contribution.
    for(const L of ['fogShell','pine','ocean','sky','chunks']){
      await page.evaluate('__hc.hideLayer("'+L+'",false)'); await sleep(1100);
      const im=await shoot('no-'+L);
      const h=band(im,0.20,0.42,0.80,0.62).lum;
      console.log('  hiding '+L.padEnd(9)+' → horizon+mid lum '+h.toFixed(2)+'   (was '+baseH.toFixed(2)+', change '+(h-baseH).toFixed(2)+')');
      await page.evaluate('__hc.hideLayer("'+L+'",true)'); await sleep(700);
    }

    // AND IN A FOREST, because the night foliage darkening is a separate path (uFolNight) and a lit forest at night would be
    // the same complaint from a different shader.
    const tree=await page.evaluate(`(()=>{ const p=__hc.probe(); for(let r=20;r<=200;r+=8){ for(const s of [[1,0],[0,1],[-1,0],[0,-1]]){
        const x=Math.round(p.x+s[0]*r), z=Math.round(p.z+s[1]*r); const h=__hc.surfH(x,z); if(h>p.sea+3) return {x,z,h}; } } return null; })()`);
    if(tree){ await page.evaluate('__hc.tpExact('+tree.x+','+tree.z+','+(tree.h+3)+')'); await sleep(2600);
      await page.evaluate('__hcBR.look(0.7,0.0)'); await sleep(1600);
      report('in the trees at night', await shoot('forest')); }

    console.log('  shots: bench/results/nightvol-*.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
