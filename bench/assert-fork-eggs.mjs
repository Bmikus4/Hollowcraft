// THE THREE NEW CREATURES HAVE SPAWN EGGS, AND THE EGGS PRODUCE THE REAL CREATURE. Ben: "all of the nerw creatures need
// spawn eggs" — and the thing that makes an egg worth having is that it is the same creature the world spawns. An egg with
// its own private construction path summons something the game never produces, and every test written against it is green
// about a creature nobody meets.
//
// So this checks the egg exists in all three forms it has to exist in (registered item, inventory icon, right-click route),
// and then that using it leaves an ACTIVE instance of the right kind, at the aimed spot, with a rig — not merely that the
// call did not throw.
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
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.25)');

    for(const [kind,label] of [['meek','The Meek'],['burrower','The Burrower'],['tenant','The Tenant']]){
      const it=await ev(`(()=>{const i=__hc.itemDef?__hc.itemDef('egg_${kind}'):null; return i;})()`)
             .catch(()=>null);
      console.log('\n['+kind+']');
      // The item's own record, read through the game rather than assumed from the source.
      const d=await ev(`(()=>{try{const i=ITEMS['egg_${kind}']; return i?{name:i.name,egg:i.egg,max:i.max,icon:i.icon&&i.icon.t,c:i.icon&&i.icon.c}:null;}catch(e){return {err:String(e.message||e)};}})()`);
      console.log('  item '+JSON.stringify(d));
      ok(kind+' egg is a registered item', !!d && !d.err, JSON.stringify(d));
      ok(kind+' egg is named for the creature', !!d && d.name===label+' Spawn Egg', d&&d.name);
      ok(kind+' egg routes to the right spawn type', !!d && d.egg===kind, d&&d.egg);
      // ICON, HELD AND DROPPED ARE SEPARATE DISPATCHES in this codebase and an item can exist in one and not the others.
      // All three eggs ride the SAME generic egg forms the other seventeen use, which is the point: icon t:'egg' plus a
      // colour is what makes the inventory tile, the item in hand and the dropped body all appear without a new model.
      ok(kind+' egg has the shared egg icon form', !!d && d.icon==='egg' && !!d.c, JSON.stringify(d));

      const before=await ev(`__hc.${kind==='meek'?'meek':kind}()`);
      const r=await ev(`(()=>{ const p=player.pos, L=lookDir();
          spawnFromEgg('${kind}', {x:Math.floor(p.x+L.x*9), y:0, z:Math.floor(p.z+L.z*9)});
          return true; })()`);
      await sleep(2500);
      const T=await ev(`__hc.kindDrawn('${kind}')`);
      const S=await ev(`__hc.limbTable('${kind}')`);
      console.log('  drawn '+JSON.stringify(T));
      ok(kind+' egg leaves a real instance with a rig', !T.err && T.inScene===true && T.meshes>0, JSON.stringify(T));
      ok(kind+' spawned near where it was aimed', !T.err && Math.abs(T.instPos[0]-(await ev('Math.floor(player.pos.x+lookDir().x*9)')))<6,
         T.instPos&&T.instPos.join(','));
      ok(kind+' arms are not crossed after an egg spawn', !S.err && S.arms.every(a=>a.cross!=='CROSSED'),
         S.arms?S.arms.map(a=>a.cross).join('/'):S.err);
    }
    console.log('\n  '+pass+' passed, '+fail+' failed');
  } finally { try{ if(b) await b.close(); }catch(e){} try{ srv.kill(); }catch(e){} process.exit(fail?1:0); }
})();
