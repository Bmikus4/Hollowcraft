// THREE GAITS, MEASURED. A gait is a claim about motion over time, so it cannot be judged from a frame and certainly not from a
// screenshot of a creature 120 px tall. This samples the actual bone angles at 25 Hz and reduces each run to two numbers — how far
// the limb swings (peak to peak, radians) and how many strides a second it makes — which is the difference between a scurry, a
// gallop and a thing standing perfectly still.
//
// WHY EACH ASSERTION IS WHAT IT IS:
//   Burrower  — no walk. Legs tucked and near-motionless, arms hauling out of phase. If the legs cycle, it is walking through soil.
//   Meek      — two gaits and nothing between. Scurrying they must be FASTER than the Wretch's gallop and shorter in stride;
//               watching they must be nearly still but NOT frozen, which is a floor as well as a ceiling.
//   Tenant    — no gait at all. Legs at zero, and the only motion in the whole body is the breath.
//
//   node bench/assert-gaits.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

// Reduce a frame-rate trace from __hc.rigTrace: rows are [phase, thigh0, arm0, groupY] recorded inside the animation frame with
// the animation clock, so the span is real seconds and a crossing count is a tempo rather than an artefact of the poll rate.
// Mean crossings rather than zero crossings, because every one of these joints swings around a rest angle far from zero.
function trace(rows, col){
  const v=rows.map(r=>r[col]);
  if(v.length<8) return {n:v.length, swing:0, hz:0};
  const span=rows[rows.length-1][0]-rows[0][0];
  const lo=Math.min(...v), hi=Math.max(...v), mean=v.reduce((a,b)=>a+b,0)/v.length;
  let cross=0; for(let i=1;i<v.length;i++) if((v[i-1]-mean)*(v[i]-mean)<0) cross++;
  return { n:v.length, span:+span.toFixed(2), swing:+(hi-lo).toFixed(3), hz:span>0?+((cross/2)/span).toFixed(2):0 };
}
// Peak-to-peak swing, and strides a second counted by mean crossings — mean rather than zero, because every one of these joints
// swings around a rest angle that is nowhere near zero and a zero-crossing count would report 0 Hz for a limb pumping hard.
function reduce(series, seconds){
  const v=series.filter(x=>typeof x==='number');
  if(v.length<4) return {n:v.length, swing:0, hz:0};
  const lo=Math.min(...v), hi=Math.max(...v), mean=v.reduce((a,b)=>a+b,0)/v.length;
  let cross=0; for(let i=1;i<v.length;i++) if((v[i-1]-mean)*(v[i]-mean)<0) cross++;
  return { n:v.length, swing:+(hi-lo).toFixed(3), hz:+((cross/2)/seconds).toFixed(2) };
}

