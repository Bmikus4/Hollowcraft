import { spawn } from "node:child_process"; import { createServer } from "node:net"; import http from "node:http";
import path from "node:path"; import fs from "node:fs"; import { chromium } from "playwright-core";
const ROOT="D:\\code\\Minecraft", OUT=path.join(ROOT,"bench","results");
const fp=()=>new Promise((r,j)=>{const s=createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>r(p));});s.on("error",j);});
const wh=(u)=>new Promise((r,j)=>{const t0=Date.now();(function p(){const q=http.get(u,x=>{x.resume();r();});q.on("error",()=>{Date.now()-t0>15000?j(new Error("down")):setTimeout(p,250);});})();});
const sl=ms=>new Promise(r=>setTimeout(r,ms));
const br=["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe","C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(p=>fs.existsSync(p));
(async()=>{ const port=await fp();
  const srv=spawn(process.execPath,[path.join(ROOT,"mp-server.js")],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:"ignore"});
  try{ const base="http://127.0.0.1:"+port; await wh(base+"/index.html");
    const b=await chromium.launch({executablePath:br,headless:true,args:["--enable-gpu","--ignore-gpu-blocklist","--use-angle=d3d11","--mute-audio"]});
    const pg=await (await b.newContext({viewport:{width:1100,height:700}})).newPage();
    pg.on("pageerror",e=>console.log("PAGEERROR:",String(e.message||e).slice(0,200)));
    await pg.goto(base+"/index.html?debug=1&rd=10",{waitUntil:"load",timeout:90000});
    await pg.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:90000});
    await sl(8000); await pg.evaluate("__hc.pinScene()").catch(()=>{});
    const I=await pg.evaluate("__hc.isleStats()"), P=await pg.evaluate("__hc.probe()");
    // Far out at sea, looking STEEPLY DOWN, then level: a divider in the lower sky has nothing in front of it there.
    await pg.evaluate("__hc.tpExact("+(I.x+I.R+700)+","+I.z+","+(P.sea+120)+")"); await sl(3500);
    for(const [nm,t,pitch] of [["day-down",0.30,-0.85],["day-level",0.30,-0.05],["night-down",0.72,-0.85],["night-level",0.72,-0.05]]){
      await pg.evaluate("__hc.setTime("+t+")"); await sl(1200);
      await pg.evaluate("__hcBR.look(1.6,"+pitch+")"); await sl(1500);
      await pg.screenshot({path:path.join(OUT,"skydiv-"+nm+".png")});
      console.log("  shot "+nm); }
    await b.close(); } finally { try{srv.kill();}catch(e){} }
})().catch(e=>{console.error(e);process.exit(1);});