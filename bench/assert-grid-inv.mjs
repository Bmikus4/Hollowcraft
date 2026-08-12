// ASSERT: the inventory is a Tarkov grid (Ben 08-11: "Verbatim, I want a tarkov system").
//
// WHAT IS ACTUALLY WORTH CHECKING. That a rifle is 2x4 is a table lookup and proves nothing. What can go wrong in a
// rectangle-packed inventory is: two things in the same cells, a thing outside the container, a thing that vanished
// because it was neither, and a save that comes back different from what went in. Those four are what this measures,
// through the game's own functions rather than through a screenshot.
//
// usage: node bench/assert-grid-inv.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT='D:\\Code\\Minecraft', OUT=path.join(ROOT,'bench','results');
function freePort(){ return new Promise((res,rej)=>{ const s=createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>res(p)); }); s.on('error',rej); }); }
function waitHttp(url,t=15000){ return new Promise((res,rej)=>{ const t0=Date.now();
  (function poll(){ const rq=http.get(url,r=>{r.resume();res();}); rq.on('error',()=>{ Date.now()-t0>t?rej(new Error('down')):setTimeout(poll,250); }); })(); }); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function findBrowser(){ for(const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']) if(fs.existsSync(p)) return p; throw new Error('no browser'); }

let fails=0, checks=0;
function ok(l,c,g){ checks++; if(!c)fails++; console.log('  '+(c?'ok  ':'FAIL')+'  '+l.padEnd(46)+' got='+JSON.stringify(g)); }

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const port=await freePort();
  const server=spawn(process.execPath,[path.join(ROOT,'mp-server.js')],{cwd:ROOT,env:{...process.env,MP_PORT:String(port),MP_DISC:String(port+1)},stdio:'ignore'});
  try{
    const base='http://127.0.0.1:'+port; await waitHttp(base+'/index.html');
    const browser=await chromium.launch({executablePath:findBrowser(),headless:true,
      args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--mute-audio','--autoplay-policy=no-user-gesture-required']});
    const ctx=await browser.newContext({viewport:{width:1280,height:800}});
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push('PAGEERROR '+e));
    await page.goto(base+'/index.html',{waitUntil:'load'});
    await sleep(3000);
    await page.click('#mb-solo');
    for(let i=0;i<90;i++){ if(await page.evaluate(()=>window.__hc.loadState().circleDone)) break; await sleep(500); }
    await sleep(2500);

    console.log('\n[the bar is five and the bag is the rest]');
    const shape=await page.evaluate(()=>window.__hc.gridState());
    ok('hotbar is five slots',   shape.hotN===5, shape.hotN);
    ok('grid is 8 wide',         shape.w===8, shape.w);
    ok('six pockets to start',   shape.cap===6, {cap:shape.cap, rows:shape.h});
    ok('sizes come off the table', JSON.stringify(shape.sizes)===JSON.stringify({ar15:[2,4],stim_syringe:[1,2],rifle_ammo:[1,1],cobble:[1,1]}), shape.sizes);
    // ...and the items being sized are REAL. itemSize answers [1,1] for an id nobody defined, so without this the
    // check above passes for a typo and the grid quietly fills with magenta error cubes.
    ok('and the probe items exist', Object.values(shape.real).every(Boolean), shape.real);

    console.log('\n[capacity is a sum of what you are wearing]');
    // Six pockets, four a garment, a pack on top. The numbers are Ben's; what is worth checking is that they ADD
    // rather than replace, that the ceiling holds, and that a pack nobody has listed yet still gets a size — the third
    // tier is not in the game, and the fallback is what stops it landing as a zero.
    const cap=await page.evaluate(()=>window.__hc.gridCap());
    ok('bare is six',            cap.bare===6, cap);
    ok('a chestplate adds four', cap.chest===10, cap);
    ok('leggings add four',      cap.legs===10, cap);
    ok('the first pack adds 16', cap.pack1===22, cap);
    ok('a full kit is 128',      cap.full===128, cap);
    ok('and never more',         cap.pack3<=128 && cap.full<=128, cap);
    ok('an unlisted pack still sizes', cap.unknownPack>6, cap.unknownPack);

    console.log('\n[nothing overlaps and nothing falls out]');
    // With a pack on: six pockets do not hold a rifle, which is the point of the pockets being six.
    const fill=await page.evaluate(()=>window.__hc.gridFillPacked(['ar15','stim_syringe','rifle_ammo','cobble','revolver','wooden_spear']));
    ok('everything placed',      fill.left===0, fill);
    // A 2x5 hunting rifle does not stand up in a four-row bag, so it LIES DOWN; with a pack on there is headroom and
    // it stands. Nothing about either reading alone shows the fallback working.
    const tall=await page.evaluate(()=>window.__hc.gridTall('hunting_rifle'));
    ok('a long rifle lies down in a small bag', tall.leftFlat===0 && tall.rotFlat===1, tall);
    ok('and stands up once packed',             tall.leftDeep===0 && tall.rotDeep===0, tall);
    const audit=await page.evaluate(()=>window.__hc.gridAudit());
    ok('no two stacks share a cell', audit.overlap===0, audit);
    ok('nothing outside the grid',   audit.outside===0, audit);
    ok('cells used add up',          audit.cellsUsed===audit.cellsClaimed, audit);

    console.log('\n[ammo stacks to 32, blocks do not]');
    const st=await page.evaluate(()=>window.__hc.gridStacks());
    ok('rifle ammo caps at 32',  st.ammoMax===32, st.ammoMax);
    ok('cobble keeps its own cap', st.blockMax>32, st.blockMax);

    console.log('\n[a pack deepens the bag and taking it off does not eat it]');
    const pack=await page.evaluate(()=>window.__hc.gridPack('alice_pack'));
    ok('ALICE gives 120 cells',    pack.hWith===120, pack);
    ok('and the grid is deeper',   pack.hWith>pack.hWithout, pack);
    ok('nothing lost taking it off', pack.countAfter===pack.countBefore, pack);
    ok('and nothing left outside',  pack.outsideAfter===0, pack);

    console.log('\n[the grid survives a save and a reload]');
    const rt=await page.evaluate(()=>window.__hc.gridRoundTrip());
    ok('same stacks come back',  rt.same===true, rt);

    console.log('\n[it is drawn from the pack]');
    // Packed, so there is a rifle in the block to look at: six pockets cannot hold one.
    await page.evaluate(()=>window.__hc.gridFillPacked(['ar15','stim_syringe','rifle_ammo','cobble']));
    await page.evaluate(()=>window.__hc.openInv());
    await sleep(900);
    const live=await page.evaluate(()=>window.__hc.gridAudit());
    const dom=await page.evaluate(()=>{
      const tiles=[...document.querySelectorAll('#griditems .gitem')];
      const cs=tiles.length?getComputedStyle(tiles[0]):null;
      const cell=document.querySelector('#gridbed .gcell');
      return { tiles:tiles.length, cells:document.querySelectorAll('#gridbed .gcell').length,
               frame:cs?cs.borderImageSource:'', cellFrame:cell?getComputedStyle(cell).borderImageSource:'',
               tall:tiles.map(t=>[parseFloat(t.style.width),parseFloat(t.style.height)]) }; });
    ok('a tile per stack',      dom.tiles===live.stacks, {tiles:dom.tiles, stacks:live.stacks});
    // EXACTLY capacity cells, not a padded rectangle: the block ends mid-row and the cells that are not there must
    // not be drawn, or they read as placeable.
    ok('a cell per capacity cell', dom.cells===live.cap, {cells:dom.cells, cap:live.cap});
    ok('tiles wear the pack',   /assets\/ui\//.test(dom.frame), dom.frame.slice(-28));
    ok('cells wear the pack',   /assets\/ui\/hcell/.test(dom.cellFrame), dom.cellFrame.slice(-28));
    // A 2x4 rifle must be 2 cells wide and 4 tall ON SCREEN: the sizes above are a table, this is the geometry.
    ok('a rifle is drawn 2x4',  dom.tall.some(([w,h])=>Math.round(w/44)===2 && Math.round(h/44)===4), dom.tall);
    await page.screenshot({path:path.join(OUT,'grid-inv.png')});

    ok('no page errors', errs.length===0, errs.slice(0,3));
    await browser.close();
  } finally { try{ server.kill(); }catch(e){} }
  console.log('\n'+(fails?'FAILED ':'PASSED ')+(checks-fails)+'/'+checks);
  process.exit(fails?1:0);
})();
