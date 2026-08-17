// PHOTOGRAPH THE HUMAN CHARACTER FROM EVERY SIDE. Two questions, and only a frame answers either.
//
// (1) DID SHE ARRIVE AT ALL, and with her maps? A GLB can parse cleanly and bind no textures — a white mannequin — or bind
// every map onto geometry that never reached the scene. The probe reports which material names found a texture; the frames
// say whether any of it is on screen.
//
// (2) ARE THERE HOLES WHERE THE CLOTHES WERE? This is the usual failure of exporting a character without her clothing: many
// models have no geometry or no UVs under a bikini because nothing ever saw it. So she is shot from four sides and the body
// is measured against the sky behind it — a hole reads as background pixels inside the silhouette, which is a number, and a
// smeared UV reads as a flat patch, which is not, so the frames go to Ben.
//
//   node bench/look-human.mjs   → bench/results/human/<angle>.png
import { spawn, spawnSync } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench/results/human');
const W=900,H=700;
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
function pixels(f){ const r=spawnSync('ffmpeg',['-loglevel','error','-i',f,'-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:1<<28});
  if(r.status!==0) throw new Error('ffmpeg failed on '+f); return r.stdout; }
(async()=>{ const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null;
  try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    fs.mkdirSync(OUT,{recursive:true});
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,180)));
    await pg.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:120000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await pg.waitForFunction("(()=>{try{const l=document.getElementById('load');return !l||l.style.display==='none';}catch(e){return false;}})()",null,{timeout:300000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(4000); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)'); await ev('__hc.cam({pitch:0})');

    // She loads in the background, so the first ask can legitimately be too early — that is a wait, not a failure.
    // AT HER REAL SIZE. Ben: "make the fox girl 4x bigger" — photographing her at 1.8 would be a picture of a character
    // that is not in the game. The height comes from the engine's own constant so this frame cannot drift from her.
    const HGT=await ev("(()=>{ try{ return FOXGIRL_H; }catch(e){ return 7.2; } })()") || 7.2;
    let info=null;
    for(let i=0;i<40;i++){ info=await ev('__hc.human('+(HGT*2.2).toFixed(1)+', '+HGT+')'); if(!info.err) break; await sleep(500); }
    console.log('  ' + JSON.stringify(info));
    if(info.err){ console.log('  she never loaded'); return; }

    // FOUR SIDES. kindLook's trick does not apply — she is not a Wretch instance — so the camera walks a circle around her
    // instead, which is also how a player would look for a hole.
    const at=info.at;
    const shot=async(tag, ang, r)=>{
      const x=at[0]+Math.cos(ang)*r, z=at[2]+Math.sin(ang)*r;
      // EYE AT HER MID-HEIGHT AND THE CAMERA LEVEL. The first run put the eye a block above her hips and pitched down, which
      // framed her from the thighs up and read as a figure kneeling — the frames were about the camera, not about her.
      // tpExact SETS THE FEET, AND THE CAMERA IS AN EYE HEIGHT ABOVE THEM. Passing her mid-height put the lens 1.6 blocks
      // over her head and photographed the sea; the player's own eye offset has to come off the number. It is read from the
      // engine rather than assumed, because a constant here is a frame nobody can trust.
      const eye = await ev('__hc.probe().eye') || 1.62;
      await ev(`__hc.tpExact(${x.toFixed(3)}, ${z.toFixed(3)}, ${(at[1]+(info.worldSize?info.worldSize[1]:1.8)*0.5-eye).toFixed(3)})`);
      await ev(`__hc.cam({yaw:${Math.atan2(-(at[0]-x), -(at[2]-z)).toFixed(4)}, pitch:0})`);
      await sleep(700);
      const f=path.join(OUT, tag+'.png'); await pg.screenshot({path:f});
      // A crude read on "is there a body here at all": count pixels that are neither sky-blue nor grass-green in the middle
      // third of the frame. It cannot find a hole for you — that is what the frames are for — but it can tell a character
      // that rendered from one that silently did not.
      const buf=pixels(f); let body=0, tot=0;
      for(let y=(H*0.15)|0; y<(H*0.92|0); y++) for(let x=(W*0.33)|0; x<(W*0.67|0); x++){
        const i=(y*W+x)*3, R=buf[i], G=buf[i+1], B=buf[i+2]; tot++;
        if(!(B>R+12 && B>G+6) && !(G>R+14 && G>B+14)) body++; }
      console.log('  '+tag.padEnd(7)+(100*body/tot).toFixed(1)+'% non-sky non-grass in the middle third   '+f);
    };
    for(const [tag,ang] of [['front',0],['left',Math.PI/2],['back',Math.PI],['right',-Math.PI/2]]) await shot(tag, ang, (info.worldSize?info.worldSize[1]:1.8)*2.0);
    await shot('close', 0.6, (info.worldSize?info.worldSize[1]:1.8)*0.9);
    console.log('  frames in '+OUT);
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
})();
