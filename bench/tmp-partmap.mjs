// WHICH PART DOES EACH GUN'S RELOAD ACTUALLY MOVE? The carve is a BOX in model space, so on a gun whose derived
// range is wrong it lands on the trigger guard or the stock. This reports, per gun, what was carved and where it
// sits relative to the grip — a mag below and behind the grip is a magazine; one AT the grip is the trigger guard.
import { spawn } from 'node:child_process'; import { createServer } from 'node:net'; import http from 'node:http'; import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT='D:/Code/Minecraft'; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
(async()=>{ const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  let b; try{ const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const p=await (await b.newContext({viewport:{width:960,height:540}})).newPage();
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await p.evaluate("__hc.lock(true)"); await sleep(800);
    const guns=await p.evaluate("__hc.attProbe().guns");
    for(const g of guns){
      await p.evaluate(`__hc.hold(${JSON.stringify(g)})`); await sleep(220);
      const r=await p.evaluate(`(()=>{ const m=view.mesh; if(!m) return {no:'no mesh'}; const U=m.userData;
        const box=(o)=>{ if(!o) return null; const bb=new THREE.Box3().setFromObject(o), s=bb.getSize(new THREE.Vector3()), c=bb.getCenter(new THREE.Vector3());
          return {c:[+c.x.toFixed(3),+c.y.toFixed(3),+c.z.toFixed(3)], s:[+s.x.toFixed(3),+s.y.toFixed(3),+s.z.toFixed(3)]}; };
        return { grip:U.gripAt?U.gripAt.map(v=>+v.toFixed(3)):null, mag:box(U.mag), cyl:box(U.cyl), pump:box(U.pump), bolt:box(U.bolt) }; })()`).catch(e=>({err:String(e).slice(0,60)}));
      const f=(o)=>o?('c'+o.c.join(',')+' s'+o.s.join(',')):'-';
      console.log(g.padEnd(16),'grip',JSON.stringify(r.grip),' mag',f(r.mag),' cyl',f(r.cyl),' pump',f(r.pump),' bolt',f(r.bolt));
    }
  } finally { if(b)await b.close(); server.kill(); } })();
