// "also 1x1 deep holes do not get dark for some reason?" (Ben 08-05). _ssky is a column heightfield whose first line is
// `if(ly>=th) return 1`, so a dug 1x1 shaft — its own column empty all the way down — read FULL SKY at any depth, and
// every wall face beside it read the same, because _sskyOpen folded the cell's own column into its max. Neither term
// knew how narrow the opening was.
// ?dbg=sky paints vSky directly, so this is a measurement and not an impression: dig a shaft, stand at the bottom, and
// read the grey. The REGRESSION this could cause is the opposite one (Ben 07-23: cliff and cave-lip faces wrongly black),
// so the same run reads the mean grey of open terrain from four vantages and requires the arms to agree.
// Both arms are page loads of the same file, one with the two functions put back.
// node bench/tmp-shaft-dark.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT='D:\\code\\Minecraft';
const OLD=path.join(ROOT,'_shaft_old.html');
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function grey(file, x0,y0,w,h){
  const P=decodePNG(fs.readFileSync(file)); const ch=P.ch; let s=0,n=0;
  for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ const i=(y*P.w+x)*ch; s+=(P.data[i]+P.data[i+1]+P.data[i+2])/3; n++; }
  return +(s/n).toFixed(2);
}

(async()=>{
  // the baseline is this file with the narrowness test removed from both functions
  const cur=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const A='function _sskyTop(lx,ly,lz){ const s=_ssky(lx,ly,lz); if(s<1) return s;';
  const B='function _sskyOpen(lx,ly,lz){ const s=_ssky(lx,ly,lz);';
  if(!cur.includes(A)||!cur.includes(B)) throw new Error('the fixed functions are not in index.html');
  let old=cur.replace(A, 'function _sskyTop(lx,ly,lz){ return _ssky(lx,ly,lz); } function _sskyTopUnused(lx,ly,lz){ const s=_ssky(lx,ly,lz); if(s<1) return s;')
             .replace(B, 'function _sskyOpen(lx,ly,lz){ const s=_ssky(lx,ly,lz); if(s>=1) return 1;');
  fs.writeFileSync(OLD, old);
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
  const run=async(file,tag)=>{
    const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/'+file+'?debug=1&dbg=sky',{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await sleep(3000);
    // FLAT OPEN GROUND, no trees: a shaft dug under a canopy would be dark for a reason that is not the one under test.
    const site=await page.evaluate(`(()=>{ const P=__hc.probe();
      for(let r=6;r<120;r+=3) for(let a=0;a<24;a++){ const th=a*0.2618;
        const x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        // treeGates carries the surface height for any column, tree or not — there is no surfaceH hook.
        const g0=__hc.treeGates(x,z); const h=g0&&g0.h; if(h==null) continue;
        let flat=true, clear=true;
        for(let dx=-2;dx<=2&&flat;dx++)for(let dz=-2;dz<=2;dz++){ const gg=__hc.treeGates(x+dx,z+dz);
          if(!gg||gg.h!==h){ flat=false; break; } if(gg.emits) clear=false; }
        if(flat && clear && h>P.sea+3) return {x,z,h};
      } return {err:'no flat treeless site'}; })()`);
    if(site.err) throw new Error(site.err);
    // dig 1x1, eight deep
    await page.evaluate(`(()=>{ for(let d=0;d<8;d++) __hc.setBlockAt(${site.x}, ${site.h}-d, ${site.z}, 'air'); })()`);
    await sleep(2500);
    // stand at the bottom and look at a wall
    await page.evaluate('__hc.tpAt('+(site.x+0.5)+','+(site.h-7)+','+(site.z+0.5)+')');
    await sleep(2000);
    await page.evaluate('__hc.look('+(site.x+4.5)+','+(site.h-6.5)+','+(site.z+0.5)+')');
    await sleep(1200);
    const f1=path.join(ROOT,'bench','results','shaft-'+tag+'-wall.png');
    await page.screenshot({path:f1});
    const wall=grey(f1, 300,150, 200,150);
    // …and the floor
    await page.evaluate('__hc.look('+(site.x+0.5)+','+(site.h-9)+','+(site.z+0.5)+')');
    await sleep(1000);
    const f2=path.join(ROOT,'bench','results','shaft-'+tag+'-floor.png');
    await page.screenshot({path:f2});
    const floor=grey(f2, 300,150, 200,150);
    // REGRESSION GUARD: the open world's own mean vSky from four vantages, which must not move.
    const open=[];
    for(const d of [[30,0],[0,30],[-30,0],[0,-30]]){
      await page.evaluate('__hc.tpAt('+(site.x+d[0])+','+(site.h+8)+','+(site.z+d[1])+')');
      await sleep(1500);
      await page.evaluate('__hc.look('+site.x+','+(site.h+1)+','+site.z+')');
      await sleep(900);
      const f=path.join(ROOT,'bench','results','shaft-'+tag+'-open'+d[0]+'_'+d[1]+'.png');
      await page.screenshot({path:f});
      open.push(grey(f, 0,0, 800,400));
    }
    await page.context().close();
    return { site, wall, floor, open, openMean:+(open.reduce((a,b)=>a+b,0)/open.length).toFixed(2) };
  };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    const o=await run('_shaft_old.html','old');
    const n=await run('index.html','new');
    console.log('site ' + JSON.stringify(n.site));
    console.log('  vSky on the shaft WALL   ' + o.wall + ' -> ' + n.wall + '   (255 = full sky, 0 = sealed)');
    console.log('  vSky on the shaft FLOOR  ' + o.floor + ' -> ' + n.floor);
    console.log('  open world mean vSky     ' + o.openMean + ' -> ' + n.openMean + '   ' + JSON.stringify(o.open) + ' -> ' + JSON.stringify(n.open));
  } finally { await browser.close(); server.kill(); try{ fs.unlinkSync(OLD); }catch(e){} }
})();