(async()=>{
  const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null, bad=0;
  const say=(ok,msg)=>{ console.log((ok?'ok   ':'FAIL ')+msg); if(!ok) bad++; };
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:90000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(3500); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.75)');

    // 25 Hz is well over twice the fastest thing claimed here (4.5 strides a second), so nothing aliases.
    const sample=async(kind, seconds, tick)=>{
      const cols={thigh0:[],thigh1:[],shin0:[],arm0:[],arm1:[],headZ:[],headY:[],groupY:[]};
      const n=Math.round(seconds*25);
      let errs=0, last='';
      for(let i=0;i<n;i++){ if(tick) await tick(i);
        const r=await ev(`__hc.rigSample('${kind}')`);
        if(r.err){ errs++; last=r.err; await sleep(40); continue; }
        for(const k in cols) cols[k].push(r[k]);
        await sleep(40); }
      const out={}; for(const k in cols) out[k]=reduce(cols[k], seconds);
      // HOW MANY SAMPLES ACTUALLY CAME BACK, carried out with the result. A creature that dies or retires mid-run leaves a
      // short, still series that reads exactly like a creature holding perfectly still, and the two must never be confused.
      out._got=cols.thigh0.filter(x=>typeof x==='number').length; out._errs=errs; out._lastErr=last;
      return out;
    };

    // ---- BURROWER: arms haul, legs do not walk -------------------------------------------------
    console.log('\n[burrower]');
    console.log('  spawn '+JSON.stringify(await ev('__hc.burrower(24)')).slice(0,80));
    await ev("__hc.rigTrace('burrower')"); await sleep(4000);
    const bt0=await ev('__hc.rigTrace(null)');
    const bur={ thigh0:trace(bt0.rows,1), arm0:trace(bt0.rows,2) };
    console.log('  frames '+bt0.n+' over '+bt0.span+'s  '+JSON.stringify(bur));
    say(bt0.n>100, 'the trace caught it at frame rate ('+bt0.n+' frames)');
    say(bur.arm0.swing>0.6, 'its arms haul rather than hang ('+bur.arm0.swing+' rad peak to peak)');
    say(bur.arm0.hz>1.4 && bur.arm0.hz<3.2, 'at the tempo of something dragging itself along, not running ('+bur.arm0.hz+' Hz)');
    say(bur.thigh0.swing<0.35, 'and its legs are not walking through the soil ('+bur.thigh0.swing+' rad)');

    // ---- MEEK: two gaits, and the gap between them is the creature ------------------------------
    console.log('\n[meek — watching]');
    console.log('  spawn '+JSON.stringify(await ev('__hc.meek(1)')).slice(0,70));
    await sleep(1500);
    const watch=await sample('meek', 5);
    console.log('  '+JSON.stringify({thigh0:watch.thigh0, headZ:watch.headZ, headY:watch.headY}));
    say(watch.thigh0.swing<0.12, 'watching, it is still ('+watch.thigh0.swing+' rad of leg)');
    say(watch.headZ.swing>0.05 || watch.headY.swing>0.05, 'but not frozen — the head still moves ('+watch.headZ.swing+' tilt, '+watch.headY.swing+' turn)');

    console.log('\n[meek — bolting]');
    // Disturbing one is the only thing that makes them run, and it lasts 2.6 s, so the flush is repeated to hold the gait open.
    // A DISTURBED ONE RUNS FOR 2.6 SECONDS AND THEN LEAVES THE WORLD, which is the design — so a four-second sample taken off
    // one flush finds nothing alive and reports a gait of zero. The tick keeps a live one under the sampler by respawning and
    // re-flushing whenever the last one has gone.
    // ONE creature, one bolt. The trace latches onto the first individual it records and ignores the rest, so the flush comes
    // first and the recording covers a single 2.6-second run rather than a relay of several.
    await ev('__hc.meek(1)'); await ev('__hc.meekFlush()');
    await ev("__hc.rigTrace('meek')"); await sleep(2200);
    const bt=await ev('__hc.rigTrace(null)');
    const bolt={ thigh0:trace(bt.rows,1), arm0:trace(bt.rows,2) };
    console.log('  frames '+bt.n+' over '+bt.span+'s  '+JSON.stringify(bolt));
    // 60 frames, not 100: a bolt lasts 2.6 s and the creature leaves the world at the end of it, so the trace is bounded by the
    // behaviour rather than by the sleep. 87 frames over 1.8 s is the whole run at frame rate.
    say(bt.n>60, 'the trace caught the run at frame rate ('+bt.n+' frames over '+bt.span+'s)');
    say(bolt.thigh0.swing>0.4, 'bolting, the legs actually cycle ('+bolt.thigh0.swing+' rad)');
    say(bolt.thigh0.hz>3.0 && bolt.thigh0.hz<7.0, 'at a scurry rather than a gallop ('+bolt.thigh0.hz+' strides/s)');
    say(bolt.thigh0.swing < 1.4, 'with a short stride rather than a long one ('+bolt.thigh0.swing+' rad)');

    // ---- TENANT: the absence of a gait ----------------------------------------------------------
    console.log('\n[tenant]');
    console.log('  box '+JSON.stringify(await ev('__hc.tenBox()')));
    await sleep(1200);
    console.log('  spawn '+JSON.stringify(await ev('__hc.tenant(true)')).slice(0,70));
    await sleep(600);
    const ten=await sample('tenant', 5);
    console.log('  '+JSON.stringify({thigh0:ten.thigh0, shin0:ten.shin0, arm0:ten.arm0, groupY:ten.groupY}));
    console.log('  poseN '+JSON.stringify(await ev("__hc.rigSample('tenant')")).slice(0,220));
    say(ten._got>60, 'it stayed alive for the whole sample ('+ten._got+' samples, '+ten._errs+' refused: '+(ten._lastErr||'none')+')');
    say(ten.thigh0.swing<0.02 && ten.shin0.swing<0.02, 'its legs never cycle at all ('+ten.thigh0.swing+' / '+ten.shin0.swing+' rad)');
    say(ten.arm0.swing<0.02, 'and its arms hang without swinging ('+ten.arm0.swing+' rad)');
    say(ten.groupY.swing>0.005, 'the only motion in the whole body is the breath ('+ten.groupY.swing+' blocks)');
  } finally {
    try{ if(b) await b.close(); }catch(e){}
    try{ srv.kill(); }catch(e){}
  }
  console.log(bad?('FAILED '+bad):'PASS');
  process.exit(bad?1:0);
})();
