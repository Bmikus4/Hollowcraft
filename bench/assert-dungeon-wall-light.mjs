// NO WALL BLOCK IN THE HALL IS BLOWN OUT (Ben's backlog item 31: "certain dungeon main-room wall blocks are too bright").
//
// The hall was lit by ONE intensity-26 point light at its centre at head height. A point light falls off with the square of the distance,
// so blocks a metre or two from that fixture got an order of magnitude more light than the walls twelve blocks away and clipped to flat
// white. It is four sources at a quarter the intensity, offset +/-6 in x and z, so nothing sits next to a bright point.
//
// Measured as PIXELS on a wall-facing crop, with a floor under the average as well as a ceiling over the peak — otherwise "no blown-out
// blocks" is trivially satisfied by turning the lights off, and the altar lantern alone never lit this room, which is why the fixture
// exists at all. The remaining hot pixels when looking DOWN are the bones and skulls on the floor and the player's own forearm, neither
// of which is a wall block; that view is printed, not asserted.
//
//   node bench/assert-dungeon-wall-light.mjs
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
  let b=null;
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=d3d11','--mute-audio']});
    const page=await (await b.newContext({viewport:{width:1000,height:640}})).newPage();
    page.on('pageerror',e=>console.log('PAGEERROR',String(e.message||e).slice(0,200)));
    await page.goto(base+'/index.html?debug=1&t=252',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,null,{timeout:90000});
    await page.mouse.click(500,320); await sleep(1200);
    let go=null;
    for(let i=0;i<40;i++){ go=await page.evaluate(`__hc.dunGo(2)`); if(!go.err) break; await sleep(1200); }
    console.log('    dunGo', JSON.stringify(go));
    ok('the hall exists and can be stood in', go && !go.err, go);
    if(!go || go.err) throw new Error('no lair');
    // THE CHUNKS HAVE TO BE MESHED AND LIT BEFORE A PIXEL MEANS ANYTHING. Three seconds after dunGo the camera photographed open sky and
    // the light volume read as absent for all 800 wall cells — the room was not built yet where the camera was standing.
    await sleep(9000);
    const wl=await page.evaluate(`__hc.dunWallLight()`);
    console.log('    wall light volume', JSON.stringify({cells:wl.cells, hist:wl.hist, brightest:wl.brightest, skyOpen:wl.skyOpenCells}));
    ok('the wall cells are measurable', wl.cells>200, {cells:wl.cells, noVol:wl.cellsWithNoLightVolume});
    ok('and no ceiling leak is lighting them', wl.skyOpenCells===0, {skyOpenCells:wl.skyOpenCells});
    const lum=async()=>{ const buf=await page.screenshot({ clip:{x:180,y:60,width:640,height:400} });
      return await page.evaluate(async (b64)=>{ const img=new Image(); img.src='data:image/png;base64,'+b64; await img.decode();
        const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; const g=c.getContext('2d'); g.drawImage(img,0,0);
        const d=g.getImageData(0,0,c.width,c.height).data; let mx=0,sum=0,hot=0,n=0;
        for(let i=0;i<d.length;i+=4){ const L=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; if(L>mx)mx=L; sum+=L; if(L>235)hot++; n++; }
        return { max:+mx.toFixed(1), avg:+(sum/n).toFixed(1), hotFrac:+(hot/n).toFixed(4) }; }, buf.toString('base64')); };
    for(const [name,dx,dz] of [['north',0,-12],['east',12,0]]){
      await page.evaluate(`(()=>{ const p=__hc.pos(); return __hc.aimAt(p.x+(${dx}), p.y+1.0, p.z+(${dz})); })()`);
      await sleep(1400);
      await page.screenshot({ path: path.join(ROOT,'bench','results','dun-'+name+'.png') });
      const m=await lum();
      console.log('    '+name+' wall', JSON.stringify(m));
      ok(name+' wall: nothing is blown out', m.hotFrac===0, m);
      ok(name+' wall: ...and it is still lit', m.avg>25, m); }
    await page.evaluate(`(()=>{ const p=__hc.pos(); return __hc.aimAt(p.x, p.y-4, p.z); })()`);
    await sleep(1400);
    await page.screenshot({ path: path.join(ROOT,'bench','results','dun-down.png') });
    console.log('    floor view (diagnostic only — bones, skulls and the player forearm)', JSON.stringify(await lum()));
  } finally { try{ if(b) await b.close(); }catch(e){}; server.kill(); }
  console.log(`
${fails} failed`); console.log('RESULT: '+(fails?'FAIL':'PASS')); process.exit(fails?1:0);
})();
