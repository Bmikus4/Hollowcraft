// PHOTOGRAPH THE FAMILY. Ben: "the wretch creatures dont look very good". That is a verdict on pixels, so this produces
// pixels: all four creatures, at a range where the body fills a useful part of the frame, in daylight and in dark, written
// somewhere he can open.
//
// It also produces the numbers a look-critique needs, because "flat" and "wet" are measurable. Inside the creature's own
// screen box:
//   mean    — how bright the body is overall. A wet dark creature is LOW here.
//   max     — the brightest pixel on it. A wet surface has a hot specular highlight, so max should be far above mean.
//   spread  — standard deviation. Flat matte plastic has a low spread; layered, shaded, wet tissue has a high one.
//   hi/lo   — fraction of the body above 0.6 and below 0.15. Both non-trivial means the light is sitting IN the surface
//             rather than on it; all-mid means it is a lit block.
//
//   node bench/look-family.mjs        → bench/results/look/<creature>-<light>.png
import { spawn, spawnSync } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench/results/look');
const W=900, H=600;
const TAG=process.env.LOOK_TAG||'';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
function pixels(file){ const r=spawnSync('ffmpeg',['-loglevel','error','-i',file,'-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:1<<28});
  if(r.status!==0) throw new Error('ffmpeg failed on '+file); return r.stdout; }
// Statistics over the creature's own box, ignoring pixels that did not change when it was hidden — so the background inside
// the box does not dilute the reading. That mask is the difference between measuring a creature and measuring a rectangle.
function bodyStats(withIt, without, box){
  const x0=Math.max(0,Math.floor(box.x*W)), x1=Math.min(W,Math.ceil((box.x+box.w)*W));
  const y0=Math.max(0,Math.floor(box.y*H)), y1=Math.min(H,Math.ceil((box.y+box.h)*H));
  const L=[];
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*W+x)*3;
    const d=(Math.abs(withIt[i]-without[i])+Math.abs(withIt[i+1]-without[i+1])+Math.abs(withIt[i+2]-without[i+2]))/3;
    if(d<=8) continue;                                   // background: unchanged when the body was hidden
    L.push((withIt[i]*0.2126+withIt[i+1]*0.7152+withIt[i+2]*0.0722)/255); }
  if(!L.length) return {px:0};
  const mean=L.reduce((a,b)=>a+b,0)/L.length;
  const sd=Math.sqrt(L.reduce((a,b)=>a+(b-mean)*(b-mean),0)/L.length);
  return { px:L.length, mean:+mean.toFixed(4), max:+Math.max(...L).toFixed(3), min:+Math.min(...L).toFixed(3),
           spread:+sd.toFixed(4), hi:+(L.filter(v=>v>0.6).length/L.length).toFixed(3), lo:+(L.filter(v=>v<0.15).length/L.length).toFixed(3),
           hotRatio:+(Math.max(...L)/Math.max(0.001,mean)).toFixed(2) };
}
(async()=>{
  const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null;
  try{
    fs.mkdirSync(OUT,{recursive:true});
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,140)));
    await pg.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await pg.waitForFunction("(()=>{try{const l=document.getElementById('load');return !l||l.style.display==='none';}catch(e){return false;}})()",null,{timeout:300000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(4000); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.hwHold(true)');   // hold the AI: a creature that walks off mid-shoot is not a portrait

    const rows=[];
    const portrait=async(kind, light, stand)=>{
      await ev('__hc.setTime('+(light==='day'?0.25:0.75)+')');
      await sleep(700);
      let look=await ev(`__hc.kindLook('${kind}', ${stand})`);
      await ev(`__hc.kindHide('${kind}',false)`); await sleep(350);
      look=await ev(`__hc.kindLook('${kind}', ${stand})`);
      await ev(`__hc.kindHide('${kind}',false)`); await sleep(350);
      if(look.err){ console.log('  '+kind+'/'+light+': '+look.err); return; }
      const bx={ x:Math.max(0,Math.min(1,look.box.x)), y:Math.max(0,Math.min(1,look.box.y)) };
      bx.w=Math.max(0,Math.min(1-bx.x, look.box.x+look.box.w-bx.x)); bx.h=Math.max(0,Math.min(1-bx.y, look.box.y+look.box.h-bx.y));
      const f1=path.join(OUT, kind+'-'+light+TAG+'.png'); await pg.screenshot({path:f1});
      await ev(`__hc.kindHide('${kind}',true)`); await sleep(350);
      const f2=path.join(OUT,'_hidden.png'); await pg.screenshot({path:f2});
      await ev(`__hc.kindHide('${kind}',false)`);
      const st=bodyStats(pixels(f1), pixels(f2), bx);
      rows.push({kind, light, ...st});
      console.log('  '+(kind+'/'+light).padEnd(18)+JSON.stringify(st));
    };

    // The Wretch has to be summoned and held; the forks are spawned by their own QA hooks.
    await ev('__hc.wretchArm(true,true)'); await ev('__hc.wretchAt(10)');
    await ev('__hc.meek(1)');
    await ev('__hc.burrower(9)');
    for(let i=0;i<40;i++){ const r=await ev('__hc.burrower()'); if(r.visible) break; await sleep(120); }
    await ev('__hc.tenBox()'); await sleep(900); await ev('__hc.tenant(true)'); await sleep(600);

    for(const light of ['day','dark']){
      console.log('\n['+light+']');
      await portrait('wretch',  light, 9);
      await portrait('meek',    light, 6);
      await portrait('burrower',light, 8);
      await portrait('tenant',  light, 6);
    }
    console.log('\n  frames in '+OUT);
    console.log('  '+JSON.stringify(rows));
  } finally {
    try{ if(b) await b.close(); }catch(e){}
    try{ srv.kill(); }catch(e){}
  }
})();
