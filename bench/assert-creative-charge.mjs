// A CONNECTED CHARGE LEAVES THE CREATURE IN THE WORLD (Ben 08-04, watching it happen: "he would run towards me screaming
// without being on all fours, then run into me and disappear, teleport away and do nothing").
//
// The second half of that was a real branch, not a misreading. On a natural spawn while the player is in CREATIVE, the grab
// branch fell through to `damage(4); despawnWretch(true)` — and damage() returns on its first line for a creative player, so the
// encounter was: it reaches you, nothing happens, it deletes itself, and spawnT puts it back 45-85 s away somewhere else.
//
// The state under test is therefore precise: creative, armed (so a charge is legal at all), and NOT summoned (because
// `!player.creative || wretch._summoned` sends a summoned one into the capture instead).
//
// usage: node bench/assert-creative-charge.mjs
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/code/Minecraft', PAGE=process.env.HC_PAGE||'index.html';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function p(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(p,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const port=await freePort();
const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port),NO_OPEN:'1'},stdio:'ignore'});
const base='http://127.0.0.1:'+port; await waitHttp(base+'/'+PAGE);
const b=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
const pg=await (await b.newContext({viewport:{width:800,height:600}})).newPage();
pg.on('pageerror',e=>console.log('PAGEERROR:',String(e.message||e).slice(0,160)));
await pg.goto(base+'/'+PAGE+'?debug=1&rd=10',{waitUntil:'load',timeout:90000});
await pg.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
await pg.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
await sleep(4000);
// Creative, and NOT summoned: the exact state Ben plays in when a natural spawn charges him.
await pg.evaluate('__hc.cmdRun("/gamemode creative")');
await pg.evaluate('__hc.setTime(0.0)'); await pg.evaluate('__hc.qaLocked(true)');
await pg.evaluate('__hc.cam({yaw:Math.PI/2,pitch:0})');
await pg.evaluate('__hc.yank()');
await pg.evaluate('__hc.wretchArm(true,false)');   // armed so a charge is legal, NOT summoned so the creative branch is the one taken
let hit=null;
for(let i=0;i<60;i++){
  const c=await pg.evaluate('__hc.wretchCharge()');
  if(i<4||i%12===0) console.log(i, c.state, 'active='+c.active, 'dist='+c.dist, 'hits='+c.creativeHits, 'recommit='+c.recommitT);
  if(c.creativeHits>0){ hit=c; break; }
  await pg.evaluate('__hc.setTime(0.0)'); await pg.evaluate('__hc.cam({yaw:Math.PI/2,pitch:0})'); await pg.evaluate('__hc.wretchCommit()');
  await sleep(60);
}
if(hit){
  console.log('CONNECTED: hits='+hit.creativeHits+' state='+hit.state+' active='+hit.active+' recommitT='+hit.recommitT);
  await sleep(700);
  const after=await pg.evaluate('__hc.wretchCharge()');
  console.log('AFTER 0.7s: active='+after.active+' state='+after.state+' dist='+after.dist+' crawl='+after.crawl);
  let bad=0;
  const say=(ok,msg)=>{ console.log((ok?'ok   ':'FAIL ')+msg); if(!ok) bad++; };
  say(after.active===true, 'the creature is STILL IN THE WORLD after its charge connected');
  say(after.state!=='DORMANT', 'and it has a state to act from rather than being despawned (' + after.state + ')');
  say(hit.recommitT>0, 'a recommit cooldown is set (' + hit.recommitT + 's)');
  // AND THE COOLDOWN HOLDS. Before the blow itself was gated, this counted ten strikes inside one 60 ms poll, because HUNT arms
  // from proximity in the state ladder and does not need `committed` — so clearing that flag did not keep the branch out.
  say(hit.creativeHits<=2, 'and it holds: ' + hit.creativeHits + ' strike(s) by the first sighting, not a burst');
  const t0=hit.creativeHits;
  await sleep(1200);
  const mid=await pg.evaluate('__hc.wretchCharge()');
  say(mid.creativeHits===t0, 'no further strike inside the cooldown (' + t0 + ' -> ' + mid.creativeHits + ')');
  await b.close(); srv.kill();
  console.log(bad?('FAILED '+bad):'PASS');
  if(bad) process.exitCode=1;
} else { console.log('FAILED no contact registered in the polling window'); await b.close(); srv.kill(); process.exitCode=1; }
