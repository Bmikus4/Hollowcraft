// Ben: "some north and south facing block faces are completely blacked out ... IT is ONLY north and south facing ones",
// and then, when I said the sun's azimuth never crosses Z: "I dont think they actually do with the sun, its something
// with lighting though", same family as the black ground blocks. The other session's 23a5582 cleared the scotopic wash
// for the DAYTIME case by construction and pointed back here.
//
// THREE EARLIER RIGS FAILED TO SEPARATE ONE WALL FROM ANOTHER, and all three failed the same way - by trying to say
// WHERE a wall is in the frame (crops), or WHAT it is made of (two block types, which the island also uses). This one
// asks the renderer instead: ?dbg=nrm paints abs(normalize(vObjN)) as rgb, so every pixel carries the AXIS of the face
// under it. Shoot the same box twice, once normally and once in dbg=nrm, and every pixel sorts itself. That technique is
// what cracked bug two and it needs no crop geometry at all.
//   The SIGN comes from the vantage: standing off the box's -x/-z corner, the only x faces visible are -x and the only z
// faces are -z. Shoot the opposite corner too and the other two signs are covered.
// node bench/tmp-wall-axis-luma.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { decodePNG } from './pngprobe.mjs';

const ROOT='D:\\code\\Minecraft';
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// bucket the NORMAL frame's luma by the axis the nrm frame gives for the same pixel
function byAxis(fNorm,fNrm){
  const A=decodePNG(fs.readFileSync(fNorm)), B=decodePNG(fs.readFileSync(fNrm)), ch=A.ch;
  const acc={x:[0,0],y:[0,0],z:[0,0]};
  // THE BOX ONLY. Over the whole frame the z bucket ran to 141,644 pixels - that is the island, not the four walls under
  // test, and its distant terrain drowns the thing being measured. The camera is aimed at the box's centre from eight to
  // eleven blocks, so it sits inside this window.
  for(let y=140;y<330;y++) for(let x=280;x<520;x++){
    const i=(y*A.w+x)*ch;
    const r=B.data[i], g=B.data[i+1], b=B.data[i+2];
    if(Math.max(r,g,b)<30) continue;                    // sky / nothing
    const L=(A.data[i]+A.data[i+1]+A.data[i+2])/3;
    const k = (r>=g&&r>=b) ? 'x' : (g>=r&&g>=b) ? 'y' : 'z';
    acc[k][0]+=L; acc[k][1]++;
  }
  const out={}; for(const k in acc) out[k] = acc[k][1] ? { mean:+(acc[k][0]/acc[k][1]).toFixed(2), px:acc[k][1] } : null;
  return out;
}

(async()=>{
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  const browser=await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio'] });
  const T=process.env.HC_TIME||'0.25';
  const shoot=async(dbg,tag)=>{
    const page=await (await browser.newContext({viewport:{width:800,height:450}})).newPage();
    page.on('pageerror',e=>console.log('  PAGEERROR:',String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/index.html?debug=1'+(dbg?'&dbg='+dbg:''),{waitUntil:'load',timeout:120000});
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()',null,{timeout:180000});
    await page.evaluate('__hc.setTime('+T+')');
    await sleep(3000);
    // KEEP THE BEST, do not demand perfection: a 19x19 treeless clearing does not exist on this island and the harness
    // died with 'no open flat site' rather than measuring anything.
    const site=await page.evaluate(`(()=>{ const P=__hc.probe(); let best=null;
      for(let r=12;r<320;r+=3) for(let a=0;a<24;a++){ const th=a*0.2618;
        const x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g0=__hc.treeGates(x,z); const h=g0&&g0.h; if(h==null||h<=P.sea+3) continue;
        let flat=true, clear=true;
        for(let dx=-2;dx<=2&&flat;dx++)for(let dz=-2;dz<=2;dz++){ const gg=__hc.treeGates(x+dx,z+dz); if(!gg||gg.h!==h){flat=false;break;} }
        let trees=0;
        for(let dx=-7;dx<=7;dx++)for(let dz=-7;dz<=7;dz++){ const gg=__hc.treeGates(x+dx,z+dz); if(gg&&gg.emits) trees++; }
        if(!flat) continue;
        if(!best || trees<best.trees) best={x,z,h,trees};
        if(trees===0) return {x,z,h,trees:0};
      } return best || {err:'no open flat site'}; })()`);
    if(site.err) throw new Error(site.err);
    await page.evaluate(`(()=>{ for(let dx=0;dx<4;dx++) for(let dz=0;dz<4;dz++) for(let dy=1;dy<=4;dy++)
        __hc.setBlockAt(${site.x}+dx, ${site.h}+dy, ${site.z}+dz, 'stone'); })()`);
    await sleep(2500);
    const out={};
    // two opposite corners: the first sees -x and -z, the second +x and +z
    for(const c of [{tag:'neg',cam:[site.x-8, site.h+5, site.z-8]}, {tag:'pos',cam:[site.x+11, site.h+5, site.z+11]}]){
      await page.evaluate('__hc.tpAt('+c.cam.join(',')+')');
      await sleep(1500);
      await page.evaluate('__hc.look('+(site.x+2)+','+(site.h+2.5)+','+(site.z+2)+')');
      await sleep(800);
      await page.evaluate('__hc.look('+(site.x+2)+','+(site.h+2.5)+','+(site.z+2)+')');
      await page.evaluate('__hc.setTime('+T+')'); await sleep(400);
      const f=path.join(ROOT,'bench','results','wallaxis-'+tag+'-'+c.tag+'.png');
      await page.screenshot({path:f});
      out[c.tag]=f;
    }
    await page.context().close();
    return { site, out };
  };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    fs.mkdirSync(path.join(ROOT,'bench','results'),{recursive:true});
    const n=await shoot(null,'norm');
    const m=await shoot('nrm','nrm');
    console.log('site ' + JSON.stringify(n.site) + '   t=' + T);
    for(const c of ['neg','pos']){
      const r=byAxis(n.out[c], m.out[c]);
      const lbl = c==='neg' ? 'looking at the -x and -z walls' : 'looking at the +x and +z walls';
      console.log('  '+lbl);
      console.log('    x faces ' + JSON.stringify(r.x) + '   z faces ' + JSON.stringify(r.z) + '   y faces ' + JSON.stringify(r.y));
      if(r.x&&r.z) console.log('    z minus x: ' + (r.z.mean-r.x.mean).toFixed(2) + ' levels');
    }
  } finally { await browser.close(); server.kill(); }
})();
