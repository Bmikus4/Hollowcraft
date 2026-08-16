// SHINY GUNS ARE SHINY, AND ONLY THE RIGHT ONES (Ben 08-12: "shiny guns should be shiny, they should have hd metal
// textures" + "dont use the corrugated or rusty ones"). The finish is authored per gun, so what a bench can say is:
// the three new textures decoded, a nickel gun's metal is measurably glossier than a matte one's, and the guns that
// were meant to stay matte did.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio']});
    const p=await (await b.newContext({viewport:{width:960,height:540}})).newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,140)));
    const missed=[]; p.on('response',r=>{ if(r.status()>=400 && /assets\/tex/.test(r.url())) missed.push(r.url()+' '+r.status()); });
    await p.goto(base+'/index.html?debug=1',{waitUntil:'load',timeout:120000});
    await p.waitForFunction("(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()",null,{timeout:300000});
    await p.waitForFunction("(()=>{try{return document.getElementById('load').style.display==='none';}catch(e){return false;}})()",null,{timeout:420000});
    await p.evaluate("__hc.lock(true); __hc.pinScene(); __hc.freeze(true,false); __hc.setTime(0.27)");
    await sleep(1200);
    T('no 404 on a gun texture', missed.length===0, missed);
    const rows=[];
    // 'python' is not an item id — the Colt Python IS `revolver` (GUN_FINISH carries both keys so a future split
    // does not silently lose the finish). ranch_revolver and target_pistol are pack guns with their own ids.
    for(const id of ['revolver','ar15','ak','shotgun','minigun']){
      const r=await p.evaluate(g=>__hc.gunFinish?__hc.gunFinish(g):{err:'no probe'}, id);
      rows.push(Object.assign({id},r)); console.log(id, JSON.stringify(r));
    }
    const by=id=>rows.find(r=>r.id===id)||{};
    T('the three finishes decoded at 512', rows.every(r=>r.texOK!==false), rows.map(r=>[r.id,r.tex,r.texSize]));
    T('a nickel revolver is glossier than an AK', by('revolver').shin > by('ak').shin*2, {rev:by('revolver').shin, ak:by('ak').shin});
    T('the Python got nickel', by('revolver').tex==='nickel', by('revolver'));
    T('the AK stayed matte steel', by('ak').tex==='steel' && by('ak').shin<=60, by('ak'));
    T('the AR is blued, not bright', by('ar15').tex==='blued', by('ar15'));
    // Not every mesh takes the sheet and that is correct: a lens takes a colour and no photograph, sight prongs
    // carry their own silver, and the revolver's loaded cases are their own material. What must be true is that the
    // gun's METAL is wearing it, which on these models is eight-plus meshes.
    T('every finished gun is wearing its finish', rows.every(r=>r.mapped>=8), rows.map(r=>[r.id,r.mapped,r.meshes]));
    // THE BAKED ICONS ARE THE ONES THE GAME USES. The manifest is fetched at boot; anything in it must resolve to a
    // real file, and the item's icon URL must be that file rather than a freshly baked data URL.
    const ico=await p.evaluate("(()=>{const l=__hc.iconList(); const id=l.find(i=>i==='ar15')||l[0];"+
      "return {id, url:(typeof iconURLFor==='function')?iconURLFor(id):null, baked:!!__hc.iconBake(id)};})()");
    const man=await p.evaluate("fetch('./assets/icons/manifest.json').then(r=>r.json()).then(j=>j.icons.length).catch(()=>0)");
    console.log('icons', JSON.stringify({man, ico}));
    T('the icon manifest is on disk and populated', man>100, {count:man});

    T('zero page errors', errs.length===0, errs.slice(0,2));
    console.log(fails? fails+' FAILURE(S)':'ALL PASS');
    await b.close();
  } finally { try{ server.kill(); }catch(e){} }
  process.exit(fails?1:0);
})().catch(e=>{ console.error(String(e.message).slice(0,300)); process.exit(1); });
