// LOOK AT THE CAMERA AND MONITOR. assert-cctv passes 24 checks and never once verified this geometry is DRAWN — it checked ids,
// codes, tuning, no-signal, the render-target feed and the save round trip. A working feed made the props feel verified.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const R='D:/code/Minecraft', OUT=path.join(R,'bench','results');
const fp=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const wh=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sl=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
(async()=>{fs.mkdirSync(OUT,{recursive:true});const port=await fp();
const sv=spawn(process.execPath,[path.join(R,'mp-server.js')],{cwd:R,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
try{const b='http://127.0.0.1:'+port; await wh(b+'/index.html');
const br=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
const pg=await(await br.newContext({viewport:{width:1100,height:620}})).newPage();
pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
await pg.goto(b+'/index.html?debug=1&rd=6',{waitUntil:'load',timeout:90000});
await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
await sl(6000); await pg.evaluate('__hc.cmdRun("/gamemode creative")').catch(()=>{}); await pg.evaluate('__hc.setTime(0.5)');
// One of each facing, side by side, on a concrete wall so the props read against a flat backdrop.
// __hc.setBlock takes offsets RELATIVE to the player, not world coordinates -- passing absolutes silently builds it somewhere else.
const built=await pg.evaluate(`(()=>{
  // NO BACKING WALL. One built behind the door shadowed the wheel into a black starburst that could not be judged.
  __hc.setBlock(0,1,-6,'vault_door_z');
  return __hc.probe(); })()`).catch(e=>({err:String(e.message||e)}));
console.log('  placed at: '+JSON.stringify(built && {x:built.x,y:built.y,z:built.z}));
await sl(4500);
// Straight in front of the door face, 3 blocks off, at handle height. yaw 0 faces -z in the player's convention.
await pg.evaluate(`(()=>{ __hc.tpExact(${built.x}, ${built.z}-3, ${built.y}+1); })()`);
await sl(3000);
await pg.evaluate('__hcBR.look(0,0)'); await sl(1800);
await pg.screenshot({path:path.join(OUT,'vault-wheel.png')});
console.log('  shot taken');
await br.close();}finally{try{sv.kill();}catch(e){}}})().catch(e=>{console.error(e);process.exit(1);});
