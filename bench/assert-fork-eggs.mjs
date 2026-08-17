// THE THREE NEW CREATURES HAVE SPAWN EGGS, AND THE EGGS PRODUCE THE REAL CREATURE. Ben: "all of the nerw creatures need
// spawn eggs" — and what makes an egg worth having is that it summons the same creature the world does. An egg with its own
// private construction path produces something the game never spawns, and every check written against it is green about a
// creature nobody meets.
//
// Registering an item and routing its right-click are separate facts and neither implies the other, so both are read here,
// and the spawn goes through spawnFromEgg — the chokepoint the real handler calls.
//
//   node bench/assert-fork-eggs.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
let pass=0, fail=0;
const ok=(n,c,d)=>{ if(c){pass++; console.log('  ok   '+n);} else {fail++; console.log('  FAIL '+n+'   '+(d||''));} };
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
    // NIGHT, AND A ROOF FOR THE TENANT. These are not bench conveniences, they are the creatures' own conditions: the Meek
    // retires on the first tick after sunrise and the Tenant retires the moment it finds no ceiling. Testing them at noon
    // under open sky measures the retirement, not the egg.
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.85)');
    await sleep(800);

    for(const [kind,label] of [['meek','The Meek'],['burrower','The Burrower'],['tenant','The Tenant']]){
      console.log('');
      console.log('['+kind+']');
      if(kind==='tenant'){ await ev('__hc.tenBox()'); await sleep(1200); }   // the roof it needs, built the way the tenant bench builds it
      const d=await ev(`__hc.useEgg('egg_${kind}', ${kind==='tenant'?3:9})`);
      console.log('  egg '+JSON.stringify(d));
      ok(kind+' egg is a registered spawn egg', !d.err, d.err);
      ok(kind+' egg is named for the creature', d.name===label+' Spawn Egg', d.name);
      ok(kind+' egg routes to the right spawn type', d.egg===kind, d.egg);
      // ICON, HELD AND DROPPED ARE SEPARATE DISPATCHES here and an item can exist in one and not the others. All three ride
      // the SAME generic egg forms the other seventeen use — icon t:'egg' plus a colour — which is what makes the inventory
      // tile, the item in hand and the dropped body all appear without anyone building a new model.
      ok(kind+' egg has the shared egg icon form', d.icon==='egg' && !!d.colour, JSON.stringify(d));

      // TWO SAMPLES, AND THE FIRST ONE IS THE ONE THAT ANSWERS "DID THE EGG WORK". A single reading seconds later cannot
      // tell a creature that never spawned from one that spawned and left, and these three creatures LEAVE: the Meek's
      // whole behaviour is to go when you look at it, and the Burrower travels submerged the moment it exists.
      await sleep(350);
      const T0=await ev(`__hc.kindDrawn('${kind}')`);
      await sleep(2600);
      const T=await ev(`__hc.kindDrawn('${kind}')`);
      const S=await ev(`__hc.limbTable('${kind}')`);
      console.log('  at spawn  '+JSON.stringify(T0));
      console.log('  2.6s on   '+JSON.stringify(T));
      ok(kind+' egg leaves a real instance with a rig', !T0.err && T0.inScene===true && T0.meshes>0, JSON.stringify(T0));
      // NOT ASSERTED FOR THE TENANT, and the reason is the creature rather than the bench. It relocates itself to somewhere
      // you are not looking on the first frame it is unwatched, so it has already left the aimed block by the time anything
      // can read it — measured, 10 blocks away 350 ms after the egg. Demanding it stay put would be a test that the Tenant's
      // one behaviour is broken.
      if(kind!=='tenant') ok(kind+' spawned where it was aimed', !T0.err && !d.err && Math.hypot(T0.instPos[0]-d.at[0], T0.instPos[2]-d.at[1])<4,
         (T0.instPos?T0.instPos.join(','):'')+' vs '+(d.at?d.at.join(','):''));
      // Visible AT SPAWN. The Burrower is under the floor by design and is the one exception; the other two must be there
      // to look at, which is the entire reason Ben asked for the eggs.
      if(kind!=='burrower') ok(kind+' is visible when it arrives', !T0.err && T0.groupVisible===true && T0.chainVisible===true,
         JSON.stringify(T0));
      ok(kind+' arms are not crossed after an egg spawn', !S.err && S.arms.every(a=>a.cross!=='CROSSED'),
         S.arms?S.arms.map(a=>a.cross).join('/'):S.err);
    }
    console.log('');
    console.log('  '+pass+' passed, '+fail+' failed');
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} process.exit(fail?1:0); }
})();
