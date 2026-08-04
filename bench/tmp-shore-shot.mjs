// LOOK AT THE SHORE. The shelf numbers say the wadeable band doubled; this is the frame Ben will actually judge.
// Two shots from the SAME camera, seconds apart, with the shelf dial the only difference — and the terrain re-meshed between
// them, because a height change nothing rebuilds is a change you cannot see.
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
    const page=await (await browser.newContext({viewport:{width:1100,height:620}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,200)));
    // ONE SHOT, at the shipped setting. An in-page A/B is not available and pretending otherwise would be worse than not doing
    // it: __hc.shelf changes the heightfield, but the chunks around the camera were already generated and meshed under the old
    // value, so a "before" taken that way would be the new dial drawn on the old terrain. The A/B that matters is numeric and
    // lives in assert-shore-shelf; this is here to be looked at.
    const shoot=async(k,tag)=>{
      await page.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:90000});
      await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',{timeout:90000});
      await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',{timeout:90000});
      await sleep(9000);
      await page.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
      await page.evaluate('__hc.setTime(0.5)');
      // STAND ON THE BEACH AND FACE THE SEA. The first version teleported to the chapel's own coordinates and photographed the
      // inside of the chapel — its stained-glass window, from two blocks away. The camera has to be put on the waterline of a
      // KNOWN bearing and aimed down it, which means asking shoreProfile where that bearing's coast actually is.
      const prof=await page.evaluate('__hc.shoreProfile(24,2)');
      const b=prof.perBearing.reduce((a,o)=>(o.shallowBlocks>a.shallowBlocks?o:a), prof.perBearing[0]);   // the widest shelf: the frame that shows the change
      const th=b.bearing*Math.PI/180, cs=Math.cos(th), sn=Math.sin(th);
      const px=Math.round(500+cs*(b.coast-8)), pz=Math.round(0+sn*(b.coast-8));
      await page.evaluate('__hc.tp('+px+','+pz+')'); await sleep(8000);
      // THE PLAYER'S YAW CONVENTION NEGATES THE DIRECTION. portalProbe faces the door with atan2(-(dx),-(dz)), not atan2(dx,dz)
      // — the animal one. Using the animal form here aimed the camera 180 degrees out and photographed the forest behind it.
      await page.evaluate('__hcBR.look('+Math.atan2(-cs,-sn).toFixed(4)+',-0.10)'); await sleep(2000);
      await page.screenshot({path:path.join(OUT,'shore-'+tag+'.png')});
      console.log('  '+tag+'  shelfK='+k+'  wadeable median '+prof.shallow.median+'  mean '+prof.shallow.mean
        +'   standing at '+px+','+pz+' on bearing '+b.bearing+' (coast r'+b.coast+', shelf '+b.shallowBlocks+' blocks)');
    };
    await shoot(0.35,'shipped');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
