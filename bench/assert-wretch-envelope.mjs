// HOW MUCH OF THE WRETCH IS INSIDE THE WORLD, AND HOW WIDE IT ACTUALLY IS.
// 873d919 measured 89% of samples with some part of the rig buried and shipped no fix, because the two cheap
// corrections it tried were inside the harness's own noise. Its verdict on what would work: "a collision envelope
// that fits the creature rather than a capsule about its feet ... then foot IK". This is the harness that has to
// show either of those beating 89%, and it prints the CONTROL and the limb breakdown rather than a verdict.
//
//   node bench/assert-wretch-envelope.mjs            → measure whatever is in the file
//   HC_ENV=0 node bench/assert-wretch-envelope.mjs   → the same run with the envelope off (the control pair)
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const ENV = process.env.HC_ENV==null ? null : (process.env.HC_ENV!=='0');
const IK  = process.env.HC_IK==null ? null : (process.env.HC_IK!=='0');
const ARM = process.env.HC_ARM==null ? null : (process.env.HC_ARM!=='0');
(async()=>{
  const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null, bad=0;
  const say=(ok,msg)=>{ console.log((ok?'  ok    ':'  FAIL  ')+msg); if(!ok) bad++; };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(3500);
    const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)');
    await ev('__hc.wretchArm(true,true)');
    if(ENV!==null) console.log('  envelope forced '+JSON.stringify(await ev('__hc.wretchEnv('+ENV+')').catch(()=>'(no dial)')));
    if(IK !==null) console.log('  foot IK  forced '+JSON.stringify(await ev('__hc.footIK('+IK+')').catch(()=>'(no dial)')));
    if(ARM!==null) console.log('  arm fold forced '+JSON.stringify(await ev('__hc.armFold('+ARM+')').catch(()=>'(no dial)')));

    // A STALK THROUGH THE TREES, not a creature parked against one wall: 873d919's own noise finding was that a
    // single parked condition scores 285 and 357 on repeats. Three rounds, dropped 22 blocks out each time, gaze
    // averted so it hunts rather than flees, and every poll re-commits because the grace gate clears it.
    const samples=[]; let span=null;
    for(let round=0; round<3; round++){
      await ev('__hc.setTime(0.0)');
      await ev('__hc.wretchAt(22)');
      await ev('__hc.cam({yaw:Math.PI/2,pitch:0})');
      for(let i=0;i<50;i++){
        await ev('__hc.setTime(0.0)');
        await ev('__hc.wretchCommit()');
        const r=await ev('__hc.rigBuried()');
        if(r && !r.err){ const c=await ev('__hc.bodyClear()'); r.clear=(c&&!c.err)?c.clear:null;
          const ik=await ev('__hc.footIK()'); r.ik=ik&&!ik.err?ik:null;
          const ds=await ev('__hc.limbInSolid()'); r.deep=ds&&!ds.err?ds:null;
          const sp=await ev('__hc.rigSpan()'); if(sp && !sp.err){ r.yLo=sp.yLo; r.pose=sp.state; r.crawl=sp.crawl; r.yLoBy=sp.yLoBy; r.low=sp.low; if(!span) span=sp; }
          samples.push(r); }
        await sleep(60); } }

    if(!samples.length){ say(false,'the creature never came alive in this harness'); return; }
    const withAny = samples.filter(s=>s.buried>0).length;
    const tot={}; let meshes=0;
    for(const s of samples){ meshes+=s.buried; for(const k in s.by) tot[k]=(tot[k]|0)+s.by[k]; }
    const grp={arms:0, legs:0, body:0, other:0};
    for(const k in tot){ if(/^arm/.test(k)) grp.arms+=tot[k]; else if(/^leg/.test(k)) grp.legs+=tot[k];
      else if(/^spine|^neck|^head/.test(k)) grp.body+=tot[k]; else grp.other+=tot[k]; }
    const pct=100*withAny/samples.length;
    console.log('  span    '+JSON.stringify(span));
    console.log('  samples '+samples.length+'   with any part buried '+withAny+'  ('+pct.toFixed(1)+'%)');
    console.log('  buried meshes '+meshes+'   by limb '+JSON.stringify(grp));
    // THE ENVELOPE'S OWN NUMBER. rigBuried cannot see the torso (CLIP_BIG excludes it), so the burial rate is
    // dominated by arms and feet and moves by 6 points between repeats of the SAME condition. Clearance is what
    // the envelope changes: how close the body's centre gets to a solid face while it is walking.
    const cl=samples.map(s=>s.clear).filter(v=>v!=null).sort((a,b)=>a-b);
    const inside=cl.filter(v=>v<0.45).length;
    if(cl.length) console.log('  clearance  min '+cl[0].toFixed(3)+'  p10 '+cl[Math.floor(cl.length*0.1)].toFixed(3)
      +'  median '+cl[Math.floor(cl.length/2)].toFixed(3)+'   samples under 0.45: '+inside+' of '+cl.length);
    // FOOT IK'S OWN NUMBER: how far the rig's lowest point sits BELOW the creature's own ground contact. FK legs
    // put a whole block of leg in the dirt on any break in the ground; nothing about the burial rate can see it,
    // because a foot in the floor and a foot on the floor are the same mesh in the same place to _meshBuried.
    const yl=samples.map(s=>s.yLo).filter(v=>v!=null).sort((a,b)=>a-b);
    if(yl.length) console.log('  lowest point below the body   worst '+yl[0].toFixed(2)
      +'  p10 '+yl[Math.floor(yl.length*0.1)].toFixed(2)+'  median '+yl[Math.floor(yl.length/2)].toFixed(2));
    // WHICH POSE THE WORST ONES ARE IN. "worst -1.01, unattributed" was left in 9ebb6eb; a deep-crawl gallop and
    // a stand are different claims and the fix for one is not the fix for the other.
    const deep=samples.filter(s=>s.yLo!=null).sort((a,b)=>a.yLo-b.yLo).slice(0,8)
      .map(s=>({yLo:s.yLo, by:s.yLoBy, pose:s.pose, crawl:s.crawl, low:s.low}));
    // THE NUMBER FOR "WAVES HIS ARMS THROUGH TREES": sample points inside a solid that has solid above it, so a
    // planted hand on the ground is excluded and only a limb in a trunk, a wall or a bank counts.
    const dp=samples.map(s=>s.deep).filter(Boolean);
    if(dp.length){ const sum=k=>dp.reduce((a,b)=>a+(b[k]||0),0);
      console.log('  in a trunk    arms '+sum('arms')+'  legs '+sum('legs')+'  head '+sum('head')
        +'   frames with any arm in one: '+dp.filter(d=>d.arms>0).length+' of '+dp.length); }
    console.log('  worst poses   '+JSON.stringify(deep));
    // DOES THE INTEGRATOR EVER ENGAGE. An offset that stays at zero means the limb was never through the floor
    // and the correction is a no-op whatever its sign.
    const iks=samples.map(s=>s.ik).filter(Boolean);
    const mx=a=>a.length?Math.max(...a):0;
    console.log('  ik engaged    legs max '+mx(iks.map(k=>mx(k.legs||[]))).toFixed(3)
      +'  arms max '+mx(iks.map(k=>mx(k.arms||[]))).toFixed(3)
      +'  frames with an arm fold '+iks.filter(k=>mx(k.arms||[])>0.01).length+' of '+iks.length
      +'  gate open '+iks.filter(k=>k.armGate).length+'  frames the rule SAW an arm in solid '+iks.filter(k=>(k.armSeen||0)>0).length
      +'  reaching frames '+iks.filter(k=>k.armGate===2).length
      +'  max fold while reaching '+mx(iks.filter(k=>k.armGate===2).map(k=>mx(k.arms||[]))).toFixed(3)
      +'  frames with a leg offset '+iks.filter(k=>mx(k.legs||[])>0.01).length+' of '+iks.length);
    // AND HOW HARD IT PULLS. The same column-height probe that defeated the forelimb version lets a leg beside a
    // trunk read as deeply underground, so the distribution matters: a median near the cap would be a creature
    // permanently folded, which is a look regression the burial numbers would never show.
    const legv=iks.map(k=>mx(k.legs||[])).sort((a,b)=>a-b);
    if(legv.length) console.log('  leg offset    median '+legv[Math.floor(legv.length/2)].toFixed(3)
      +'  p90 '+legv[Math.floor(legv.length*0.9)].toFixed(3)+'  at cap '+legv.filter(v=>v>=0.899).length+' of '+legv.length);
    console.log('  worst   '+JSON.stringify(samples.slice().sort((a,b)=>b.buried-a.buried)[0]).slice(0,180));
    say(pct < 89, 'burial rate '+pct.toFixed(1)+'% beats the 89% control of 873d919');
    console.log('\n  '+(bad?bad+' failed':'all ok'));
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} process.exit(bad?1:0); } })();
