// LADDERS, DOORS, FENCES, TRAPDOORS AND CHESTS ARE PINE LOG (Ben 08-05: "ladders, doors, fences, and trapdoors should all be
// textured the same thing as pine log" / "same with chests"). They took the planks tile — and the ladder its own 'ladder' tile — so
// reads the DRAWN material off each block in the world rather than the constant that chose it.
//   node bench/assert-pine-woodwork.mjs
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
const WANT=['ladder','door','fence','trapdoor','chest'];
(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(450,300); await sleep(1200);
    await page.evaluate(`(()=>{ const p=__hc.probe(); __hc.tp(p.x,p.gyHere+3,p.z); })()`); await sleep(800);
    for(let i=0;i<WANT.length;i++){
      const id=WANT[i], dz=-2-i;
      await page.evaluate(`__hc.setBlock(0,-1,${dz},'${id}')`);
      let r=null;
      for(let k=0;k<30;k++){ await sleep(350); r=await page.evaluate(`__hc.campfireParts(0,-1,${dz})`); if(r&&r.parts&&r.parts.length) break; }
      const parts=(r&&r.parts)||[];
      const mapped=parts.filter(p=>p.map);
      console.log('   ', id.padEnd(10), JSON.stringify({block:r&&r.block, at:r&&r.at, parts:parts.length, maps:[...new Set(mapped.map(p=>p.map))], types:[...new Set(parts.map(p=>p.type))]}));
      // A chest is not built by the shared wooden path — it has its own builder, so its materials come from there rather than from
      // the chunk's instanced meshes. Same question, different place to ask it.
      if(id==='chest'){
        const mm=await page.evaluate(`__hc.modelMats('chest')`);
        const wood=(mm.parts||[]).filter(p=>p.type==='MeshLambertMaterial');
        console.log('    chest materials', JSON.stringify(mm));
        ok('chest: its wood is textured at all', wood.length>0 && wood.every(p=>p.map), wood);
        ok('chest: …and the wood is the pine log tile', wood.every(p=>p.map && p.map.indexOf('log_side')===0), wood.map(p=>p.map));
        ok('chest: …and the lid still reads darker than the body', (()=>{ const b=wood.find(p=>!p.lidPart), l=wood.find(p=>p.lidPart);
              if(!b||!l) return false; return parseInt(l.color.slice(1),16) < parseInt(b.color.slice(1),16); })(), wood.map(p=>({lid:p.lidPart,c:p.color})));
        continue; }
      ok(id+': it is drawn with a texture at all', mapped.length>0, {parts:parts.length, maps:mapped.map(p=>p.map)});
      // The wooden part of each carries log_side. A chest also has iron, and bars have no wood at all — so this asks that the wood
      // is pine, not that every material on the block is.
      ok(id+': …and the wood is the pine log tile', mapped.some(p=>p.map && p.map.indexOf('log_side')===0), [...new Set(mapped.map(p=>p.map))]);
      ok(id+': …and none of its wood is still planks', !mapped.some(p=>p.map && p.map.indexOf('planks')===0), [...new Set(mapped.map(p=>p.map))]);
    }
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
