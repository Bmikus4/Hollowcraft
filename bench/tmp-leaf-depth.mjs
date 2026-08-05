// Ben 08-05: "make sure that oak leaves can be seen behind eachother, and we can also see both sides of them".
// TWO PAGES, ONE MEASUREMENT EACH, SAME SEED AND SAME VANTAGE. The change is in the MESHER (the leaf pass no longer
// culls leaf-to-leaf faces) and in leafMat.side, so it cannot be toggled from the console the way leafCut can — a
// paired in-page A/B is impossible here. Instead a copy of index.html with those two lines put back is served
// alongside, and both are asked the same three questions:
//   1. HOW MANY LEAF SURFACES DOES A RAY THROUGH THE TREE HIT? Counted off the leaf geometry itself, by intersecting
//      the leaf meshes' triangles — not judged off a screenshot. This is the claim: it was 1-2 (the shell) and should
//      now be 3+.
//   2. WHAT DOES THE CANOPY COST? median fps and the leaf/foliage vertex totals.
//   3. Do the sprigs still cover the canopy (canopyProbe faces vs verts) after the per-cell axis rule?
// node bench/tmp-leaf-depth.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = 'D:\\code\\Minecraft';
const OLD  = path.join(ROOT, '_leafab_old.html');
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(u,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now(); (function poll(){ const rq=http.get(u,r=>{r.resume();res();}); rq.on('error',()=>{ if(Date.now()-t0>t)rej(new Error('down')); else setTimeout(poll,250); }); })(); }); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));

// The OLD page: the two shipped lines reverted, nothing else. If either replacement misses, the A/B is meaningless, so
// it fails loudly rather than measuring the same build twice.
function writeOld(){
  let h = fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const a = h.replace('? (nid)=> isOpaque[nid]                          // LEAVES ARE SEEN THROUGH EACH OTHER',
                      '? (nid, sid)=> isOpaque[nid] || nid===sid        // OLD: leaf-leaf culled // LEAVES ARE SEEN THROUGH EACH OTHER');
  if(a===h) throw new Error('revert 1 (leaf pass hides) did not match');
  h=a;
  const b = h.replace('const leafMat   = injectAtlas(new THREE.MeshPhongMaterial({ side:THREE.DoubleSide',
                      'const leafMat   = injectAtlas(new THREE.MeshPhongMaterial({ side:THREE.FrontSide');
  if(b===h) throw new Error('revert 2 (leafMat side) did not match');
  fs.writeFileSync(OLD, b);
}

// Counts the distinct leaf SURFACES a ray crosses, straight off the meshed triangles. Held as a string because both
// pages get the identical body.
const RAYFN = `(function(rays){
  const tris=[]; // [ax,ay,az,bx,by,bz,cx,cy,cz] in world space, leaf meshes only
  __hcWorldEach(function(m){
    const g=m.geometry, p=g.attributes.position.array, ix=g.index?g.index.array:null;
    const ox=m.parent.position.x, oy=m.parent.position.y, oz=m.parent.position.z;
    const n = ix? ix.length : (p.length/3);
    for(let i=0;i<n;i+=3){
      const i0=(ix?ix[i]:i)*3, i1=(ix?ix[i+1]:i+1)*3, i2=(ix?ix[i+2]:i+2)*3;
      tris.push([p[i0]+ox,p[i0+1]+oy,p[i0+2]+oz, p[i1]+ox,p[i1+1]+oy,p[i1+2]+oz, p[i2]+ox,p[i2+1]+oy,p[i2+2]+oz]);
    }
  });
  const out=[];
  for(const r of rays){
    const o=r.o, d=r.d, hits=[];
    for(const t of tris){
      // Möller-Trumbore, two-sided: a back-facing leaf is a leaf the player can now see.
      const e1=[t[3]-t[0],t[4]-t[1],t[5]-t[2]], e2=[t[6]-t[0],t[7]-t[1],t[8]-t[2]];
      const h=[d[1]*e2[2]-d[2]*e2[1], d[2]*e2[0]-d[0]*e2[2], d[0]*e2[1]-d[1]*e2[0]];
      const a=e1[0]*h[0]+e1[1]*h[1]+e1[2]*h[2]; if(Math.abs(a)<1e-9) continue;
      const f=1/a, s=[o[0]-t[0],o[1]-t[1],o[2]-t[2]];
      const u=f*(s[0]*h[0]+s[1]*h[1]+s[2]*h[2]); if(u<0||u>1) continue;
      const q=[s[1]*e1[2]-s[2]*e1[1], s[2]*e1[0]-s[0]*e1[2], s[0]*e1[1]-s[1]*e1[0]];
      const v=f*(d[0]*q[0]+d[1]*q[1]+d[2]*q[2]); if(v<0||u+v>1) continue;
      const tt=f*(e2[0]*q[0]+e2[1]*q[1]+e2[2]*q[2]); if(tt>0.01 && tt<64) hits.push(tt);
    }
    hits.sort((x,y)=>x-y);
    // DISTINCT SURFACES, not triangles: the two triangles of one quad share a t, and a quad merged over several cells
    // is still one surface. 0.5 block apart counts as a new layer.
    let layers=0, last=-9; for(const t of hits){ if(t-last>0.5){ layers++; last=t; } }
    out.push(layers);
  }
  return { tris:tris.length, layers:out };
})`;

