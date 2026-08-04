// IS THE MONK ON SCREEN AT ALL? The first framing of him counted 223 blue pixels and 1721 "gold" ones across the whole frame --
// and the gold was the MINIMAP's compass ring, not a cross. So: aim at him, project his feet and his head to get a box, and
// report what is inside that box only.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1000,height:640}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:90000});
    await sleep(6000);
    await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await page.evaluate('__hc.setTime(0.5)');   // midday: a dark-blue robe at dusk is a silhouette, and this is a check on the COLOURS
    console.log('  spawn: '+JSON.stringify(await page.evaluate('__hc.monkSpawn(4,0)')));
    await sleep(600);
    console.log('  parked: '+JSON.stringify(await page.evaluate('__hc.monkPark()')));
    const m=await page.evaluate('__hc.monks().live[0]');
    console.log('  monk: '+JSON.stringify(m));
    const aim=await page.evaluate(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
      const m=__hc.monks().live[0]; let best=null;
      for(let i=0;i<64;i++){ const yaw=i/64*Math.PI*2;
        for(const pit of [-0.16,-0.08,0.0,0.08]){ __hcBR.look(yaw,pit); await f(); await f();
          const s=__hc.screenOf(m.x,m.y+1.0,m.z);
          if(s.onScreen){ const off=Math.hypot(s.px-s.w/2,s.py-s.h/2); if(!best||off<best.off) best={yaw:+yaw.toFixed(3),pit,off:+off.toFixed(0)}; } } }
      if(best){ __hcBR.look(best.yaw,best.pit); await f(); await f(); }
      __hc.monkFace(); await f(); await f();
      const mm=__hc.monks().live[0];
      return { best, feet:__hc.screenOf(mm.x,mm.y,mm.z), head:__hc.screenOf(mm.x,mm.y+2.0,mm.z), pos:__hc.probe() }; })()`);
    console.log('  aim: '+JSON.stringify(aim.best)+'\n  feet '+JSON.stringify(aim.feet)+'\n  head '+JSON.stringify(aim.head));
    await sleep(900);
    const p=path.join(OUT,'monk-probe.png'); await page.screenshot({path:p});
    const { decodePNG }=await import('./pngprobe.mjs'); const img=decodePNG(fs.readFileSync(p));
    const cy0=Math.max(0,Math.min(aim.head.py,aim.feet.py)|0), cy1=Math.min(img.h-1,Math.max(aim.head.py,aim.feet.py)|0);
    const hh=Math.max(6,(cy1-cy0)), hw=Math.max(4,(hh*0.30)|0);
    const cx=(aim.feet.px|0), x0=Math.max(0,cx-hw), x1=Math.min(img.w-1,cx+hw);
    console.log('  his box on screen: x '+x0+'..'+x1+'  y '+cy0+'..'+cy1);
    const hist={};
    let blue=0, gold=0, skin=0, tot=0;
    for(let y=cy0;y<=cy1;y++) for(let x=x0;x<=x1;x++){ const i=(y*img.w+x)*img.ch, r=img.data[i], g=img.data[i+1], b=img.data[i+2]; tot++;
      const k=((r>>5)<<10)|((g>>5)<<5)|(b>>5); hist[k]=(hist[k]||0)+1;
      if(b>r+18 && b>g+10) blue++;
      if(r>140 && g>100 && b<130 && r>b+50) gold++;
      if(r>150 && g>110 && b>70 && r>b+40 && g>b+20) skin++; }
    const top=Object.entries(hist).sort((a,b)=>b[1]-a[1]).slice(0,8)
      .map(([k,n])=>{ k=+k; return '('+(((k>>10)&31)*8)+','+(((k>>5)&31)*8)+','+((k&31)*8)+')x'+n; });
    console.log('  in his box ('+tot+' px):  blue-dominant '+blue+'   gold '+gold+'   skin '+skin);
    console.log('  top colours: '+top.join('  '));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
