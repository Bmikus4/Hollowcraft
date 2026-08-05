// EVERY GUN PART IS FOGGED WITH THE REST OF THE GUN (Ben: "guns' fog effect needs reviewing/recompiling").
// applyViewFog patches a viewmodel's materials once, when the item is set, and skips MeshBasicMaterial and anything transparent by
// design. Anything else it misses reads brighter and unfogged against the parts around it. Audits both hands over every gun in the
// item table, and checks the eye-light/fog terms really are in the compiled shader by measuring the same gun in clear air and in
// thick fog.
//   node bench/assert-gun-viewfog.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250);}); })(); }); }
const CHROME=['C:','Program Files','Google','Chrome','Application','chrome.exe'].join(String.fromCharCode(92));
let fails=0; const ok=(n,c,g)=>{ if(!c)fails++; console.log(`  ${c?'ok  ':'FAIL'}  ${n}   ${JSON.stringify(g)}`); };
const W=900,H=600;
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:W,height:H}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(W/2,H/2); await sleep(1200);
    await page.evaluate(`(()=>{ const p=__hc.probe(); __hc.tp(p.x,p.gyHere+2,p.z); __hc.giveItem('rifle_ammo',200); })()`); await sleep(500);
    for(const off of [false,true]){
      const r=await page.evaluate(`__hc.viewFog(null,${off})`);
      console.log('\n   ', r.holder, 'guns', r.guns, 'totalMissed', r.totalMissed);
      for(const g of r.out) console.log('    ', JSON.stringify(g).slice(0,420));
      ok(r.holder+': every gun has a viewmodel to audit', r.out.every(g=>!g.no), r.out.filter(g=>g.no));
      ok(r.holder+': no material on any gun missed the fog patch', r.totalMissed===0, {totalMissed:r.totalMissed, worst:r.out.filter(g=>g.missed>0).slice(0,4)});
      ok(r.holder+': and the patch actually reached most of the gun', r.out.every(g=>g.no||g.patched>=2), r.out.filter(g=>!g.no&&g.patched<2));
    }
    // A FLAG IS NOT A RENDERING. The patch adds a fog mix and an eye-light term to the compiled shader, so the same gun in the same
    // pose has to change colour when the fog colour and amount change. Measured on the pixels, in the crop the gun fills.
    const look=async()=>{
      const shot=(await page.screenshot()).toString('base64');
      return await page.evaluate(async (b64)=>{
        const im=new Image(); im.src='data:image/png;base64,'+b64; await im.decode();
        const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight;
        const x=c.getContext('2d'); x.drawImage(im,0,0);
        const d=x.getImageData(0,0,c.width,c.height).data;
        // Lower-right quadrant is where a hip-carried gun sits; average luminance over it.
        let n=0,s=0;
        for(let py=(c.height*0.60)|0; py<(c.height*0.92)|0; py++) for(let px=(c.width*0.55)|0; px<(c.width*0.95)|0; px++){
          const i=(py*c.width+px)*4; s+=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; n++; }
        return +(s/n).toFixed(2);
      }, shot);
    };
    await page.evaluate(`(()=>{ __hc.aim(false); __hc.hold('ar15'); })()`); await sleep(900);
    await page.evaluate(`__hc.cam({yaw:0,pitch:-0.15})`); await sleep(600);
    const dry=await look();
    // HELD, not just set: the weather reassigns this uniform every frame, so a hook that only wrote it would be overwritten
    // before the next draw and the measurement would show nothing.
    const fogState=await page.evaluate(`__hc.vfog(1,0.40,1)`);
    console.log('\n    vfog lever', JSON.stringify(fogState));
    await sleep(700);
    const wet=await look();
    console.log('    gun-quadrant luminance', JSON.stringify({dry, wet}));
    ok('the fog term is really in the compiled shader (the gun changes with it)', Math.abs(wet-dry)>1.0, {dry, wet, fogState});
    await page.evaluate(`__hc.vfog(null,null,false)`);
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
