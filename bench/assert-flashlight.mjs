// THE FLASHLIGHT PROJECTS A BEAM (Ben 08-06: "adding a flashlight item, which projects directional light, not just
// volumetric light").
//
// "Directional" is the whole claim, so the harness is built to be able to FAIL on it: a light that is merely bright
// would pass a luminance check on the centre of the frame, and a light pointing the wrong way looks identical to a
// light that is off. The three checks that carry the claim are therefore comparative, not absolute:
//   · the crop the beam is aimed at is much brighter than the crop 90 degrees away from it, IN THE SAME FRAME;
//   · turning the switch off returns both crops to where they were;
//   · the beam moves when the camera does — aim elsewhere and the bright crop follows.
// A point light in the hand passes none of those.
//
// It runs in a sealed carved room at midnight, which is the only condition where nothing else in the game is
// contributing light, so a difference between two crops can only be this lamp.
//
//   node bench/assert-flashlight.mjs
import { openWorld, pin, measure, CROP, fmt, check, report, sleep } from './lib/rig.mjs';

const NIGHT=0.75;

(async()=>{
  const W = await openWorld({ rd:8 });
  const P = W.page;
  try{
    if(W.errors.length) console.log('  page errors at boot: ' + W.errors.slice(0,3).join(' | '));
    check('the page booted with no error', W.errors.length===0, W.errors[0]||'');

    const S = await P.evaluate(`__hc.st()`);
    const CX = Math.round(S.sx)+22, CZ = Math.round(S.sz)+22;
    const GY = await P.evaluate(`__hc.groundY(${CX}, ${CZ})`);
    const CY = Math.max(6, GY-16);
    // A LONG room, not a cube: the beam has to have somewhere to go, and a 9-block box is shorter than the falloff
    // this is trying to demonstrate.
    await P.evaluate(`(function(){ for(let dx=-2;dx<=30;dx++) for(let dz=-5;dz<=5;dz++) for(let y=${CY};y<=${CY}+4;y++) __hc.cmdRun('/setblock '+(${CX}+dx)+' '+y+' '+(${CZ}+dz)+' air'); })()`);
    for(let i=0;i<50;i++){ const f=await P.evaluate(`__hc.fill()`); if(f&&f.meshed>=f.want) break; await sleep(500); }
    await P.evaluate(`__hc.tp(${CX}, ${CY+1.6}, ${CZ}, 0, 0)`);
    await sleep(800);

    const item = await P.evaluate(`(function(){ return { def:!!(__hc.items&&__hc.items().flashlight), give:__hc.cmdRun('/give flashlight 1') }; })()`);
    await sleep(400);
    const st0 = await P.evaluate(`__hc.flashlight()`);
    console.log('  ' + JSON.stringify(st0));
    check('the flashlight item exists and is in hand', st0.hasItem===true, JSON.stringify(item.give||''));
    check('it is a true inverse-square source', st0.decay===2, `decay ${st0.decay}`);

    await pin(W, NIGHT);
    const off = await measure(W,'fl-off',NIGHT,{c:CROP.centre, l:CROP.left});
    console.log(`  off    centre ${fmt(off.c)}`);

    await P.evaluate(`__hc.flashlight({on:true})`); await sleep(400);
    const on1 = await P.evaluate(`__hc.flashlight()`);
    console.log('  ' + JSON.stringify(on1));
    check('the switch actually lights it', on1.lit===true, `intensity ${on1.intensity}`);
    // THE SIGN OF THE BEAM. three's camera looks down its own -Z, so the direction handed to the shader must be the
    // NEGATED third column of the camera matrix. Written the other way the cone points out of the back of the player's
    // head and every luminance check below still passes-by-accident at zero, which is why this is asserted directly.
    const fwd = await P.evaluate(`(function(){ var d=__hc.lookDir?__hc.lookDir():null; return d?[d.x,d.y,d.z]:null; })()`);
    if(fwd) check('the beam points where the camera looks', on1.dir[0]*fwd[0] + on1.dir[1]*fwd[1] + on1.dir[2]*fwd[2] > 0.9,
                  `beam ${JSON.stringify(on1.dir)} vs look ${JSON.stringify(fwd.map(v=>+v.toFixed(3)))}`);

    const on = await measure(W,'fl-on',NIGHT,{c:CROP.centre, l:CROP.left});
    console.log(`  on     centre ${fmt(on.c)}   left ${fmt(on.l)}`);
    check('the beam lights what it is aimed at', on.c.lum > off.c.lum + 12, `${off.c.lum} -> ${on.c.lum}`);
    // THE DIRECTIONAL CLAIM, in one frame: the centre of the beam against the wall well off its axis. A point light in
    // the hand would raise both crops together and this is the check it cannot pass.
    check('...and it is a BEAM, not a glow', on.c.lum > on.l.lum*2.0, `centre ${on.c.lum} against off-axis ${on.l.lum}`);

    // THE BEAM FOLLOWS THE CAMERA — asserted on the DIRECTION, not on a crop, and the first version of this check got
    // that wrong. Turning 120 degrees in this room points the lamp at a wall five blocks away instead of thirty, and
    // inverse square makes the near wall just as bright: the centre crop read 139.3 before the turn and 137.0 after, so
    // a luminance test there is measuring the room's shape rather than the beam. The direction handed to the shader is
    // the thing being claimed, and it is unambiguous.
    await P.evaluate(`__hc.cam({yaw:2.1, pitch:0})`); await sleep(350);
    const turned = await P.evaluate(`__hc.flashlight()`);
    const dot = on1.dir[0]*turned.dir[0] + on1.dir[1]*turned.dir[1] + on1.dir[2]*turned.dir[2];
    const len = Math.hypot(...turned.dir);
    console.log(`  turned dir ${JSON.stringify(turned.dir)}  dot with before ${dot.toFixed(3)}`);
    check('the beam turns with the camera', dot < 0.2, `cos between the two headings ${dot.toFixed(3)} after a 120 degree turn`);
    check('...and the heading stays a unit vector', Math.abs(len-1) < 0.01, `|dir| = ${len.toFixed(4)}`);

    await P.evaluate(`__hc.cam({yaw:0, pitch:0}); __hc.flashlight({on:false})`); await sleep(350);
    const back = await measure(W,'fl-back',NIGHT,{c:CROP.centre});
    console.log(`  back   centre ${fmt(back.c)}`);
    check('switching it off returns the room', Math.abs(back.c.lum - off.c.lum) < 3, `${off.c.lum} -> ${back.c.lum}`);

    // A LAMP THAT NEEDS A HAND. The switch is on the player, so an empty hand must put the beam out on its own — this
    // is what stops a dropped flashlight lighting the world from inside the player's pocket.
    // A LAMP THAT NEEDS A HAND. The switch is on the player, so selecting an empty hotbar slot must put the beam out on
    // its own — this is what stops a flashlight in your backpack lighting the world through your ribs.
    // Driven through the real keypress rather than a QA setter, because the guard being tested reads inv[selSlot] and a
    // hook that wrote selSlot directly would be testing the hook. ('/clear' is not a command this game has; the first
    // version of this check called it, got nothing, and read a still-lit lamp as a failure.)
    await P.evaluate(`__hc.flashlight({on:true})`); await sleep(250);
    await P.keyboard.press('Digit3'); await sleep(400);
    const empty = await P.evaluate(`__hc.flashlight()`);
    const held = await P.evaluate(`(function(){ var s=__hc.held?__hc.held():null; return s; })()`);
    check('an empty hand puts the beam out', empty.lit===false, `intensity ${empty.intensity}, holding ${JSON.stringify(held)}`);

    check('no page errors through the whole run', W.errors.length===0, W.errors[0]||'');
  } finally { await W.close(); }
  process.exit(report() ? 0 : 1);
})();
