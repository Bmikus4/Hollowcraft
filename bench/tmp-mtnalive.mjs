// IS THE LAYER EVEN IN THE FRAME? uDbg=2 paints every mountain fragment green and no green band appears at any
// bearing, so before touching the shader again: is the mesh drawn, what alpha does its own mask give it, and does the
// group it hangs off still exist after the ocean rebuild.
import { openWorld, pin, sleep } from './lib/rig.mjs';
import { HELPERS } from './perf-census.mjs';
const W = await openWorld({ rd:8, quality:'High', w:1280, h:720 });
try{
  await W.ev(HELPERS);
  await W.ev(`(function(){ goShore(); const p=__hc.pos(); __hc.tpAt(p.x-100, 46, p.z); H.cam({yaw:3.665, pitch:0.06}); })()`);
  for(let i=0;i<50;i++){ if(await W.ev(`(()=>{const f=__hc.fill();return f.meshed>=f.want})()`)) break; await sleep(500); }
  await sleep(2500);
  await W.ev(`__hc.fog(0); __hc.overcast(0); __hc.cinema(true); __hc.freezeT(120)`);
  await pin(W,0.25);
  console.log(await W.ev(`(()=>{
    const out={};
    try{ out.mtn = (()=>{ let f=null; scene.traverse(o=>{ if(o.renderOrder===-5.4) f=o; });
      if(!f) return 'no object at renderOrder -5.4';
      const chain=[]; let p=f; while(p){ chain.push({t:p.type, name:p.name||'', vis:p.visible}); p=p.parent; }
      return { visible:f.visible, inScene:chain[chain.length-1].t==='Scene', chain,
               matVis:!!f.material.visible, transparent:f.material.transparent, depthTest:f.material.depthTest,
               frustumCulled:f.frustumCulled, geoCount:f.geometry.attributes.position.count }; })(); }
    catch(e){ out.mtn='ERR '+e.message; }
    try{ out.uniforms=(()=>{ const u=_mtU, o={}; for(const k in u){ const v=u[k].value;
        o[k]=(v&&v.isVector2)?[+v.x.toFixed(2),+v.y.toFixed(2)]:(v&&v.isColor)?[+v.r.toFixed(3),+v.g.toFixed(3),+v.b.toFixed(3)]:(typeof v==='number'?+v.toFixed(4):String(v&&v.constructor&&v.constructor.name)); }
      return o; })(); }catch(e){ out.uniforms='ERR '+e.message; }
    try{ out.maskPeek=(()=>{ const rows=[]; for(let i=0;i<8;i++){ const o=i*4*48; rows.push([_mtData[o],_mtData[o+1],_mtData[o+2],_mtData[o+3]]); } return rows; })(); }
    catch(e){ out.maskPeek='ERR '+e.message; }
    return JSON.stringify(out,null,1);
  })()`));
}finally{ await W.close(); }
