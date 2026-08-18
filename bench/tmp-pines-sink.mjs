// WHERE THE BAND LANDS AGAINST THE RENDERED HORIZON, per sinkF.
//
// uDbgAll mode 2 paints every fragment that survived all gates. Detecting it by "is it magenta" fails: the frame goes
// through tonemap, bloom, lift and vignette, so pure (1,0,1) arrives as roughly (230,140,215) and a channel threshold
// misses it — that is why the earlier probe reported 0.000% over a frame that was entirely magenta. Detect by HUE
// instead (red and blue both well above green), which grading preserves.
//
// Reports, per sinkF: the band's top and bottom row, the horizon row measured from the same frame, and how many rows
// of band stand ABOVE the horizon. That last number is the whole question — the band is invisible today because it is
// zero.
//
//   node bench/tmp-pines-sink.mjs [--sweep 0.6,0.45,0.3,0.15,0]
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const OUT=path.join(ROOT,'bench','results');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const argv=process.argv.slice(2);
const SWEEP=(()=>{ const i=argv.indexOf('--sweep'); return (i<0?'0.6,0.45,0.3,0.15,0':argv[i+1]).split(',').map(Number); })();
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=20000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function p(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(p,250); }); })(); }); }
function findBrowser(){ for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

// Rows carrying band (hue test) and the horizon row (the steepest luminance step down the frame, which over open sea
// is the sea/sky join and is a fact about the same png).
async function rows(page,file){
  const buf=fs.readFileSync(file).toString('base64');
  return await page.evaluate(`(async()=>{ const im=new Image(); im.src='data:image/png;base64,${buf}';
    await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
    const g=c.getContext('2d'); g.drawImage(im,0,0); const d=g.getImageData(0,0,im.width,im.height).data;
    const W=im.width,H=im.height; let top=-1,bot=-1,n=0; const lum=[];
    for(let y=0;y<H;y++){ let row=0,ls=0;
      for(let x=0;x<W;x++){ const i=(y*W+x)*4, R=d[i],G=d[i+1],B=d[i+2];
        ls+=0.2126*R+0.7152*G+0.0722*B;
        if(R-G>28 && B-G>18) row++; }
      lum.push(ls/W);
      if(row>W*0.01){ if(top<0) top=y; bot=y; n+=row; } }
    let hz=-1, best=0;
    for(let y=2;y<H-2;y++){ const s=lum[y-2]-lum[y+2]; if(s>best){ best=s; hz=y; } }
    return { top, bot, px:n, horizon:hz, step:+best.toFixed(2) }; })()`);
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
    await page.evaluate(`__hc.lock(true); __hc.cmdRun('/gamemode creative'); __hc.cmdRun('/fly on'); __hc.freezeAnimals(true); __hc.cinema(true); __hc.freezeT(0); __hc.setTime(0.25);`);

    const IC=await page.evaluate('__hc.isleStats()'); const SEA=await page.evaluate('__hc.island().sea');
    const pr=await page.evaluate('__hc.pinesProbe()');
    const az=pr.strongestBearing.azRad;
    const shore=await page.evaluate(`(()=>{ const dx=Math.cos(${az}), dz=Math.sin(${az});
      for(let d=Math.round(${IC.R}*2.2); d>30; d-=1){ const x=Math.round(${IC.x}+dx*d), z=Math.round(${IC.z}+dz*d);
        if(__hc.groundY(x,z)>${SEA}) return {x,z,g:__hc.groundY(x,z),d}; } return null; })()`);
    await page.evaluate(`__hc.tpAt(${shore.x}+0.5, ${shore.g}+1, ${shore.z}+0.5); __hc.cam({yaw:${pr.strongestBearing.lookYaw}, pitch:0});`);
    for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(2500);
    // RE-PROBE AFTER THE TELEPORT. The mask is rebuilt around wherever the player is, so the strongest bearing found
    // at spawn is meaningless here -- __hc.pineCell on it read env 0, which means every shot taken this way was aimed
    // at the one azimuth with no coast on it. Ask the mask that exists NOW.
    const pr2=await page.evaluate('__hc.pinesProbe()');
    await page.evaluate('__hc.cam({yaw:'+pr2.strongestBearing.lookYaw+', pitch:0});');
    await sleep(1200);
    console.log('aimed at cell', pr2.strongestBearing.cell,
                'env', JSON.stringify(await page.evaluate('__hc.pineCell('+pr2.strongestBearing.cell+')')));
    console.log('shore', JSON.stringify(shore), 'draw', JSON.stringify(await page.evaluate('__hc.pineDraw()')));
    console.log(`${'sinkF'.padEnd(7)}${'bandTop'.padStart(8)}${'bandBot'.padStart(8)}${'horizon'.padStart(8)}${'aboveHz'.padStart(8)}   file`);
    for(const sf of SWEEP){
      await page.evaluate(`__hc.pines(1,{sinkF:${sf}})`); await sleep(500);
      await page.evaluate('__hc.pinesAll(2)'); await sleep(600);
      const f=path.join(OUT,`sink-${String(sf).replace('.','p')}-dbg.png`); await page.screenshot({path:f});
      const r=await rows(page,f);
      await page.evaluate('__hc.pinesAll(0)'); await sleep(500);
      const g=path.join(OUT,`sink-${String(sf).replace('.','p')}.png`); await page.screenshot({path:g});
      const above=(r.top>=0 && r.horizon>=0)?Math.max(0,r.horizon-r.top):0;
      console.log(`${String(sf).padEnd(7)}${String(r.top).padStart(8)}${String(r.bot).padStart(8)}${String(r.horizon).padStart(8)}${String(above).padStart(8)}   ${path.basename(g)}`);
    }
    await page.evaluate('__hc.pines(1,{sinkF:0.6})');
  } finally { try{ if(browser) await browser.close(); }catch(e){} try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
