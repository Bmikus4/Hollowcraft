// Does HOW you enter the Backrooms decide whether its doors can be opened?
// Path A: __hcBR.enter() directly (the /backrooms + objective path).
// Path B: spawn a Void Door first, which runs brPortalWarm -> brxGenerate + brBuildEnvAll, then enter.
// The test is the PLAYER-FACING one: face the nearest door and right-click it.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net';
import http from 'node:http'; import path from 'node:path'; import fs from 'node:fs';
import { chromium } from 'playwright-core';
const ROOT='D:/code/Minecraft';
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const waitHttp=(u)=>new Promise((res,rej)=>{const t0=Date.now();(function poll(){const q=http.get(u,r=>{r.resume();res();});q.on('error',()=>{Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250);});})();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fb=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const J=v=>JSON.stringify(v);
(async()=>{const port=await freePort();
const sv=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
try{const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
const br=await chromium.launch({executablePath:fb(),headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required','--disable-gpu-vsync']});
const run=async(label,viaDoor)=>{
  const ctx=await br.newContext({viewport:{width:1280,height:720}}); ctx.setDefaultTimeout(180000);
  const page=await ctx.newPage();
  await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:90000});
  await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:120000});
  await sleep(7000); await page.evaluate('__hc.cmdRun("/gamemode creative")');
  if(viaDoor){ await page.evaluate('__hcBR.door()'); await sleep(4500); }
  await page.evaluate('__hcBR.enter()'); await sleep(9000);
  const keys=await page.evaluate('__hcBR.doorKeys()');
  const face=await page.evaluate('(()=>{try{return __hcBR.faceOpening("door",2.4);}catch(e){return {err:String(e.message||e)};}})()');
  await sleep(1000);
  const use=await page.evaluate('(()=>{try{return __hcBR.useDoor();}catch(e){return {err:String(e.message||e)};}})()');
  console.log('\n--- '+label);
  console.log('  door records built   '+J(keys.counts));
  console.log('  could face a door    '+J(face));
  console.log('  right-click opened   '+J(use&&use.after?{before:use.before&&use.before.closed,after:use.after.closed,ok:use.ok}:use));
  await ctx.close();
};
await run('A · entered directly (__hcBR.enter — the /backrooms and objective path)',false);
await run('B · entered after spawning a Void Door (brPortalWarm ran)',true);
await br.close();}catch(e){console.log('ERR '+(e&&e.stack||e));}finally{try{sv.kill();}catch(e){}process.exit(0);}})();
