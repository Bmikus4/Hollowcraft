// WHERE A BODY COMES TO REST (Ben 08-18: "when a MONK DIES its body floats above a roof ... kill a monk indoors, on a
// roof, and beside a building and watch where the body settles").
// FOUR SCENARIOS, and the fourth is the control the change cannot affect:
//   open      no geometry near it at all -- must behave exactly as before
//   indoors   a stone roof two blocks OVER the body: the corpse must rest on the FLOOR, not on the roof
//   on a roof the body dies standing on a slab: it must rest on the slab
//   beside    a wall next to it: it must rest on the ground, not on the wall's top
// THE NUMBER: aboveGround, the corpse's own y less the surface under it, and underGround, how far its lowest point
// sits below that surface. A floating body reads a large positive aboveGround; a sunk one reads negative underGround.
import { openWorld, sleep, OUT } from './lib/rig.mjs';
import path from 'node:path';
(async()=>{ const W=await openWorld({rd:8}); let bad=0;
  const say=(ok,m)=>{ console.log((ok?'  ok    ':'  FAIL  ')+m); if(!ok) bad++; };
  try{ await sleep(2500);
    for(let i=0;i<50;i++){ const f=await W.page.evaluate('__hc.fill()'); if(f.meshed>=f.want) break; await sleep(400); }
    const ev=s=>W.page.evaluate(s);
    await ev('__hc.qaLocked(true)'); await ev('__hc.setTime(0.30)');
    const P=await ev('__hc.probe()');
    // a clear flat pad, so the only geometry in each scenario is the geometry that scenario builds
    const bx=Math.round(P.x)+8, bz=Math.round(P.z);
    await ev(`(()=>{ const gy=Math.round(__hc.surfH(${bx},${bz}));
      for(let dx=-10;dx<=10;dx++) for(let dz=-10;dz<=10;dz++){
        for(let y=gy+1;y<=gy+8;y++) __hc.setBlk(${bx}+dx,y,${bz}+dz,'air');
        __hc.setBlk(${bx}+dx,gy,${bz}+dz,'stone'); }
      return gy; })()`);
    const pad=await ev(`Math.round(__hc.surfH(${bx},${bz}))`);
    console.log('  pad at y='+pad);
    // THE ROOF SITS AT pad+5, NOT pad+3, AND THAT IS ABOUT THE HARNESS. groundYAt starts its downward walk TWO blocks
    // above the height it is handed, and __hc.ragKill spawns from groundYAt(x,z,player.pos.y): with the player standing
    // at pad+1.2 under a roof at pad+3 the walk began ON the roof and the monk was SPAWNED up there, so the corpse then
    // rested on the roof correctly and the test was measuring its own spawn. Five blocks of headroom keeps the spawn on
    // the floor, which is the case Ben is describing.
    const scen={
      open:    '(()=>true)()',
      indoors: `(()=>{ for(let dx=-10;dx<=10;dx++) for(let dz=-10;dz<=10;dz++) __hc.setBlk(${bx}+dx,${pad}+5,${bz}+dz,'stone'); return true; })()`,
      roof:    `(()=>{ for(let dx=-10;dx<=10;dx++) for(let dz=-10;dz<=10;dz++){ __hc.setBlk(${bx}+dx,${pad}+1,${bz}+dz,'stone'); __hc.setBlk(${bx}+dx,${pad}+2,${bz}+dz,'stone'); } return true; })()`,
      beside:  `(()=>{ for(let dz=-10;dz<=10;dz++) for(let y=${pad}+1;y<=${pad}+4;y++) __hc.setBlk(${bx}+4,y,${bz}+dz,'stone'); return true; })()`,
    };
    const clear=`(()=>{ for(let dx=-10;dx<=10;dx++) for(let dz=-10;dz<=10;dz++) for(let y=${pad}+1;y<=${pad}+8;y++) __hc.setBlk(${bx}+dx,y,${bz}+dz,'air'); return true; })()`;
    for(const [name,build] of Object.entries(scen)){
      await ev(clear); await sleep(300);
      await ev(build); await sleep(500);
      // stand on the pad so ragKill drops the body onto it
      await ev(`__hc.tpExact(${bx-3}, ${bz}, ${pad+1.2})`); await sleep(400);
      const k=await ev("__hc.ragKill('monk')"); await sleep(4500);
      const st=await ev('__hc.ragState()');
      const r=st && st[st.length-1];
      console.log('  '+name.padEnd(8)+' kill '+JSON.stringify(k).slice(0,60)
        +'  corpse y '+(r?r.y:'-')+'  surface '+(r?r.gy:'-')+'  old probe said '+(r?r.gyOld:'-')+'  '+'  aboveGround '+(r?r.aboveGround:'-')+'  underGround '+(r?r.underGround:'-')+'  settled '+(r?r.settled:'-'));
      if(r){
        say(Math.abs(r.underGround)<0.35, name+': the body is not sunk into the surface ('+r.underGround+')');
        const expect = (name==='roof') ? pad+2 : pad;   // the slab's top, or the pad
        // THE PROOF THE FIX IS LOAD-BEARING: under a roof the old probe returns the ROOF and the fixed one the floor,
        // in the same frame. Only the indoors case can show it -- in the open, on a slab and beside a wall the two
        // probes agree, which is exactly why the fault only ever showed up indoors.
        if(name==='indoors') say(r.gyOld>r.gy+1,
          'indoors: the old probe would have rested him at '+r.gyOld+' (the roof) where the fixed one finds '+r.gy);
        say(Math.abs(r.gy-(expect+1))<1.2 || Math.abs(r.gy-expect)<1.2,
          name+': it rested on the surface it died on, y~'+expect+' (found '+r.gy+')');
      }
      await W.page.screenshot({path:path.join(OUT,'corpse-'+name+'.png')});
    }
    console.log('');
    console.log('  '+(bad?bad+' failed':'all ok'));
  } finally { await W.close(); process.exit(bad?1:0); } })();
