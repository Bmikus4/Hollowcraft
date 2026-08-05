// A LANTERN WITH NOTHING UNDER IT HANGS FROM A CHAIN (Ben's backlog item 20: "lanterns with no block below hang from a textured
// chain"). It used to float: the ring handle on its lid reached 0.63 and stopped in mid-air. Reads the drawn scene - the chain is
// real links on the lantern's own brushed-iron material - so the test is that they exist, that they reach the block above, and that a
// lantern standing on the ground does NOT get them.
//   node bench/assert-lantern-chain.mjs
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
const partsAt=async(page,dx,dy,dz)=>{ let r=null; for(let i=0;i<30;i++){ await sleep(350); r=await page.evaluate(`__hc.campfireParts(${dx},${dy},${dz})`); if(r&&r.parts&&r.parts.length) break; } return r; };
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
    // FROZEN. The probe offsets are relative to the player, the teleport puts them six blocks up in mid-air, and each block's parts
    // take several seconds to appear behind the remesh queue — so without this the player has fallen by the time the second lantern is
    // measured and the offsets point at empty air. The first run of this reported the two-block hang as having no chain at all.
    await page.evaluate(`(()=>{ const p=__hc.probe(); __hc.tp(p.x,p.gyHere+6,p.z); __hc.freeze(true,false); })()`); await sleep(900);
    // A ceiling block, then air, then the lantern one and two blocks under it; and one standing on stone.
    await page.evaluate(`(()=>{ __hc.setBlock(0,2,-3,'stone'); __hc.setBlock(0,1,-3,'lantern');
        // Dig the two cells under the two-block lantern out FIRST: the terrain here is a slope, and twice this bench built a
        // "hanging" lantern that was resting on it.
        __hc.setBlock(3,0,-3,null); __hc.setBlock(3,-1,-3,null);
        __hc.setBlock(3,3,-3,'stone'); __hc.setBlock(3,1,-3,'lantern');
        __hc.setBlock(-3,0,-3,'lantern'); })()`);
    // A FULL REBUILD AFTER ALL THREE ARE PLACED. The chain length is read from the block ABOVE the lantern at mesh time, so whichever
    // remesh happens to run between two writes can see a lantern with no ceiling over it yet — the first run of this measured the
    // one-block hang correctly and the two-block one as chainless for exactly that reason. Walking the render distance down and back
    // up rebuilds every chunk with all three lanterns and all three ceilings in place, which is also what a reload does.
    await sleep(1200); await page.evaluate(`__hc.rd(3)`); await sleep(2200); await page.evaluate(`__hc.rd(8)`); await sleep(2500);
    const hang1=await partsAt(page,0,1,-3), hang2=await partsAt(page,3,1,-3), stood=await partsAt(page,-3,0,-3);
    const links=(r)=>((r&&r.parts)||[]).filter(p=>p.type==='BufferGeometry');
    // What is actually in the column the two-block hang is measured in — "no chain" and "no ceiling to hang from" look identical.
    // dy 0 must be AIR under the two-block lantern, or it is standing on the ground and correctly gets no chain — which is what the
    // first version of this bench built by accident: the freeze landed the player before the blocks went in, so every offset was one
    // fall lower than intended and the "hanging" lantern was sitting on grass.
    const col=await page.evaluate(`(()=>{ const o={}; for(const dy of [-1,0,1,2,3,4]) o['dy'+dy]=__hc.campfireParts(3,dy,-3).block; return o; })()`);
    console.log('    two-block column blocks', JSON.stringify(col));
    console.log('    one-block hang', JSON.stringify(((hang1&&hang1.parts)||[]).map(p=>({t:p.type,top:p.top}))));
    console.log('    two-block hang', JSON.stringify(((hang2&&hang2.parts)||[]).map(p=>({t:p.type,top:p.top}))));
    console.log('    standing      ', JSON.stringify(((stood&&stood.parts)||[]).map(p=>({t:p.type,top:p.top}))));
    ok('a hanging lantern is built at all', hang1 && hang1.parts && hang1.parts.length>=4, {parts:hang1&&hang1.parts&&hang1.parts.length});
    ok('...and it has a chain of links', links(hang1).length>0, links(hang1));
    // The chain has to REACH what it hangs from: the underside of the block above sits at y=1 over the lantern.
    ok('...and the chain reaches the block above it', links(hang1).some(p=>p.top>=0.9), links(hang1).map(p=>p.top));
    ok('the two-block lantern really is hanging (air under it)', col.dy0===0, col);
    ok('a lantern two blocks under its ceiling gets a longer chain', links(hang2).some(p=>p.top>=1.85), links(hang2).map(p=>p.top));
    ok('a lantern standing on the ground gets no chain', links(stood).length===0, links(stood));
    // EVERY LINK STANDS UP, AND THEY INTERLOCK (Ben 08-05: "some chains on the top of lanterns arent rotated correctly, certain
    // links"). Read out of the merged geometry's vertices, because the chain is one mesh with no object per link: an upright torus of
    // R 0.038 / r 0.013 is 0.102 tall, a link laid flat is 0.026 tall. Half the chain was flat — rotateX(PI/2) was applied to every
    // link and rotateZ(PI/2) stood only the odd ones back up.
    const ch=await page.evaluate(`__hc.lanternChain(0,1,-3)`);
    console.log('    chain', JSON.stringify(ch));
    ok('the chain is read link by link', ch && ch.links>=4, {links:ch&&ch.links, no:ch&&(ch.no||ch.err)});
    ok('no link is lying flat', ch && ch.flat===0, {flat:ch&&ch.flat, of:ch&&ch.links, rows:ch&&ch.rows});
    ok('...and consecutive links interlock at ninety degrees', ch && ch.alternates===true, {rows:ch&&ch.rows});
    ok('no page errors', errors.length===0, errors);
    await b.close();
  } finally { server.kill(); }
  console.log(`
${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
