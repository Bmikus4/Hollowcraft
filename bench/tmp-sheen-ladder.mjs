// THE BLACK-TEXEL SHEEN, AT FOUR SETTINGS, IN THE PLACE IT IS FOR — so Ben can size it by eye in one look.
// It ships at k=0, which means nothing on screen and nothing to judge. The dial is `__hc.sheen({k})`: k is the
// fraction of DELIVERED light a black texel returns, knee is the albedo it has faded out by. It cannot be sized
// by a statistic — the whole question is whether a pure-black texel on a lit surface reads as material or as a
// hole, and that is an eye's call. This produces the ladder and stops.
//
// THE VANTAGE IS THE ONE THE FAULT LIVES AT: a carved chamber with no sky, a torch in hand, the wall at a block
// and a half. Ben: "its only when I as the player gets close that I see them" — at range the mip chain averages
// a dark texel into its neighbours and the fault is out of the image before any shader term runs.
// The pure-black percentage is printed beside each frame as a scale, NOT as the verdict: a scale-invariant floor
// changes that number without changing what a face looks like, which is how three earlier settings were chosen
// and then reversed.
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

const STATS=(page,file)=>page.evaluate(async(src)=>{
  const img=await new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.src=src; });
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
  const W=c.width,H=c.height,d=g.getImageData(0,0,W,H).data;
  // the wall, not the viewmodel: the left 60% and the top 75%
  let black=0,n=0,sum=0;
  for(let y=0;y<H*0.75;y++)for(let x=0;x<W*0.6;x++){ const i=(y*W+x)*4;
    const l=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; sum+=l; n++; if(l<1.0) black++; }
  return { pureBlackPct:+(100*black/n).toFixed(2), meanLum:+(sum/n).toFixed(1) };
}, 'data:image/png;base64,'+fs.readFileSync(file).toString('base64'));

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
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(9000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.dayLock(0.75)'); await sleep(1500);
    // A SEALED CHAMBER, not a night field: the sheen is about what a lamp delivers, and open sky at any hour
    // adds a term that is not the lamp. Roofed, so skyAccess is zero and the only light in the room is in hand.
    const spot=await page.evaluate(`(function(){
      const p=__hc.probe(); const cx=Math.round(p.x), cz=Math.round(p.z); const gy=__hc.groundY(cx,cz);
      for(let dx=-4;dx<=4;dx++) for(let dz=-6;dz<=2;dz++) for(let y=gy+1;y<=gy+4;y++) __hc.cmdRun('/setblock '+(cx+dx)+' '+y+' '+(cz+dz)+' air');
      for(let dx=-5;dx<=5;dx++) for(let dz=-7;dz<=3;dz++){ __hc.cmdRun('/setblock '+(cx+dx)+' '+(gy+5)+' '+(cz+dz)+' stone'); }
      for(let dx=-5;dx<=5;dx++) for(let y=gy+1;y<=gy+5;y++) __hc.cmdRun('/setblock '+(cx+dx)+' '+y+' '+(cz-7)+' stone');
      return [cx,gy,cz];
    })()`);
    for(let i=0;i<40;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
    // stand a block and a half off the far wall, torch in hand — mip 0, which is the only range the fault exists at
    // 2.5 blocks off the wall and pitched down, so the frame holds WALL AND FLOOR and the lamp's falloff runs
    // across both. Draft 1 stood at 1.5 and read a single face filling the frame at a uniform 146 luminance:
    // no falloff, no dark corner, nothing a sheen could show up in.
    await page.evaluate(`__hc.tp(${spot[0]}, ${spot[1]+2}, ${spot[2]-4.5}, 0, -0.35)`); await sleep(2500);
    // AND THE TORCH HAS TO BE IN THE HAND, not in the inventory. /give fills a slot; __hc.hold equips it and
    // sets the viewmodel. Draft 1 photographed an empty hand and called the room lit.
    console.log('  hand:', JSON.stringify(await page.evaluate('__hc.hold("torch")')).slice(0,80));
    await sleep(1500);
    console.log('  roofed (skyAccess must be 0):', JSON.stringify(await page.evaluate('__hc.objSky()')).slice(0,120));
    for(const k of [0, 0.08, 0.15, 0.30]){
      console.log('   ', JSON.stringify(await page.evaluate(`__hc.sheen({k:${k}})`)));
      await sleep(1600);
      const f=path.join(OUT,'sheen-k'+String(k).replace('.','_')+'.png'); await page.screenshot({path:f});
      console.log('      k='+String(k).padEnd(5), JSON.stringify(await STATS(page,f)), ' ->', path.basename(f));
    }
    await page.evaluate('__hc.sheen({k:0})');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('\nDONE — four frames in bench/results/sheen-k*.png, for Ben to pick from.');
})().catch(e=>{ console.error(e); process.exit(1); });
