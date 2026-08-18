// WHAT DRAWS THE ORANGE DOTS AT NOON. Ben has reported them through three hunts; every previous one
// framed them as night-only and looked at the volumetric pass, the embers and the leaves. The shore
// vantage of look-horizon.mjs photographs them in a NOON sky over open water, which is a frame no
// previous hunt had: nothing warm is behind that sky, so a warm speck there is drawn ON it.
// Four conditions, same camera, interleaved, five frames each: baseline, leaves off, lamp points off,
// both off. The detector is neighbourhood-relative (a speck must beat its own 9x9 by 12 levels) and
// warm (r>g>b, r-b>25), with the HUD zones cut out.
import { spawn, spawnSync } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench/results/orange');
const W=1200, H=700;
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
function pixels(file){ const r=spawnSync('ffmpeg',['-loglevel','error','-i',file,'-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:1<<28});
  if(r.status!==0) throw new Error('ffmpeg failed'); return r.stdout; }
// HUD out: the left rail, the bottom bars, the objective text top-left, the crosshair.
const inHud=(x,y)=> (x<270&&y>540) || (x<260&&y<60) || (Math.abs(x-W/2)<18&&Math.abs(y-H/2)<18);
function specks(buf){
  const hits=[];
  // THE WINDOW IS THE OPEN SKY RIGHT OF THE SHORE TREE, y above the horizon band. Everything left of
  // 430 at this bearing is canopy, and a leaf crown against a sky gap satisfies any warm-speck test
  // ever written -- two cuts of this detector counted the tree and called it the fault.
  for(let y=20;y<340;y++) for(let x=430;x<W-10;x++){
    if(inHud(x,y)) continue;
    const i=(y*W+x)*3, r=buf[i], g=buf[i+1], b=buf[i+2];
    if(!(r>g && g>b && r-b>40)) continue;
    // IT IS A CHROMA EXCESS AGAINST A RING, not a brightness excess against a 9x9. Two cuts of this
    // measured nothing useful. A plain 9x9 brightness test counted 200-300 a frame and they were the
    // canopy -- autumn crowns and bark are warm and beat their own neighbourhood, and that is the world
    // drawing correctly. Requiring a BLUE surround then counted zero, because the sky these dots sit on
    // is hazy grey near the horizon, not blue. What separates them is that the speck is far warmer than
    // the ground it is on: dot (186,137,112) on a surround of (174,148,135) is chroma 74 against 39.
    // THE SAMPLE IS A RING AT RADIUS 7-9, because a dot is three or four pixels across and a 9x9 box
    // includes it -- that self-contamination is what lifted the surround's chroma to 39 in the first place.
    let sr=0,sg=0,sb=0,n=0;
    for(let dy=-9;dy<=9;dy++)for(let dx=-9;dx<=9;dx++){ const m=Math.max(Math.abs(dx),Math.abs(dy)); if(m<7) continue;
      const j=((y+dy)*W+(x+dx))*3; sr+=buf[j]; sg+=buf[j+1]; sb+=buf[j+2]; n++; }
    sr/=n; sg/=n; sb/=n;
    if(Math.abs(sr-sb)>34) continue;                          // the surround is not sky/haze but something warm
    if((r-b)-(sr-sb) > 25 && r-sr > 6) hits.push([x,y]);
  }
  // cluster to dots (8px)
  const dots=[]; for(const [x,y] of hits){ let f=null;
    for(const d of dots) if(Math.abs(d.x-x)<8 && Math.abs(d.y-y)<8){ f=d; break; }
    if(f){ f.n++; } else dots.push({x,y,n:1}); }
  return dots;
}
(async()=>{ const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null;
  try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    fs.mkdirSync(OUT,{recursive:true});
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await pg.waitForFunction("(()=>{try{const l=document.getElementById('load');return !l||l.style.display==='none';}catch(e){return false;}})()",null,{timeout:300000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(4000); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)');
    await ev('__hc.cam({yaw:'+(158*Math.PI/180).toFixed(4)+', pitch:0})');
    console.log('lampPts '+JSON.stringify(await ev('__hc.lampPts()')));
    console.log('leaves  '+JSON.stringify(await ev('__hc.leaves()')).slice(0,120));
    const cond={
      base:  ()=>ev('__hc.leaves(true), __hc.lampPts(true)'),
      noLeaf:()=>ev('__hc.leaves(false), __hc.lampPts(true)'),
      noLamp:()=>ev('__hc.leaves(true), __hc.lampPts(false)'),
      neither:()=>ev('__hc.leaves(false), __hc.lampPts(false)'),
    };
    const res={}; for(const k in cond) res[k]=[];
    for(let rep=0; rep<3; rep++){
      for(const k in cond){ await cond[k](); await sleep(700);
        const f=path.join(OUT,k+'_'+rep+'.png'); await pg.screenshot({path:f});
        const d=specks(pixels(f)); res[k].push(d.length);
        if(rep===0) console.log('  '+k.padEnd(8)+d.length+' dots  '+JSON.stringify(d.slice(0,8).map(o=>[o.x,o.y])));
      } }
    console.log('\n  condition   dots per frame (3 reps)   median');
    for(const k in res){ const a=res[k].slice().sort((p,q)=>p-q); console.log('  '+k.padEnd(11)+JSON.stringify(res[k])+'   '+a[1]); }
    console.log('  frames in '+OUT);
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
})();
