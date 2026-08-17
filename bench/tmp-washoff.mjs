// THE CONTROL THAT DECIDES ONE QUESTION: is assert-cave-black's "what it lights is coloured, not descended"
// measuring the scotopic wash at all? Three terms have now been switched with the number moving by nothing —
// the ambient floor (509e09d), the moon's direct term (f201953) and the wash's own lamp-puddle release (11b4e4b) —
// so the next thing to establish is not another term but whether the wash is in the picture.
//
// ONE VARIABLE: __hc.scot({amt:0}) takes the ENTIRE wash to zero. Same room, same lantern, same crop, same hour,
// measured immediately before and after. If sat barely moves, the wash is exonerated outright and the 0.30 floor is
// measuring the GRADE — uSat 0.96 and the AgX toe, which desaturates what it compresses — which makes it a threshold
// to re-derive rather than a term to fix. If it jumps, the wash is the term and the release needs a different shape.
//
// The room is carved out of solid ground rather than built, for the reason the assert gives: /setblock air through
// rock leaves every wall a face whose own column is still capped by the hillside, which is what makes vSky 0.
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

// The assert's own crop and its own saturation definition: (max-min)/max over the far wall at frame centre.
const CROP=(page,f)=>page.evaluate(async(src)=>{
  const img=await new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.src=src; });
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
  const W=c.width,H=c.height,d=g.getImageData(0,0,W,H).data;
  let s=0,l=0,n=0,mn=255;
  for(let y=(H*0.32)|0;y<H*0.62;y++)for(let x=(W*0.34)|0;x<W*0.66;x++){ const i=(y*W+x)*4;
    const mx=Math.max(d[i],d[i+1],d[i+2]), m=Math.min(d[i],d[i+1],d[i+2]);
    s += mx>0 ? (mx-m)/mx : 0; l += 0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; if(m<mn)mn=m; n++; }
  return { sat:+(s/n).toFixed(3), lum:+(l/n).toFixed(2), min:mn };
}, 'data:image/png;base64,'+fs.readFileSync(f).toString('base64'));

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(8000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    // A cave in the hillside: 7x7x5 of air carved out, well below the surface so every wall keeps its rock cap.
    const at=await page.evaluate(`(function(){
      const p=__hc.probe(); const cx=Math.round(p.x)+18, cz=Math.round(p.z)+18;
      const gy=__hc.groundY(cx,cz), cy=gy-9;
      for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++) for(let y=cy;y<=cy+4;y++) __hc.cmdRun('/setblock '+(cx+dx)+' '+y+' '+(cz+dz)+' air');
      return [cx,cy,cz];
    })()`);
    for(let i=0;i<60;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await page.evaluate(`__hc.tpAt(${at[0]}-2.5, ${at[1]}+1.6, ${at[2]}+0.5); __hc.cam({yaw:0,pitch:0});`);
    await page.evaluate('__hc.dayLock(0.75)'); await sleep(2000);
    await page.evaluate(`__hc.cmdRun('/setblock ${at[0]+2} ${at[1]} ${at[2]} lantern')`);
    for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await sleep(2000);
    console.log('  cave at', JSON.stringify(at), ' lantern placed:', await page.evaluate(`__hc.blockAt(${at[0]+2},${at[1]},${at[2]})`));
    // MEDIAN OF FIVE, because a placed lantern flickers as hard as a held one — the assert takes five for the same reason.
    const row=async(tag,pre)=>{ if(pre) console.log('    set', JSON.stringify(await page.evaluate(pre)).slice(0,120));
      await sleep(1200); const v=[];
      for(let i=0;i<5;i++){ const f=path.join(OUT,'washoff-'+tag+'-'+i+'.png'); await page.screenshot({path:f}); v.push(await CROP(page,f)); await sleep(180); }
      const pick=k=>{ const a=v.map(x=>x[k]).sort((p,q)=>p-q); return a[a.length>>1]; };
      console.log('    '+tag.padEnd(18)+' sat '+String(pick('sat')).padStart(6)+'   lum '+String(pick('lum')).padStart(7)+'   min '+pick('min')); };
    console.log('\n  === the lamp-lit wall, wash on and off (assert floor is sat > 0.30) ===');
    await row('wash shipped');
    await row('wash OFF','__hc.scot({amt:0})');
    await row('wash shipped again','__hc.scot({amt:0.85})');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('\nDONE');
})().catch(e=>{ console.error(e); process.exit(1); });
