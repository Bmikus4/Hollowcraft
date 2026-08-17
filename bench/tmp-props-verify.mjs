// THE SEVEN SHARED PROPS: did the item view gain a model, and did the WORLD stay exactly as it was.
// Both halves matter and only one of them is the feature. Moving geometry into PROP_PARTS is a refactor of the
// chunk mesher, and the bar on a refactor here is "no visible change except where it was wrong" — so this
// places the same nine blocks in the same order at the same camera as the pre-fix frame
// (bench/results/props-before-world.png) and prints the item audit for the same ids.
//
// THE ID LIST IS HARDCODED, deliberately. The sweep derives its list from what is BROKEN, so after a fix that
// list is shorter and the layout shifts — and two frames of different layouts cannot be compared. quilt and
// rocking_chair_w stay in the row for that reason alone: quilt was never a defect (its world form is the same
// flat slab and it reads as a rug), and rocking_chair_w is a hidden item.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const IDS=['bed','flower_pot','potted_fern','quilt','rocking_chair','rocking_chair_w','font','bell','bell_button'];
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

// Two PNGs, pixel by pixel. A refactor that moved the world would show here; the leaves and the sea animate, so
// a handful of changed pixels is the floor and a changed PROP is thousands in one place.
const DIFF=(page,a,b)=>page.evaluate(async(o)=>{
  const ld=async(src)=>{ const i=await new Promise(r=>{ const im=new Image(); im.onload=()=>r(im); im.src=src; });
    const c=document.createElement('canvas'); c.width=i.width; c.height=i.height;
    const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(i,0,0);
    return { d:g.getImageData(0,0,c.width,c.height).data, W:c.width, H:c.height }; };
  const A=await ld(o.a), B=await ld(o.b);
  if(A.W!==B.W||A.H!==B.H) return {err:'different sizes'};
  let n=0, worst=0, wx=0, wy=0;
  // the row of props only: the bottom-centre band, so sky, sea and canopy motion cannot vote
  for(let y=(A.H*0.42)|0;y<A.H*0.72;y++)for(let x=(A.W*0.10)|0;x<A.W*0.95;x++){ const i=(y*A.W+x)*4;
    const dd=Math.abs(A.d[i]-B.d[i])+Math.abs(A.d[i+1]-B.d[i+1])+Math.abs(A.d[i+2]-B.d[i+2]);
    if(dd>24) n++; if(dd>worst){ worst=dd; wx=x; wy=y; } }
  return { changedPx:n, worstDelta:worst, at:[wx,wy] };
}, {a:'data:image/png;base64,'+fs.readFileSync(a).toString('base64'), b:'data:image/png;base64,'+fs.readFileSync(b).toString('base64')});

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({ executablePath:findBrowser(), headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required'] });
    const page=await (await browser.newContext({viewport:{width:1100,height:620}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,180)));
    await page.goto(base+'/index.html?debug=1&rd=8',{waitUntil:'load',timeout:90000});
    await page.waitForFunction('(()=>{try{return window.__hc&&__hc.st().started===true;}catch(e){return false;}})()',null,{timeout:90000});
    await page.waitForFunction('(()=>{try{return __hc.probe().chunkHere===true;}catch(e){return false;}})()',null,{timeout:90000});
    await sleep(9000);

    console.log('\n  === THE ITEM VIEW, for the same nine ids ===');
    const all=await page.evaluate('__hc.itemAudit()');
    for(const id of IDS){ const r=all.find(x=>x.id===id); if(!r){ console.log('   ',id,'not in ITEMS'); continue; }
      const box=(r.meshes===1&&r.tris===12);
      console.log(`    ${id.padEnd(18)} ${String(r.meshes).padStart(3)} mesh ${String(r.tris).padStart(6)} tri  tex ${String(r.textured).padStart(2)}  ${JSON.stringify(r.sz)}${box?'   STILL A BOX':''}`); }

    // THE ICON IS A THIRD SURFACE and it bakes with its own camera, fit and lights — a model that is right in
    // the hand can still come out as an empty tile. Pre-fix these read 42-67% coverage in ONE colour, which is
    // what a flat cuboid looks like at 100 px.
    console.log('\n  === THE BAKED HOTBAR ICON ===');
    for(const r of await page.evaluate(async(ids)=>{ const out=[];
      for(const id of ids){ const url=__hc.itemIcon(id); if(!url||url.err){ out.push({id,err:'none'}); continue; }
        const img=await new Promise(r2=>{ const i=new Image(); i.onload=()=>r2(i); i.onerror=()=>r2(null); i.src=url; });
        if(!img){ out.push({id,err:'undecodable'}); continue; }
        const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
        const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
        const d=g.getImageData(0,0,c.width,c.height).data; let on=0; const hues=new Set();
        for(let p=0;p<c.width*c.height;p++){ const i=p*4; if(d[i+3]<24) continue; on++; hues.add((d[i]>>5)+','+(d[i+1]>>5)+','+(d[i+2]>>5)); }
        out.push({id, cov:+(100*on/(c.width*c.height)).toFixed(1), colours:hues.size}); }
      return out; }, IDS))
      console.log(`    ${String(r.id).padEnd(18)} ${String(r.cov??'--').padStart(6)}%  ${String(r.colours??'--').padStart(3)} colours${r.colours<=2?'   FLAT':''}`);

    const at=await page.evaluate(`(function(){
      const p=__hc.probe(); const cx=Math.round(p.x), cz=Math.round(p.z); const gy=__hc.groundY(cx,cz);
      const ids=${JSON.stringify(IDS)};
      for(let dx=-2;dx<=ids.length+2;dx++) for(let dz=-3;dz<=3;dz++) for(let y=gy+1;y<=gy+5;y++) __hc.cmdRun('/setblock '+(cx+dx)+' '+y+' '+(cz+dz)+' air');
      ids.forEach((id,i)=>__hc.cmdRun('/setblock '+(cx+i)+' '+(gy+1)+' '+(cz-3)+' '+id));
      return [cx,gy,cz];
    })()`);
    for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
    await page.evaluate(`__hc.tp(${at[0]+Math.floor(IDS.length/2)}, ${at[1]+2.2}, ${at[2]+2}, 0, -0.18)`); await sleep(3000);
    await page.evaluate('__hc.dayLock(0.25)'); await sleep(2000);
    const world=path.join(OUT,'props-after-world.png'); await page.screenshot({path:world});
    await page.evaluate('__hc.hold("bed")'); await sleep(1600);
    await page.screenshot({path:path.join(OUT,'props-after-held.png')});

    const before=path.join(OUT,'props-before-world.png');
    if(fs.existsSync(before)){
      console.log('\n  === THE WORLD, before vs after, over the row of props ===');
      console.log('   ', JSON.stringify(await DIFF(page,before,world)));
    } else console.log('\n  (no before frame to compare against)');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('\nDONE');
})().catch(e=>{ console.error(e); process.exit(1); });