(async()=>{
  writeOld();
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT,'mp-server.js')], { cwd:ROOT, env:{...process.env, MP_PORT:String(port), MP_DISC:String(port+1)}, stdio:'ignore' });
  const browser = await chromium.launch({ executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:true,
    args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--disable-background-timer-throttling'] });
  const run = async (file)=>{
    const page = await (await browser.newContext({ viewport:{width:1000,height:560} })).newPage();
    page.on('pageerror', e=>console.log('  PAGEERROR:', String(e.message||e).slice(0,200)));
    await page.goto('http://127.0.0.1:'+port+'/'+file+'?debug=1', { waitUntil:'load', timeout:120000 });
    await page.waitForFunction('(()=>{try{return window.__hc && __hc.st().started===true;}catch(e){return false;}})()', null, {timeout:180000});
    await page.evaluate('__hc.setTime(0.25)');
    const spot = await page.evaluate(`(()=>{ const P=__hc.probe(); for(let r=30;r<200;r+=6) for(let a=0;a<16;a++){
        const th=a*0.3927, x=Math.round(P.x+Math.sin(th)*r), z=Math.round(P.z+Math.cos(th)*r);
        const g=__hc.treeGates(x,z); if(g.emits) return {x,z,h:g.h,kind:g.kindName}; } return null; })()`);
    await page.evaluate('__hc.tpAt('+(spot.x+14)+','+(spot.h+9)+','+(spot.z+14)+')');
    await page.waitForFunction('(()=>{try{const f=__hc.fill(); return f.meshed>=f.want;}catch(e){return false;}})()', null, {timeout:120000}).catch(()=>{});
    await sleep(4000);
    await page.evaluate('__hc.look('+spot.x+','+(spot.h+8)+','+spot.z+')');
    await sleep(2000);
    // a leaf-mesh walker the ray function can call without three
    await page.evaluate(`window.__hcWorldEach = function(f){ __hc.leafMeshes().forEach(f); };`).catch(()=>{});
    const fps = await (async()=>{ const s=[]; for(let i=0;i<12;i++){ await sleep(400); await page.evaluate('__hc.setTime(0.25)'); s.push((await page.evaluate('__hc.st()')).fps); } s.sort((a,b)=>a-b); return s[s.length>>1]; })();
    // eight horizontal rays into the canopy centre from outside, at two heights
    const rays = await page.evaluate(`(()=>{ const cx=${spot.x}+0.5, cz=${spot.z}+0.5, out=[];
        for(const dy of [4,7]) for(let a=0;a<4;a++){ const th=a*Math.PI/4;
          out.push({o:[cx+Math.sin(th)*12, ${spot.h}+dy, cz+Math.cos(th)*12], d:[-Math.sin(th),0,-Math.cos(th)]}); }
        return out; })()`);
    const ray = await page.evaluate(RAYFN+'('+JSON.stringify(rays)+')');
    const cp  = await page.evaluate('(()=>{ const c=__hc.canopyProbe(); let lv=0; __hc.leafMeshes().forEach(m=>lv+=m.geometry.attributes.position.count); return {chunks:c.chunks, sprigVerts:c.foliageVerts, faces:c.exposedFaces, vertsPerFace:c.vertsPerFace, leafVerts:lv, side:c.alphaTest}; })()');
    const st  = await page.evaluate('__hc.st()');
    await page.context().close();
    return { spot, fps, ray, cp, tris:ray.tris, frameMs:st.ms||null };
  };
  try{
    await waitHttp('http://127.0.0.1:'+port+'/index.html');
    console.log('--- OLD (leaf-leaf culled, FrontSide) ---');
    const oldR = await run('_leafab_old.html'); console.log(JSON.stringify(oldR,null,1));
    console.log('--- NEW (leaf-leaf meshed, DoubleSide) ---');
    const newR = await run('index.html'); console.log(JSON.stringify(newR,null,1));
    const med = a=>{ const s=[...a].sort((x,y)=>x-y); return s[s.length>>1]; };
    console.log('\nRESULT');
    console.log('  leaf layers a ray hits   OLD ' + JSON.stringify(oldR.ray.layers) + '  median ' + med(oldR.ray.layers));
    console.log('                           NEW ' + JSON.stringify(newR.ray.layers) + '  median ' + med(newR.ray.layers));
    console.log('  leaf triangles in view   OLD ' + oldR.tris + '  NEW ' + newR.tris + '  x' + (newR.tris/Math.max(1,oldR.tris)).toFixed(2));
    console.log('  median fps               OLD ' + oldR.fps + '  NEW ' + newR.fps);
    console.log('  sprig verts / faces      OLD ' + oldR.cp.sprigVerts + ' / ' + oldR.cp.faces + '   NEW ' + newR.cp.sprigVerts + ' / ' + newR.cp.faces);
  } finally {
    await browser.close(); server.kill(); try{ fs.unlinkSync(OLD); }catch(e){}
  }
})();
