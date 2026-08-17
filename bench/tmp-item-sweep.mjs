// EVERY GUN AND EVERY ITEM, IN ONE SWEEP. Item 5 of the brief — "attachment items with no held/dropped/icon
// model", the scope reticle height, the foregrip and suppressor sizes — plus item 4's untextured head, asked of
// the whole registry at once rather than one screenshot at a time.
//
// THE SWEEP IS GEOMETRY FIRST, PICTURES SECOND. `__hc.itemAudit()` walks every id through itemModel — the one
// resolver behind the ground drop, the 3D icon, the offhand, a peer's hand and the third-person body — and
// reports meshes, triangles, whether anything in it carries a TEXTURE, its size, and which branch it took. That
// is ~200 items answered in one call, and it is the only way this question is affordable: photographing each
// would be two hundred frames and a judgement call on every one.
//
// WHAT THE FLAGS MEAN, and each is a measurement rather than a guess:
//   sprite      the id fell through to extrudeIcon — a one-voxel slab of the drawn 2D tile, which is what an
//               item looks like when nothing has told the resolver it has a model. Detected by BUILDING the
//               fallback and comparing triangle count and bounding box, not by inferring from the shape.
//   placeholder the magenta 0.2 cube: the id is not in ITEMS at all.
//   textured 0  every mesh is flat-coloured. On a block item that is Ben's "fences, doors, trapdoors, all lost
//               their texture"; on a gun it is the untextured-head class of fault.
// A sprite is NOT automatically wrong — food, materials and tools are drawn as pixel art on purpose. What is
// wrong is a sprite where a model exists, which is why the guns and the seven attachments are listed separately.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:/Code/Minecraft', OUT=path.join(ROOT,'bench','results');
const freePort=()=>new Promise(r=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>r(p)); }); });
const waitHttp=(u)=>new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const q=http.get(u,r=>{r.resume();res();}); q.on('error',()=>{ Date.now()-t0>15000?rej(new Error('down')):setTimeout(poll,250); }); })(); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const findBrowser=()=>['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));

// An icon that bakes to nothing is a failure geometry cannot see: the bake has its own camera, its own fit and
// its own lights, and a model that is fine in the hand can still come out as an empty tile or a flat smudge.
// coverage = non-transparent pixels; hues = distinct quantised colours, so a one-colour blob is visible as one.
const ICONS=(page,ids)=>page.evaluate(async(list)=>{
  const out=[];
  for(const id of list){
    const url=__hc.itemIcon(id);
    if(!url || url.err){ out.push({id, err:'no icon'}); continue; }
    const img=await new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.onerror=()=>r(null); i.src=url; });
    if(!img){ out.push({id, err:'icon would not decode'}); continue; }
    const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
    const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(img,0,0);
    const d=g.getImageData(0,0,c.width,c.height).data; let on=0; const hues=new Set();
    for(let p=0;p<c.width*c.height;p++){ const i=p*4; if(d[i+3]<24) continue; on++;
      hues.add((d[i]>>5)+','+(d[i+1]>>5)+','+(d[i+2]>>5)); }
    out.push({ id, coveragePct:+(100*on/(c.width*c.height)).toFixed(1), colours:hues.size });
  }
  return out;
}, ids);

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
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

    const all=await page.evaluate('__hc.itemAudit()');
    if(all.err){ console.log('  AUDIT FAILED:', all.err); await browser.close(); return; }
    const guns=all.filter(r=>r.gun), atts=all.filter(r=>r.att), blocks=all.filter(r=>r.block);
    const rest=all.filter(r=>!r.gun&&!r.att&&!r.block);
    console.log(`\n  ${all.length} items: ${guns.length} guns, ${atts.length} attachments, ${blocks.length} block items, ${rest.length} other`);
    const line=r=>`    ${String(r.id).padEnd(22)} ${String(r.meshes).padStart(4)} mesh ${String(r.tris).padStart(6)} tri  tex ${String(r.textured).padStart(3)}`
      +`  ${JSON.stringify(r.sz)}${r.sprite?'  SPRITE':''}${r.placeholder?'  PLACEHOLDER':''}${r.err?'  ERR '+r.err:''}`;

    console.log('\n  === GUNS ===');
    for(const r of guns) console.log(line(r));
    console.log('\n  === ATTACHMENTS AS ITEMS (brief item 5) ===');
    for(const r of atts) console.log(line(r));

    // `textured === 0` IS NOT A FAULT AND WAS DROPPED AS A FLAG. The first run of this sweep listed 120 items
    // under it — every apple, pot, knife and bottle in the game. Those are built as procedural geometry with
    // flat-coloured materials on purpose, so the flag was measuring "modelled rather than textured", which is
    // most of the item registry. What survives is narrower and each case is a real one:
    //   EMPTY      the resolver returned no geometry at all: an item that is invisible in the hand, on the
    //              ground and in the hotbar.
    //   BOX        12 triangles. That is modelMeshFor's collision box standing in for a model, which happens
    //              when a cat:'model' block has no MODEL_ITEM_BUILDERS entry — the rich builder is the item's
    //              only source of shape, and without it the item is a plain cuboid of one flat colour.
    // AND "12 TRIANGLES" ALONE IS NOT A FAULT EITHER — the second run of this listed grass, dirt, stone and
    // every other ordinary block, because a block item IS a textured cube and a cube is twelve triangles. The
    // three tiers below are what is left once that is subtracted, and only the first two are defects:
    //   EMPTY        no geometry at all — invisible in the hand, on the ground and in the hotbar.
    //   FLAT BOX     twelve triangles and NO texture on any of them: a cuboid of one flat colour standing in
    //                for a model, which is what a cat:'model' block gets when MODEL_ITEM_BUILDERS has no entry.
    //   SHAPED BOX   twelve triangles but correctly textured, and not the 0.3 cube: modelMeshFor's stand-in
    //                wearing the placed block's own material. A fence in the hand is a fence-coloured post
    //                rather than a fence. Lesser, and deliberate as far as the texture goes.
    const isCube=r=>r.sz[0]===0.3&&r.sz[1]===0.3&&r.sz[2]===0.3;
    const empty=all.filter(r=>r.err||r.placeholder||r.meshes===0);
    const flat =all.filter(r=>r.meshes===1&&r.tris===12&&r.textured===0);
    const shaped=all.filter(r=>r.meshes===1&&r.tris===12&&r.textured>0&&!isCube(r));
    console.log('\n  === EMPTY: the item resolves to no geometry ===');
    empty.length?empty.forEach(r=>console.log(line(r))):console.log('    none');
    console.log('\n  === FLAT BOX: a plain untextured cuboid where a model should be ===');
    flat.length?flat.forEach(r=>console.log(line(r))):console.log('    none');
    console.log('\n  === SHAPED BOX: modelMeshFor stand-in, textured (lesser) ===');
    console.log('   ', shaped.map(r=>r.id).join(' ')||'none');
    const bad=[...empty,...flat];

    // WHY each of those is a box, from the dispatch itself rather than from the shape.
    console.log('\n  === AND WHY (modelDiag: the builder the mesher and the item view both read) ===');
    for(const r of bad){
      const d=await page.evaluate(`__hc.modelDiag(${JSON.stringify(r.id)})`);
      if(d&&!d.err) console.log(`    ${String(r.id).padEnd(20)} model=${String(d.model).padEnd(16)} hasItemBuilder=${d.hasItemBuilder}  builderMeshes=${d.builderMeshes??'-'}${d.builderThrows?'  THROWS '+d.builderThrows:''}`);
      else console.log(`    ${String(r.id).padEnd(20)} ${d&&d.err?d.err:'no block of that name'}`);
    }

    console.log('\n  === SPRITE FALLBACKS THAT ARE NOT FOOD OR MATERIALS (a model may be missing) ===');
    for(const r of all.filter(r=>r.sprite&&(r.gun||r.att))) console.log(line(r));

    // The icon bake, for the classes where a missing icon is a bug rather than a style
    const probe=[...guns,...atts,...bad].map(r=>r.id).filter((v,i,a)=>a.indexOf(v)===i).slice(0,60);
    console.log('\n  === ICON BAKE (coverage %, distinct colours) ===');
    for(const r of await ICONS(page,probe)){
      const flag = r.err ? '  '+r.err : (r.coveragePct<2 ? '  EMPTY TILE' : (r.colours<=2 ? '  FLAT SMUDGE' : ''));
      console.log(`    ${String(r.id).padEnd(22)} ${String(r.coveragePct??'--').padStart(6)}%  ${String(r.colours??'--').padStart(4)} colours${flag}`);
    }
    // AND THE PICTURE, because the audit reads the ITEM resolver and the world has its own path. The chunk
    // mesher dispatches on the same MODEL_ITEM_BUILDERS table and falls to the same modelMeshFor box when the
    // entry is missing — so the prediction is that these nine are flat cuboids IN THE WORLD too, not only in
    // the hand. Placing them in a row is what tells the difference between a fault in the item view and a
    // fault in the block, and those are different jobs.
    if(flat.length){
      const ids=flat.map(r=>r.id);
      const at=await page.evaluate(`(function(){
        const p=__hc.probe(); const cx=Math.round(p.x), cz=Math.round(p.z); const gy=__hc.groundY(cx,cz);
        const ids=${JSON.stringify(ids)};
        for(let dx=-2;dx<=ids.length+2;dx++) for(let dz=-3;dz<=3;dz++) for(let y=gy+1;y<=gy+5;y++) __hc.cmdRun('/setblock '+(cx+dx)+' '+y+' '+(cz+dz)+' air');
        ids.forEach((id,i)=>__hc.cmdRun('/setblock '+(cx+i)+' '+(gy+1)+' '+(cz-3)+' '+id));
        return [cx,gy,cz];
      })()`);
      for(let i=0;i<30;i++){ const f=await page.evaluate('__hc.fill()'); if(f&&f.meshed>=f.want) break; await sleep(400); }
      await page.evaluate(`__hc.tp(${at[0]+Math.floor(ids.length/2)}, ${at[1]+2.2}, ${at[2]+2}, 0, -0.18)`); await sleep(3000);
      await page.evaluate('__hc.dayLock(0.25)'); await sleep(2000);
      await page.screenshot({path:path.join(OUT,'sweep-flatbox-world.png')});
      await page.evaluate(`__hc.hold(${JSON.stringify(ids[0])})`); await sleep(1600);
      await page.screenshot({path:path.join(OUT,'sweep-flatbox-held.png')});
      console.log('\n  placed '+ids.join(' ')+' -> sweep-flatbox-world.png / -held.png');
    }
    fs.writeFileSync(path.join(OUT,'item-sweep.json'), JSON.stringify(all,null,1));
    console.log('\n  full table -> bench/results/item-sweep.json');
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('\nDONE');
})().catch(e=>{ console.error(e); process.exit(1); });
