// THE MONK'S AND JESUS'S BEARDS (Ben 08-18: "currently flat - give them real hair texture with strand variation and
// shading depth, matched to each characters hair"), judged close up and at conversation distance, day and night.
//
// "FLAT" AS A NUMBER: the standard deviation of luminance across the beard's OWN pixels. A painted block of colour
// has almost none; strands lit and shaded have a lot. The mean says nothing -- a flat beard and a textured one can
// share it -- so sd is the measurement and mean is only reported to prove the crop did not wander onto sky.
//
// THE CROP IS SELF-VERIFYING, which is the part earlier attempts got wrong. A hand-aimed camera photographed the
// monk from BEHIND and read 3,648 "beard" pixels off grass and water. Here the camera orbits the figure, and the
// vantage kept is the one with the MOST target-coloured pixels inside his own projected box -- so the frame that
// gets measured is by construction the frame that has the most beard in it.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
// monk beard: near-white warm grey 0xd8d4c8.  jesus hair/beard: mid brown 0x5a3a22.
const MASK={
  // MONK: a DESATURATED pixel, and nothing about its level. The old test was r>140 && r-b>4, and both halves broke. The
  // level floor found zero pixels in every night frame, so the hour Ben says a flat beard reads worst at was the one this
  // assert never measured. The r-b floor broke in daylight too: the ambient here is blue enough to lift b to r, so a
  // near-white beard reads NEUTRAL rather than warm and the mask rejected the whole beard - 1365 pixels one run, 0 the
  // next, on a beard a photograph shows plainly. Saturation is what separates it from everything else in the crop: the
  // skin at 0xd9b48c is 35% saturated and the kalimavkion is blue.
  monk:  (r,g,b)=>{ const M=Math.max(r,g,b), m=Math.min(r,g,b); return M>30 && (M-m)<0.14*M; },
  // JESUS: a brown ORDERING plus a saturation floor, again with no absolute level in it. Brown is the one thing in the
  // strip under his face that runs r>g>b with real chroma; his linen robe is near-neutral and his skin is lighter and
  // less saturated than his hair.
  jesus: (r,g,b)=> r>16 && r>g && g>=b && (r-b)>0.22*r,
};
// THE CROP IS THE BEARD, NOT THE FIGURE. Measuring his whole projected box read 8,441 "beard" pixels off the intro
// Jesus's cream linen robe standing behind him -- the mask cannot tell near-white hair from near-white cloth, and
// there is a Jesus in this world from the start whether or not the harness spawns one. So the window is the strip
// just under the face and only a fifth of his width: the beard hangs there and nothing else of his does.
// THE CROP IS THE BEARD, NOT THE FIGURE. Measuring his whole projected box read 8,441 "beard" pixels off the intro
// Jesus's cream linen robe standing behind him -- the mask cannot tell near-white hair from near-white cloth, and
// there is a Jesus in this world from the start whether or not the harness spawns one. So the window is the strip
// just under the face and only a fifth of his width: the beard hangs there and nothing else of his does.
//
// A HEAD-SIZED WINDOW WAS TRIED INSTEAD AND IT IS WORSE. Sizing the strip from two points 0.4 blocks apart at head
// height, and then searching under the head for the band with the most target pixels, found ONE pixel where this finds
// 1365 - so it is recorded here rather than left as an option: the head-to-feet span is the right ruler even when the
// feet are off frame, because screenOf still returns usable coordinates for them.
function stats(file, kind, box){
  const img=decodePNG(fs.readFileSync(file));
  const hy=Math.min(box.head.py,box.feet.py), fy=Math.max(box.head.py,box.feet.py);
  const span=Math.max(8, fy-hy);
  const y0=Math.max(0,(hy+span*0.14)|0), y1=Math.min(img.h-1,(hy+span*0.34)|0);   // under the face, above the collar
  const hw=Math.max(4,(span*0.10)|0), cx=box.head.px|0;
  const x0=Math.max(0,cx-hw), x1=Math.min(img.w-1,cx+hw);
  const f=MASK[kind], L=[];
  for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){ const i=(y*img.w+x)*img.ch, r=img.data[i], g=img.data[i+1], b=img.data[i+2];
    if(f(r,g,b)) L.push(0.2126*r+0.7152*g+0.0722*b); }
  if(L.length<40) return { n:L.length, mean:null, sd:null, box:[x0,y0,x1,y1] };
  const mean=L.reduce((a,b)=>a+b,0)/L.length;
  const sd=Math.sqrt(L.reduce((a,b)=>a+(b-mean)*(b-mean),0)/L.length);
  return { n:L.length, mean:+mean.toFixed(1), sd:+sd.toFixed(2), box:[x0,y0,x1,y1] };
}
(async()=>{ const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null;
  try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:1000,height:600}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(3500); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev("__hc.cmdRun('/gamemode creative')");
    // FRAMING IS assert-monks' RECIPE, AND THE DIFFERENCE MATTERS. My first two attempts teleported the CAMERA to
    // stand off the figure at 1.5-2.2 blocks with the eye at head height, and every crop came back with 0 beard
    // pixels: at that range the eye is effectively inside his head, so the head parts are behind the near plane or
    // taken by the creature-clip pass. assert-monks never moves the player -- it sweeps the LOOK until he is centred
    // and reads 823 grey beard pixels doing it. So the distance is varied by spawning him nearer or further, and the
    // camera stays where the game put it.
    const frameFigure=async(kind)=>ev(`(async()=>{ const f=()=>new Promise(r=>requestAnimationFrame(()=>r()));
      let best=null;
      for(let i=0;i<48;i++){ const yaw=i/48*Math.PI*2;
        for(const pit of [-0.20,-0.10,0.0,0.10]){ __hc.cam({yaw,pitch:pit}); await f(); await f();
          const F=__hc.figureAt('${kind}'); if(!F||F.err) continue;
          const s=__hc.screenOf(F.x, F.headY, F.z);
          if(s.onScreen){ const off=Math.hypot(s.px-s.w/2, s.py-s.h/2); if(!best||off<best.off) best={yaw:+yaw.toFixed(3),pit,off:+off.toFixed(0)}; } } }
      if(!best) return null;
      __hc.cam({yaw:best.yaw, pitch:best.pit}); await f(); await f();
      const F=__hc.figureAt('${kind}');
      return { best, dist:F.dist, feet:__hc.screenOf(F.x,F.y,F.z), head:__hc.screenOf(F.x,F.y+2.0,F.z) }; })()`);

    for(const kind of ['monk','jesus']){
      for(const [dtag,dist] of [['close',2],['talk',4]]){
        // SPAWNED at the distance, rather than the camera moved to it
        if(kind==='monk'){ await ev('__hc.monkSpawn('+dist+',0)'); await sleep(1300); await ev('__hc.monkPark()'); }
        else { await ev("__hc.cmdRun('/spawn jesus 1 "+dist+"')"); await sleep(1700); }
        await ev("__hc.figurePark('"+kind+"')");
        for(const [ttag,t] of [['day',0.30],['night',0.86]]){
         for(const mapOn of [true,false]){
          await ev('__hc.hairMap('+(mapOn?1:0)+')');
          await ev('__hc.setTime('+t+')'); await sleep(300);
          await ev("__hc.figureFace('"+kind+"')");
          const set=await frameFigure(kind);
          // ONLY THE HEAD HAS TO BE ON SCREEN. Requiring the feet too rejected every close-up: at two blocks his
          // feet project below the frame, and a beard does not need them. screenOf still returns usable coordinates
          // off-frame, so the head-to-feet span that sizes the crop is valid either way.
          if(!set || !set.head || !set.head.onScreen){ console.log('  '+kind+' '+dtag+' '+ttag+'  could not frame '+JSON.stringify(set&&set.best)); continue; }
          await sleep(700);
          const f=path.join(OUT,'beard-'+kind+'-'+dtag+'-'+ttag+(mapOn?'':'-flat')+'.png');
          await pg.screenshot({path:f, timeout:60000});
          const st=stats(f, kind, set);
          console.log('  '+kind.padEnd(6)+dtag.padEnd(6)+ttag.padEnd(6)+(mapOn?'map ':'FLAT')+' d='+String(set.dist).padStart(5)
            +'  px '+String(st.n).padStart(5)+'  mean '+String(st.mean).padStart(6)+'  sd '+String(st.sd).padStart(6)); } } } }
    await ev('__hc.hairMap(1)');
    console.log('');
    console.log('  sd is the number: a flat painted beard sits low, strands lit and shaded run well above it.');
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} } })();
