// THE BURROWER, AS NUMBERS. Nothing about this creature can be judged from a frame: for most of its life it is three blocks under
// the floor, and the two claims that make it a creature rather than a model are both invisible.
//
//   1. IT COMES UP THROUGH SOFT GROUND. If it cannot do that, it is scenery.
//   2. IT CANNOT COME UP THROUGH A FLOOR YOU LAID. If it can, the counter does not exist and the creature is a lottery — you
//      would take damage at random with nothing you could have done, which is the difference between dread and unfairness.
//
// Both are asserted here, in that order, because a green light on the second one alone would also be produced by a creature that
// never surfaces at all. The negative control is the first test.
//
//   node bench/assert-burrower.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
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

    const watch=async(polls,label)=>{
      const seen={}; let struck=0, surfaced=0, minDist=99, hp0=null, hp1=null, last='';
      for(let i=0;i<polls;i++){
        const r=await ev('__hc.burrower()');
        if(r.err){ console.log('  probe error '+r.err); break; }
        if(hp0==null) hp0=r.playerHealth; hp1=r.playerHealth;
        seen[r.phase]=(seen[r.phase]||0)+1;
        if(r.phase==='RISE'||r.phase==='STRIKE') surfaced++;
        if(r.dist<minDist) minDist=r.dist;
        const k=r.phase+'|'+(r.visible?'vis':'hid')+'|'+r.playerHealth;
        if(k!==last){ console.log('    '+String(r.phase).padEnd(8)+' dist '+String(r.dist).padStart(6)+' depth '+String(r.depth).padStart(5)
          +' visible '+String(r.visible).padEnd(5)+' softUnderPlayer '+String(r.softUnderPlayer).padEnd(5)+' hp '+r.playerHealth); last=k; }
        await sleep(90);
      }
      console.log('  '+label+': phases '+JSON.stringify(seen)+', closest '+minDist.toFixed(2)+', health '+hp0+' -> '+hp1);
      return {seen, surfaced, minDist, dmg:(hp0??0)-(hp1??0)};
    };

    // 1. SOFT GROUND — it must come up, and the blow must land.
    console.log('\n[1] on soft ground');
    console.log('  spawn '+JSON.stringify(await ev('__hc.burrower(9)')));
    const soft=await watch(90,'soft');
    say(soft.surfaced>0, 'it comes up through soft ground ('+soft.surfaced+' polls surfacing or reared)');
    say(soft.dmg>0, 'and the emergence actually costs the player something ('+soft.dmg+' health)');

    // 2. A FLOOR YOU LAID — it must not. Same creature, same distance, one thing changed.
    console.log('\n[2] standing on stone');
    console.log('  floor '+JSON.stringify(await ev("__hc.burFloor('stone')")));
    console.log('  heal  '+JSON.stringify(await ev('__hc.heal()')).slice(0,60));
    console.log('  spawn '+JSON.stringify(await ev('__hc.burrower(9)')));
    const hard=await watch(90,'stone');
    say(hard.surfaced===0, 'it cannot come up through a floor you laid ('+hard.surfaced+' polls surfacing)');
    say(hard.dmg<=0, 'and it takes nothing from a player who is standing on one ('+hard.dmg+' health)');
    say(hard.minDist<8, 'it is still there and still closing, it simply cannot open the ground ('+hard.minDist.toFixed(2)+' blocks)');

    // 3. IT COSTS THE WORLD NO LIGHT. The Horrific Wretch fork took a slot and never gave it back.
    const L=await ev('__hc.burrower()');
    say(L.lightSlots==null || L.lightSlots>0, 'the light pool is untouched by it (pool '+L.lightSlots+')');
  } finally {
    try{ if(b) await b.close(); }catch(e){}
    try{ srv.kill(); }catch(e){}
  }
  console.log(bad?('FAILED '+bad):'PASS');
  process.exit(bad?1:0);
})();
