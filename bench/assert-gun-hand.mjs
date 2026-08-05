// IS THE HAND ACTUALLY ON THE GUN? (Ben 08-04, on the third failed attempt: "I would rather land this in one try".)
//
// A 120-pixel hand in the corner of a frame cannot answer this, which is why three visual passes did not. What CAN answer it is
// the distance from the forearm's own far tip — buildFist's box spans z -0.515..+0.035, so the -z end is the hand — to the grip
// point the gun's builder declared in userData.gripAt. That number should be zero, per gun, and the elbow must sit BEHIND the
// palm or the arm is inside-out with the palm nearest the eye (the "two cream slabs" failure).
//
// usage: node bench/assert-gun-hand.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';
const ROOT='D:/code/Minecraft', PAGE=process.env.HC_PAGE||'index.html';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
(async()=>{
  const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null,bad=0;
  const say=(ok,msg)=>{ console.log((ok?'ok   ':'FAIL ')+msg); if(!ok) bad++; };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/'+PAGE+'?debug=1&rd=10',{waitUntil:'load',timeout:90000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(3000);
    say(await pg.evaluate('__hc.gunHandOn()')===true, 'the hand is enabled (GUN_HAND_ON)');
    const rows=await pg.evaluate('__hc.gunGrips()');
    if(rows.err){ console.log('ERR '+rows.err); process.exitCode=1; return; }
    console.log('gun'.padEnd(10)+'gripAt'.padEnd(26)+'palm off'.padStart(9)+'  elbow behind palm');
    for(const r of rows) console.log(r.gun.padEnd(10)+String(JSON.stringify(r.gripAt)).padEnd(26)+String(r.off).padStart(9)+'      '+r.elbowBehindPalm);
    for(const r of rows){
      say(r.hand===true, r.gun+': a hand is attached');
      say(!!r.gripAt, r.gun+': the model declares its own grip point');
      // 5 mm. The grip boxes are 3-5 cm across, so anything looser than this is visibly off the grip.
      say(r.off<0.005, r.gun+': the palm lands ON the grip (off by '+r.off+')');
      say(r.elbowBehindPalm>0.05, r.gun+': the forearm runs BACK from the palm, not into the eye (elbow '+r.elbowBehindPalm+' behind)');
    }
    // ---- AND IT IS NOT A SLAB IN THE EYE ----
    // The arithmetic above proves the palm sits where the MODEL says its grip is; it cannot prove the result is not filling the
    // screen, which is the actual thing that failed three times. buildFist's one material is 0xcbb89a, so counting cream pixels
    // in a real frame measures exactly that. Held-item fog tints it toward the fog colour with depth, hence the wide tolerance.
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await pg.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{});
    await pg.evaluate('__hc.setTime(0.42)');
    await sleep(1500);
    const OUT=path.join(ROOT,'bench','results'); fs.mkdirSync(OUT,{recursive:true});
    const cream=(file)=>{ const {w,h,ch,data:D}=decodePNG(fs.readFileSync(file)); let n=0;
      for(let i=0;i<w*h;i++){ const o=i*ch, r=D[o],g=D[o+1],bl=D[o+2];
        if(Math.abs(r-203)<46 && Math.abs(g-184)<46 && Math.abs(bl-154)<52 && r>g && g>bl) n++; }
      return {frac:+(n/(w*h)).toFixed(4), px:n, w, h}; };
    for(const gun of ['ar15','revolver','bolt','shotgun']){
      await pg.evaluate('__hc.hold("'+gun+'")');
      await sleep(900);
      const f=path.join(OUT,'gunhand-'+gun+'.png');
      await pg.screenshot({path:f});
      const c=cream(f);
      console.log('  '+gun.padEnd(9)+' hand pixels: '+String(c.px).padStart(7)+'  = '+(c.frac*100).toFixed(2)+'% of the frame');
      // One forearm at the bottom of the frame. The failure mode was two slabs filling it, which measured as most of the frame.
      say(c.frac<0.16, gun+': the hand does not fill the frame ('+(c.frac*100).toFixed(2)+'%)');
      say(c.px>200, gun+': …but it IS drawn ('+c.px+' px) rather than silently absent');
    }
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
  console.log(bad?('FAILED '+bad):'PASS');
  if(bad) process.exitCode=1;
})().catch(e=>{ console.error(e); process.exit(1); });
