// Scratch: PRINT THE LIMB CHAINS. Ben: "arms are still inverted", and "its actually nothing to do with today, its been going
// on forever" — so the first question is not which fork is wrong, it is whether the ORIGINAL Wretch is wrong too. If it is,
// the fault is upstream of every fork and the fork code is the wrong file to be reading. Samples each creature three times a
// second apart so a pose that only crosses mid-stride cannot hide between shots. Deletable.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
(async()=>{ const port=await freePort();
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
  let b=null;
  try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const pg=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
    await pg.goto(base+'/index.html?debug=1&rd=10',{waitUntil:'load',timeout:120000});
    await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await pg.waitForFunction("(()=>{try{const l=document.getElementById('load');return !l||l.style.display==='none';}catch(e){return false;}})()",null,{timeout:300000});
    await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(4000); const ev=s=>pg.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.25)');

    const report=async(k)=>{
      for(let s=0;s<3;s++){
        const T=await ev(`__hc.limbTable('${k}')`);
        if(T.err){ console.log('  '+k+': '+T.err); return; }
        const a=T.arms.map(x=>`arm${x.side} sh${x.shoulderX} hand${x.handX} ${x.cross} mir${x.mirrored}`).join('  |  ');
        const l=T.legs.map(x=>`leg${x.side} hip${x.hipX} foot${x.footX} ${x.cross} mir${x.mirrored}`).join('  |  ');
        console.log('  '+(k+' #'+s).padEnd(14)+'torsoHalfX '+T.torsoHalfX+'  '+a);
        console.log('  '+''.padEnd(14)+l);
        if(s===2){ const c=T.arms[0].chain;
          console.log('  '+''.padEnd(14)+'arm0 chain: '+c.map(j=>j&&(j.name+' scl['+j.scl.join(',')+'] det'+j.det+' rot['+j.rot.join(',')+']')).join('   ')); }
        await sleep(1000); }
    };

    console.log('\nTHE ORIGINAL WRETCH (walking, not held)');
    await ev('__hc.wretchAt(14)'); await ev('__hc.wretchArm(true,true)'); await sleep(2500);
    await report('wretch');

    console.log('\nTHE HORRIFIC WRETCH');
    await ev('__hc.hw(12)'); await sleep(3000);
    const hwT=await ev(`(()=>{const w=__hc.hwState(); return w;})()`);
    console.log('  hwState '+JSON.stringify(hwT).slice(0,180));

    console.log('\nTHE THREE FORKS');
    await ev('__hc.meek(1)'); await sleep(2500); await report('meek');
    await ev('__hc.burrower(9)'); await sleep(3000); await report('burrower');
    await ev('__hc.tenBox()'); await sleep(1200); await ev('__hc.tenant(true)'); await sleep(2000); await report('tenant');
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} }
})();
