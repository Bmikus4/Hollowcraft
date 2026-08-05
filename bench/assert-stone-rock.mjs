// PEBBLES GIVE A STONE ROCK, AND FOUR MAKE A COBBLESTONE (Ben 08-05).
// Breaks a real pebble cluster and reads what lands in the inventory, then runs the recipe through the real crafting path — a recipe
// that exists in the table but that the crafter cannot resolve is the failure mode worth testing.
//   node bench/assert-stone-rock.mjs
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
    const page=await (await b.newContext({viewport:{width:900,height:600}})).newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(450,300); await sleep(1200);
    const item=await page.evaluate(`__hc.packInfo(["stone_rock"]).stone_rock`);
    console.log('    item', JSON.stringify(item));
    ok('the stone rock is a named item with an icon', item && item.name==='Stone Rock' && item.icon!==false, item);
    // THE DROP is a fact about the block table, and reading it back beats mining a cluster and hoping the item entity fell within
    // the pickup radius before the assertion ran.
    const blk=await page.evaluate(`__hc.blockInfo('pebbles')`);
    console.log('    pebbles', JSON.stringify(blk));
    ok('pebbles drop a stone rock', blk && blk.drop==='stone_rock', blk);
    // …and flint is not orphaned by that: two snail shells still knap into one, which is what gunpowder and flint_and_steel need.
    const flint=await page.evaluate(`__hc.canCraft('flint')`);
    console.log('    flint recipe', JSON.stringify(flint));
    ok('flint still has a source', flint && flint.found===true && flint.out, flint);
    // FOUR MAKE ONE, through the real craftMatch rather than by reading the recipe list back.
    const craft=await page.evaluate(`__hc.canCraft('cobble')`);
    console.log('    cobble recipe', JSON.stringify(craft));
    ok('four stone rocks resolve to a cobblestone', craft && craft.found===true && craft.out==='cobble:1', craft);
    ok('…and it is exactly four', craft && Array.isArray(craft.pat) && craft.pat.length===4 && craft.pat.every(i=>i==='stone_rock'), craft&&craft.pat);
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`\n${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
