// ASSERT: the third-person body actually takes the posture, and the hitbox goes with it.
// Ben 2026-08-12: "make it third person, and make the hitbox, also fix the ctrl croucning animation".
//
// MEASURED, NOT PHOTOGRAPHED, and that is not a preference: the world renders black in this headless harness (the same
// symptom assert-cabin reports), so a screenshot here proves nothing about a body. The rig's own angles do: a crouch that
// is only a sink has legLx 0, and a prone body that is only a shorter stand has bodyRx 0.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=u=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const r=http.get(u,x=>{x.resume();res();});r.on('error',()=>Date.now()-t0>20000?rej(new Error('down')):setTimeout(p,250));})();});
const port=await freePort();
const server=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
const page=await b.newPage({viewport:{width:1000,height:720}});
await page.goto(base+'/index.html?debug=1',{waitUntil:'load'});
await page.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
await page.waitForTimeout(3500);
await page.evaluate("__hc.lock(true); __hc.tpsProbe(true)");
await page.waitForTimeout(1500);
const shot=async n=>{ await page.waitForTimeout(500); await page.screenshot({path:path.join(OUT,'posture-'+n+'.png')}); };
const rows={};
for(const [name,keys] of [['stand',[]],['crouch',['ControlLeft']],['prone',['KeyZ']]]){
  await page.evaluate(async ks=>{ for(const k of ['ControlLeft','KeyZ']) __hc.key(k,false);
    if(__hc.st().prone && !ks.includes('KeyZ')){ __hc.key('KeyZ',true); await new Promise(r=>setTimeout(r,150)); __hc.key('KeyZ',false); await new Promise(r=>setTimeout(r,400)); }
    for(const k of ks) __hc.key(k,true);
    if(ks.includes('KeyZ')){ await new Promise(r=>setTimeout(r,150)); __hc.key('KeyZ',false); }
    await new Promise(r=>setTimeout(r,1400)); }, keys);
  rows[name]=await page.evaluate('__hc.tpsPose()');
  await shot(name);
  console.log(name.padEnd(7)+JSON.stringify({crouchT:rows[name].crouchT,proneT:rows[name].proneT,bodyRx:rows[name].bodyRx,legLx:rows[name].legLx,hitH:rows[name].hitH}));
}
let pass=0, fail=0;
const t=(n,ok,got)=>{ (ok?pass++:fail++); console.log((ok?'PASS  ':'FAIL  ')+n+'   '+got); };
const S=rows.stand, C=rows.crouch, P=rows.prone;
t('standing is upright and full height', S.crouchT<0.02 && S.proneT<0.02 && Math.abs(S.bodyRx)<0.02 && S.hitH===1.8,
  'bodyRx='+S.bodyRx+' hitH='+S.hitH);
// THE CROUCH IS THE ONE BEN CALLED BROKEN: it used to be a sink and nothing else.
t('crouching FOLDS the legs, not just sinks', C.crouchT>0.9 && C.legLx>0.5,
  'crouchT='+C.crouchT+' thigh='+C.legLx+' rad');
t('and the hitbox crouches with it', C.hitH>1.2 && C.hitH<1.7, 'hitH='+C.hitH);
t('prone lays the body flat', P.proneT>0.9 && Math.abs(P.bodyRx-Math.PI/2)<0.05,
  'bodyRx='+P.bodyRx+' (PI/2='+(Math.PI/2).toFixed(3)+')');
t('with the legs straight, not mid-stride', Math.abs(P.legLx)<0.12, 'thigh='+P.legLx);
t('the head lifts off the floor', P.headRx < -0.8, 'headRx='+P.headRx);
t('and the hitbox is under a block tall', P.hitH<1.0 && P.hitH>0.3, 'hitH='+P.hitH+' (a one-block gap is 1.0)');
t('the two postures are exclusive', C.proneT<0.05 && P.crouchT<0.05, 'crouch.proneT='+C.proneT+' prone.crouchT='+P.crouchT);
console.log(pass+'/'+(pass+fail));
await b.close(); server.kill();
process.exit(fail?1:0);
