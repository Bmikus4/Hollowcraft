// HOW FAR ROUND THE HORIZON THE WOOD REACHES. Ben: "the wooden part of the horizon pines should extend farther out (brown)".
//
// The band is clipped to the same mask the pines are, and then drowned by 1-smoothstep(0, uBandOut, hs) where hs is the mask's
// land strength -- so uBandOut IS the reach, and at 0.22 the wood gave up while the canopy above it carried on round the horizon.
// "Extends farther out" measured as a number: how many screen columns carry brown under the treeline, and how many brown pixels
// in total. Brown here means red at least green: the canopy is green-dominant and the wood is not, and that is the only
// distinction that survives the fog wash.
//
// usage: node bench/tmp-bandout.mjs
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

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({ viewport:{width:1280,height:720} })).newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,240)));
    await page.goto(base+'/index.html?debug=1&rd=10', { waitUntil:'load', timeout:90000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()', {timeout:90000});
    await sleep(7000);
    await page.evaluate('__hc.pinScene()');
    const P=await page.evaluate('__hc.probe()');
    // ON THE BEACH, looking along the coast: the view every band measurement in this repo uses, and the one where the anchoring
    // uniforms are exactly 1 so the treeline is at its signed-off angular size.
    await page.evaluate('__hc.tpExact('+(P.x-30)+','+P.z+','+(P.sea+16)+')'); await sleep(3000);
    await page.evaluate('__hcBR.look('+Math.PI+',0.012)'); await sleep(11000);
    console.log('  anchor: '+JSON.stringify(await page.evaluate('__hc.treelineAnchor()')));

    for(const out of [0.22, 0.15, 0.10, 0.05]){
      const st=await page.evaluate('__hc.bandFog(null,null,'+out+')');
      await page.evaluate('__hc.setTime(0.35)'); await sleep(900); await page.evaluate('__hc.setTime(0.35)'); await sleep(300);
      const f=path.join(OUT,'bandout-'+out+'.png');
      await page.screenshot({path:f});
      const im=decodePNG(fs.readFileSync(f));
      // A generous window either side of the treeline. The band sits a few rows under the canopy and the canopy row itself moves
      // by a row or two between hours, so the window is wide and the discriminator does the work rather than the row index.
      const y0=Math.floor(im.h*0.50), y1=Math.floor(im.h*0.60);
      let cols=0, px=0;
      for(let x=0;x<im.w;x++){
        let hit=0;
        for(let y=y0;y<y1;y++){ const i=(y*im.w+x)*im.ch, r=im.data[i], g=im.data[i+1], b=im.data[i+2];
          // brown: red at least green, and dark enough not to be beach sand or sky
          if(r>=g && r+g+b<260 && r>12) hit++; }
        if(hit>=2){ cols++; px+=hit; }
      }
      console.log('  uBandOut '+String(out).padEnd(5)+' -> brown in '+String(cols).padStart(4)+' of '+im.w+' columns, '+String(px).padStart(6)+' brown pixels   ('+JSON.stringify(st.out)+')');
    }
    console.log('  frames: bench/results/bandout-*.png');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
