// AN OPEN VAULT DOOR IS STILL A PANEL (Ben 08-04): you may walk THROUGH the doorway and not through the leaf.
//   node bench/assert-vault-hitbox.mjs
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
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.mouse.click(640,360); await sleep(1200);

    const set = await page.evaluate(`(()=>{ const pr=__hc.probe();
      const x=Math.round(pr.x), y=Math.round(pr.gyHere)+1, z=Math.round(pr.z)+4;
      for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) for(let dy=0;dy<=4;dy++) __hc.setBlockAt(x+dx,y+dy,z+dz,'air');
      for(let dx=-4;dx<=4;dx++) for(let dz=-4;dz<=4;dz++) __hc.setBlockAt(x+dx,y-1,z+dz,'stone');
      __hc.vaultPlace ? __hc.vaultPlace(x,y,z,true) : null;
      return {x,y,z, block:__hc.blockAt(x,y,z)}; })()`);
    console.log('   ', JSON.stringify(set));

    const probe = (dx,dz)=>page.evaluate(`__hc.hitAt(${set.x}+${dx}, ${set.y}, ${set.z}+${dz})`);
    console.log('\n[1] closed: the doorway is blocked');
    ok('the doorway itself is solid when shut', await probe(0.5,0.5), {});

    console.log('\n[2] open: the doorway is clear and the leaf is not');
    await page.evaluate(`__hc.vaultToggle(${set.x},${set.y},${set.z})`);
    await sleep(400);
    const through = await probe(0.5,0.5);
    ok('you can walk through the opening', through===false, {hit:through});
    // The x-facing leaf swings to +z off the hinge at the cell's -x edge: one block out is squarely in the panel.
    const leaf = await probe(0.0,1.8);
    ok('but not through the leaf standing beside it', leaf===true, {hit:leaf});
    const clear = await probe(2.5,1.8);
    ok('and the room beyond the leaf is open', clear===false, {hit:clear});

    console.log('\n[3] shutting it puts the room back');
    await page.evaluate(`__hc.vaultToggle(${set.x},${set.y},${set.z})`); await sleep(400);
    ok('the leaf no longer blocks the room', (await probe(0.0,1.8))===false, {});

    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
