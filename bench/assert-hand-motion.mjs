// #66 — HAND MOTION, BOTH HANDS. The three parts of the item, each as a number.
//
//   (a) the bob is DRIVEN BY THE FOOTFALL, not by a clock of its own. The old bob was a free sine on view.bob while
//       the footstep sound fired off a distance accumulator in the audio frame; they agreed only by coincidence.
//       Asserted by firing the footfall the sound fires and watching the hands answer it.
//   (b) standing still does not freeze the hands. A small always-on breath, bounded — subtle is the requirement, so
//       both a floor AND a ceiling are asserted.
//   (c) whatever is held rides its OWN hand. Checked with an item in EACH hand at once: this is the part that breaks
//       silently, because moving the arm mesh alone leaves the held object nailed in space, and a check on the arms
//       alone passes on exactly that.
//   plus ADS keeps a named fraction of hip amplitude, and the two hands move in OPPOSITE directions laterally.
// usage: node bench/assert-hand-motion.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
function freePort(){ return new Promise((res, rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url, t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const COMMON_ARGS = ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
function findBrowser(){ const c=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
  for(const p of c) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let pass=0, fail=0;
const chk=(c,n,d)=>{ if(c){pass++;console.log('  PASS  '+n+(d?'   '+d:''));} else {fail++;console.log('  FAIL  '+n+(d?'   '+d:''));} };
const span = a => Math.max(...a)-Math.min(...a);

(async()=>{
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    let browser=await chromium.launch({ executablePath:findBrowser(), headless:true, args:COMMON_ARGS });
    let ctx=await browser.newContext({ viewport:{width:900,height:600} }); let page=await ctx.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    await page.goto('about:blank');
    const gl='(()=>{try{const c=document.createElement("canvas");const g=c.getContext("webgl2")||c.getContext("webgl");if(!g)return "NO";const e=g.getExtension("WEBGL_debug_renderer_info");return e?String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)):"?";}catch(e){return "E";}})()';
    if(/swiftshader|software|llvmpipe|^NO$/i.test(await page.evaluate(gl))){
      await browser.close();
      browser=await chromium.launch({ executablePath:findBrowser(), headless:false, args:COMMON_ARGS.concat(['--window-position=-32000,-32000','--window-size=920,640']) });
      ctx=await browser.newContext({ viewport:{width:900,height:600} }); page=await ctx.newPage();
      page.on('pageerror', e=>console.log('PAGEERROR:', String(e.message||e).slice(0,300)));
    }
    await page.goto(base+'/index.html?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', {timeout:180000});
    await sleep(1500);

    // An item in EACH hand, which is the configuration (c) is about.
    // handSplit is the existing dual-hand QA path (right hand + offhand, both built and posed) — the exact
    // configuration (c) is about, and reusing it means this harness cannot disagree with the dual-gun one.
    await page.evaluate('__hc.handSplit("iron_pickaxe","torch")'); await sleep(400);
    console.log('  both hands: '+JSON.stringify(await page.evaluate('__hc.handPose()')));

    const sample=async(ms,every=32)=>{ const out=[]; const t0=Date.now();
      while(Date.now()-t0<ms){ out.push(await page.evaluate('__hc.handPose()')); await sleep(every); } return out; };
    const series=(rows,key,i)=>rows.map(r=>r[key][i]);

    console.log('\n--- b  standing still, the hands are not frozen ---');
    const idle=await sample(2600);
    for(const k of ['item','arm','offItem','offArm']){
      const dy=span(series(idle,k,1)), dx=span(series(idle,k,0));
      chk(dy>0.0008 || dx>0.0008, k.padEnd(8)+' drifts at rest', 'dy '+dy.toFixed(4)+' dx '+dx.toFixed(4));
      chk(dy<0.030 && dx<0.030, k.padEnd(8)+' but only just — the breath stays subtle', 'dy '+dy.toFixed(4)+' dx '+dx.toFixed(4)); }

    console.log('\n--- a  a footfall moves the hands, and it is the SOUND\'s footfall ---');
    // handKick calls handFootfall, which is the one function the footstep site calls: there is no second path to test.
    const before=await page.evaluate('__hc.handPose()');
    await page.evaluate('__hc.handKick(1)');
    const after=[]; for(let i=0;i<10;i++){ after.push(await page.evaluate('__hc.handPose()')); await sleep(28); }
    const kickDrop=Math.min(...after.map(r=>r.item[1]))-before.item[1];
    chk(kickDrop < -0.004, 'the hands drop onto the planted foot', 'lowest point '+kickDrop.toFixed(4)+' below rest');
    const settle=await sample(1400); const tail=settle.slice(-8);
    chk(span(tail.map(r=>r.item[1])) < 0.020, 'and it rings down again rather than oscillating forever', 'tail span '+span(tail.map(r=>r.item[1])).toFixed(4));

    console.log('\n--- a  a heavier step kicks harder ---');
    const peakFor=async p=>{ await sleep(700); const b0=(await page.evaluate('__hc.handPose()')).item[1];
      await page.evaluate('__hc.handKick('+p+')'); let lo=9;
      for(let i=0;i<10;i++){ lo=Math.min(lo,(await page.evaluate('__hc.handPose()')).item[1]); await sleep(28); }
      return b0-lo; };
    const soft=await peakFor(0.45), hard=await peakFor(1.25);
    chk(hard > soft*1.5, 'a sprint lands harder than a sneak', 'sneak '+soft.toFixed(4)+' vs sprint '+hard.toFixed(4));

    console.log('\n--- c  the held items move WITH their hands, not against them ---');
    await page.evaluate('__hc.handKick(1.25)');
    const run=await sample(1200,24);
    const mv={}; for(const k of ['item','arm','offItem','offArm']) mv[k]={ y:span(series(run,k,1)), x:span(series(run,k,0)) };
    for(const k of ['item','arm','offItem','offArm'])
      chk(mv[k].y>0.004, k.padEnd(8)+' answers the footfall', 'dy '+mv[k].y.toFixed(4));
    // the item and the arm that holds it must move TOGETHER — same displacement, not merely both non-zero
    const dItem=series(run,'item',1), dArm=series(run,'arm',1);
    const diffs=dItem.map((v,i)=>v-dArm[i]);
    chk(span(diffs) < 0.002, 'the right hand and what it holds move as one', 'their difference varies by '+span(diffs).toFixed(4));
    // and laterally the two hands go opposite ways
    const xMain=series(run,'arm',0), xOff=series(run,'offArm',0);
    const corr=(()=>{ const n=xMain.length, ma=xMain.reduce((a,b)=>a+b,0)/n, mo=xOff.reduce((a,b)=>a+b,0)/n;
      let num=0,da=0,db=0; for(let i=0;i<n;i++){ const a=xMain[i]-ma, b=xOff[i]-mo; num+=a*b; da+=a*a; db+=b*b; }
      return (da&&db)?num/Math.sqrt(da*db):0; })();
    chk(corr < -0.8, 'the two hands rock in opposite directions', 'correlation '+corr.toFixed(3));

    console.log('\n--- ADS keeps a fraction of hip amplitude ---');
    // THE SAME GUN AGAINST ITSELF. Comparing an aimed rifle against a hip-fired pickaxe compares two different poses,
    // and reported ADS as the LARGER of the two: the rifle's own hip pose simply sits further from the rest position.
    // hold(), not handSplit(), for the gun: handSplit invAdds 8 of it and an ar15 is max:1, so the selected slot
    // never ended up holding the rifle and adsT sat at 0 while the check "waited for the eye".
    // AND THE LEFT HAND HAS TO BE EMPTY: view.ads carries !armor[EQ_OFF], so a full offhand refuses the aim outright
    // and adsT sits at 0 while the check patiently waits for the eye.
    await page.evaluate('__hc.offNone()');
    await page.evaluate('__hc.hold("ar15")'); await sleep(500);
    const burst=async()=>{ await page.evaluate('__hc.handKick(1.25)'); return span(series(await sample(1100,24),'arm',1)); };
    const hipGun=await burst();
    await page.evaluate('(()=>{try{__hc.aim(true);}catch(e){}})()');
    const reached=await page.waitForFunction('(()=>{try{return __hc.handPose().ads>=0.999;}catch(e){return false;}})()',{timeout:8000}).then(()=>true).catch(()=>false);
    chk(reached, 'the rifle actually reached the eye', 'adsT '+(await page.evaluate('__hc.handPose()')).ads);
    const adsGun=await burst();
    chk(adsGun < hipGun*0.5 && adsGun > 0, 'aimed amplitude is a fraction of hip, and not zero',
      'hip '+hipGun.toFixed(4)+' -> ads '+adsGun.toFixed(4)+' ('+(hipGun?(100*adsGun/hipGun).toFixed(0):'-')+'%)');

    console.log('\n'+pass+'/'+(pass+fail)+' passed');
    await browser.close();
    process.exit(fail?1:0);
  } finally { try{ server.kill(); }catch(e){} }
})().catch(e=>{ console.error(e); process.exit(1); });
