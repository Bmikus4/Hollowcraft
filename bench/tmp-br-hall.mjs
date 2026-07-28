// A HALL, AS A PLAYER SEES IT. Ben reports lighting completely broken, doors not opening, empty doorways and open doors
// blocked, lines above doorways, and wall edges peeking through other walls — while tmp-br-visible and tmp-br-playtest pass.
// So those are measuring the wrong things. This one drives the REAL interaction paths through hooks that identify openings by
// world POSITION (a teleport can rebuild the env and reorder BR.doors, so an index taken before a move is stale), walks at
// them with the actual collider, and photographs the result on BOTH storeys with no QA light — what the fluorescents alone do.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '..');
const OUT = path.join(ROOT,'bench','results');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('server down')); else setTimeout(poll,250); }); })(); }); }
const ARGS=['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'];
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }
let fails=0; const T=(n,ok,d)=>{ if(!ok)fails++; console.log((ok?'PASS':'FAIL')+' — '+n+(d!==undefined?('  '+JSON.stringify(d)):'')); };
async function meanLum(page, y0, y1){
  const png=(await page.screenshot({type:'png'})).toString('base64');
  return await page.evaluate(async ({png,y0,y1})=>{
    const img=new Image(); img.src='data:image/png;base64,'+png; await img.decode();
    const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height;
    const g=cv.getContext('2d'); g.drawImage(img,0,0);
    const py=Math.round(y0*img.height), rows=Math.max(1,Math.round((y1-y0)*img.height));
    const d=g.getImageData(0,py,img.width,rows).data; let s=0;
    for(let i=0;i<d.length;i+=4) s+=(d[i]*0.2126+d[i+1]*0.7152+d[i+2]*0.0722);
    return +(s/(d.length/4)/255).toFixed(4);
  }, {png,y0,y1});
}
const walkFwd = async(page,ticks)=>{ await page.keyboard.down('KeyW'); for(let i=0;i<(ticks||14);i++) await sleep(140); await page.keyboard.up('KeyW'); await sleep(450); };
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port;
    await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,args:ARGS});
    const page=await (await browser.newContext({viewport:{width:1280,height:720}})).newPage();
    const errs=[]; page.on('pageerror',e=>{ errs.push(String(e.message||e).slice(0,200)); console.log('PAGEERROR:',String(e.message||e).slice(0,200)); });
    await page.goto(base+'/index.html?debug=1&t=210',{waitUntil:'load',timeout:90000});
    await page.waitForFunction(`(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()`,{timeout:90000});
    await page.evaluate(`window.__hcBR.enter()`); await sleep(5500);
    await page.evaluate(`__hc.aim(false)`);          // physics + input; without it nothing moves and every probe self-confirms
    console.log('in the halls:', JSON.stringify(await page.evaluate(`window.__hcBRX.stats()`)));

    // ---- 1. LIGHTING, as seen. No QA light: this is the fluorescents alone. ----
    for(const lvl of [0,1]){
      const at=await page.evaluate(`window.__hcBR.goLit(${lvl})`);
      if(!at){ T('a lit ordinary room exists on storey '+lvl, false); continue; }
      await sleep(1500);
      const env=await page.evaluate(`window.__hcBRX.envStats()`);
      const floor=await meanLum(page,0.55,0.90);      // the floor in front of the player
      const wall =await meanLum(page,0.20,0.45);      // walls / ceiling above it
      await page.screenshot({path:path.join(OUT,'hall-storey'+lvl+'.png')});
      console.log('storey '+lvl, JSON.stringify(at), 'litNear='+env.litNear, 'floorLum='+floor, 'wallLum='+wall, 'meshes='+env.meshes);
      T('storey '+lvl+': pooled lights are assigned', env.litNear>0, {litNear:env.litNear, fixtures:env.fixtures});
      T('storey '+lvl+': the fluorescents light the floor', floor>0.055, {floorLum:floor});
      T('storey '+lvl+': and the walls are not black', wall>0.035, {wallLum:wall});
    }

    // ---- 2. DOORS through the real interaction ----
    const stand=await page.evaluate(`window.__hcBR.faceOpening('door',2.4)`);
    await sleep(1000);
    const used=await page.evaluate(`window.__hcBR.useDoor()`);
    // TRACE the swing rather than sampling it once: "a is still 0 a second later" cannot distinguish never-animated from
    // animated-then-reset, and those have completely different causes.
    const trace=[];
    for(let i=0;i<14;i++){ await sleep(110);
      trace.push(await page.evaluate(`(()=>{ const d=(window.__hcBR.doorList()||[]).find(q=>Math.abs(q.cx-(${used.before?used.before.cx:0}))<0.3 && Math.abs(q.cz-(${used.before?used.before.cz:0}))<0.3);
        return d? {a:d.a, closed:d.closed} : null; })()`)); }
    console.log('door interaction:', JSON.stringify(used));
    console.log('swing trace:', JSON.stringify(trace));
    T('doors have hinge groups still attached after the static merge', used.doorsWithPivots>0 && used.before && used.before.hasGrp===true, {withPivots:used.doorsWithPivots, of:used.doors, before:used.before});
    T('the real interaction finds the door you are facing', used.ok===true, {ok:used.ok, stand});
    const swung=trace.some(t=>t && t.a>0.4);
    T('the door actually swings', swung, {before:used.before&&used.before.a, maxA:Math.max(0,...trace.filter(Boolean).map(t=>t.a)), trace});
    await page.screenshot({path:path.join(OUT,'hall-door.png')});

    // ---- 3. AN OPEN DOOR MUST NOT BLOCK ----
    const opn=await page.evaluate(`window.__hcBR.faceOpening('open',2.6)`);
    if(!opn) T('an open door exists to walk through', false);
    else { await sleep(800); await walkFwd(page,16);
      const c=await page.evaluate(`window.__hcBR.crossing(${JSON.stringify(opn)})`);
      console.log('walk through an OPEN door:', JSON.stringify({opn, c}));
      await page.screenshot({path:path.join(OUT,'hall-open-door-walk.png')});
      T('an open door can be walked through', c.along<0.2, {startedAt:opn.back, endedAt:c.along, door:opn}); }

    // ---- 4. AN EMPTY DOORWAY MUST NOT BLOCK ----
    const emp=await page.evaluate(`window.__hcBR.faceOpening('empty',2.6)`);
    if(!emp) T('an empty doorway exists to walk through', false);
    else { await sleep(800); await walkFwd(page,16);
      const c=await page.evaluate(`window.__hcBR.crossing(${JSON.stringify(emp)})`);
      console.log('walk through an EMPTY doorway:', JSON.stringify({emp, c}));
      await page.screenshot({path:path.join(OUT,'hall-empty-doorway.png')});
      T('an empty doorway can be walked through', c.along<0.2, {startedAt:emp.back, endedAt:c.along, doorway:emp}); }

    T('zero page errors', errs.length===0, errs.slice(0,4));
    await browser.close();
  } finally { server.kill(); }
  console.log(fails? ('\n'+fails+' FAILING') : '\nALL PASS');
  process.exit(fails?1:0);
})();
