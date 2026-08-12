// Import the Desktop model pack into assets/models/{guns,tools,pots,misc}/ under kebab-case names,
// then write assets/models/manifest.json (category, textures, bbox) from the GLB JSON chunks.
// The loose folder is a subset of the three zips, so the union is imported: same provenance, and a
// zip-only model (wood log, water bottle, matchbox) is a cleaner replacement than anything loose.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { summarize } from './glbinfo.mjs';

const SRC = 'C:/Users/thera/Desktop/Hollowcraft Models + Instructions';
// A second drop, given later: the six gun attachments. Same shape of asset, its own category because an
// attachment is not a gun — it is a thing that mounts to one, and the attachment system reads this folder.
const SRC_ATT = 'C:/Users/thera/Desktop/Attatchments';
// Two models were dropped loose on the Desktop rather than into either folder, so they are named one by
// one: scanning the Desktop would sweep up every unrelated GLB and trip the UNSORTED guard below.
const SRC_LOOSE = ['C:/Users/thera/Desktop/Foregrip by Pichuliru - yGxkn9quFx.glb'];
const DST = 'D:/Code/Minecraft/assets/models';
const TMP = process.env.TEMP + '/hc-model-import';

// name → [category, kebab name]. Every model in the pack is listed: the sort is a decision per file,
// not a regex guess, and an unlisted file is an error rather than a silent misfile.
const MAP = {
  // --- guns and the things that bolt onto them ---
  'Assault Rifle.glb':                'guns/assault-rifle',
  'Assault Rifle-Bgvuu4CUMV.glb':     'guns/assault-rifle-bullpup-carbine',
  'Assault Rifle-fpLucho45C.glb':     'guns/assault-rifle-wood',
  'Bullpup.glb':                      'guns/bullpup',
  'Pistol.glb':                       'guns/pistol',
  'Pistol-52kQzphmeF.glb':            'guns/pistol-heavy',
  'Pistol-J3i9KDQ3kt.glb':            'guns/pistol-compact',
  'Pistol-Z7aOjJu583.glb':            'guns/pistol-wood',
  'Revolver.glb':                     'guns/revolver',
  'Revolver-9C26wSpMS0.glb':          'guns/revolver-wood-grip',
  'Revolver-XrnLUz6kQj.glb':          'guns/revolver-snub',
  'Shotgun.glb':                      'guns/shotgun',
  'Shotgun-ZmPTnh7njL.glb':           'guns/shotgun-long',
  'Shotgun Sawed Off.glb':            'guns/shotgun-sawed-off',
  'Shotgun Short Stock.glb':          'guns/shotgun-short-stock',
  'Sniper Rifle.glb':                 'guns/sniper-rifle',
  'Sniper Rifle-ASOMZIErq3.glb':      'guns/sniper-rifle-green',
  'Sniper Rifle-TKaBjAEofL.glb':      'guns/sniper-rifle-long',
  'Sniper Rifle-i65hEldsw6.glb':      'guns/sniper-rifle-bipod',
  'Submachine Gun.glb':               'guns/submachine-gun',
  'Submachine Gun-nsP3JukU73.glb':    'guns/submachine-gun-folded',
  'Flare Gun.glb':                    'guns/flare-gun',
  'Scope.glb':                        'guns/scope',
  'Bipod.glb':                        'guns/bipod',
  'Foregrip by Pichuliru - yGxkn9quFx.glb': 'attachments/foregrip',
  'Tripod.glb':                       'guns/tripod',
  'Bayonet.glb':                      'guns/bayonet',
  // --- attachments (Ben's second drop) ---
  'Scope by Pichuliru - 1QxV2Mk5l4.glb':                'attachments/scope',
  'Holographic by Pichuliru - UHEJDoCrcf.glb':          'attachments/holographic',
  'Red Dot by Pichuliru - WYL5bcaqr5.glb':              'attachments/red-dot',
  'Laser by Pichuliru - h2P7oQ8RVg.glb':                'attachments/laser',
  'Flashlight Attachment by Pichuliru - 278wXvuvVh.glb':'attachments/weapon-light',
  'Suppressor by Pichuliru - VLiLj3j1tS.glb':           'attachments/suppressor',
  // --- tools: held, used, carried ---
  'Axe.glb':                          'tools/axe',
  'Pickaxe by CreativeTrio - cJp88qPPLc.glb': 'tools/pickaxe',
  'Shovel.glb':                       'tools/shovel',
  'Knife.glb':                        'tools/knife',
  'Compass.glb':                      'tools/compass',
  'Radio.glb':                        'tools/radio',
  'Torch.glb':                        'tools/flashlight',
  'Wooden Torch.glb':                 'tools/wooden-torch',
  'First Aid Kit.glb':                'tools/first-aid-kit',
  'First Aid Kit-wP00rePSRD.glb':     'tools/first-aid-kit-hard',
  'Gas Can.glb':                      'tools/gas-can',
  'Propane Tank.glb':                 'tools/propane-tank',
  'Raft Paddle.glb':                  'tools/raft-paddle',
  'Match.glb':                        'tools/match',
  'Match Burnt.glb':                  'tools/match-burnt',
  'Matchbox.glb':                     'tools/matchbox',
  'Battery.glb':                      'tools/battery',
  'Battery-MYa3uWdwPU.glb':           'tools/battery-aa',
  'Phone.glb':                        'tools/phone',
  'Bear Trap.glb':                    'tools/bear-trap',
  'Chopsticks.glb':                   'tools/chopsticks',
  'Spoon.glb':                        'tools/spoon',
  // --- pots and pans ---
  'Pot.glb':                          'pots/pot',
  'Pot-fyweVKYu0K.glb':               'pots/pot-shallow',
  'Cooking Pot.glb':                  'pots/cooking-pot',
  'Cooking Pot-lMEdEOMg9L.glb':       'pots/cooking-pot-lid',
  'Pan.glb':                          'pots/pan',
  'Frying Pan.glb':                   'pots/frying-pan',
  'Plate Square.glb':                 'pots/plate-square',
  // --- everything else: food, containers, worn gear, structures ---
  'Apple Green.glb':                  'misc/apple',
  'Avocado.glb':                      'misc/avocado',
  'Bacon.glb':                        'misc/bacon',
  'Banana.glb':                       'misc/banana',
  'Bottle.glb':                       'misc/bottle',
  'Bottle-Pc8dM9Ja4V.glb':            'misc/bottle-red',
  'Water Bottle.glb':                 'misc/water-bottle',
  'Soda.glb':                         'misc/soda',
  'Ketchup Bottle.glb':               'misc/ketchup-bottle',
  'Bread.glb':                        'misc/bread',
  'Bread Slice.glb':                  'misc/bread-slice',
  'Broccoli.glb':                     'misc/broccoli',
  'Burger.glb':                       'misc/burger',
  'Cheeseburger.glb':                 'misc/cheeseburger',
  'Double Cheeseburger.glb':          'misc/cheeseburger-double',
  'Carrot.glb':                       'misc/carrot',
  'Chicken Leg.glb':                  'misc/chicken-leg',
  'Chocolate Bar.glb':                'misc/chocolate-bar',
  'Corndog.glb':                      'misc/corndog',
  'Croissant.glb':                    'misc/croissant',
  'Cupcake.glb':                      'misc/cupcake',
  'Donut.glb':                        'misc/donut',
  'Egg.glb':                          'misc/egg',
  'Egg Fried.glb':                    'misc/egg-fried',
  'Eggplant.glb':                     'misc/eggplant',
  'Fries.glb':                        'misc/fries',
  'Hotdog.glb':                       'misc/hotdog',
  'Ice Cream.glb':                    'misc/ice-cream',
  'Lettuce.glb':                      'misc/lettuce',
  'Mushroom Sliced.glb':              'misc/mushroom-sliced',
  'Pancakes Stack.glb':               'misc/pancakes',
  'Pepper Green.glb':                 'misc/pepper-green',
  'Pizza.glb':                        'misc/pizza',
  'Pizza Slice.glb':                  'misc/pizza-slice',
  'Popsicle.glb':                     'misc/popsicle',
  'Popsicle Chocolate.glb':           'misc/popsicle-chocolate',
  'Pumpkin.glb':                      'misc/pumpkin',
  'Steak.glb':                        'misc/steak',
  'Sushi.glb':                        'misc/sushi',
  'Sushi Nigiri.glb':                 'misc/sushi-nigiri',
  'Tomato.glb':                       'misc/tomato',
  'Tomato Slice.glb':                 'misc/tomato-slice',
  'Turnip.glb':                       'misc/turnip',
  'Waffle.glb':                       'misc/waffle',
  'Tentacle.glb':                     'misc/tentacle',
  'Backpack.glb':                     'misc/alice-pack',
  'Armor Leather by Quaternius - na9KfWiKN8.glb': 'misc/armor-leather',
  'Armor Metal by Quaternius - TMUoxILh9w.glb':   'misc/armor-metal',
  'Tent.glb':                         'misc/tent',
  'Raft.glb':                         'misc/raft',
  'Dock Long by Quaternius - bN9Oz3niNm.glb':     'misc/dock-long',
  'Bonfire.glb':                      'misc/bonfire',
  'Wood Log.glb':                     'misc/wood-log',
  'Can.glb':                          'misc/can',
  'Can Red.glb':                      'misc/can-red',
  'Can Broken.glb':                   'misc/can-broken',
};

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
// unzip the three packs into one scratch pool; the loose files win ties (identical bytes either way)
for (const z of fs.readdirSync(SRC).filter(f => f.endsWith('.zip')))
  execFileSync('powershell', ['-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${SRC}/${z}' -DestinationPath '${TMP}' -Force`]);
for (const f of fs.readdirSync(SRC).filter(f => f.toLowerCase().endsWith('.glb')))
  fs.copyFileSync(path.join(SRC, f), path.join(TMP, f));
if (fs.existsSync(SRC_ATT)) for (const f of fs.readdirSync(SRC_ATT).filter(f => f.toLowerCase().endsWith('.glb')))
  fs.copyFileSync(path.join(SRC_ATT, f), path.join(TMP, f));
for (const f of SRC_LOOSE) if (fs.existsSync(f)) fs.copyFileSync(f, path.join(TMP, path.basename(f)));

const pool = fs.readdirSync(TMP).filter(f => f.toLowerCase().endsWith('.glb'));
const unmapped = pool.filter(f => !MAP[f]);
if (unmapped.length) { console.error('UNSORTED:', unmapped); process.exit(1); }

for (const c of ['guns', 'tools', 'pots', 'misc', 'attachments']) fs.mkdirSync(path.join(DST, c), { recursive: true });
const manifest = [];
for (const f of pool.sort()) {
  const id = MAP[f], out = path.join(DST, id + '.glb');
  fs.copyFileSync(path.join(TMP, f), out);
  const s = summarize(out);
  manifest.push({
    id, source: f, path: 'assets/models/' + id + '.glb', category: id.split('/')[0],
    textures: s.images > 0, materials: s.materials.map(m => m.name), tris: s.tris, prims: s.prims,
    bytes: s.bytes, bbox: s.bbox,
  });
  console.log(id.padEnd(34), '<-', f);
}
fs.writeFileSync(path.join(DST, 'manifest.json'), JSON.stringify({
  note: 'Generated by tools/models/import-models.mjs. Bounding boxes are in the GLB\'s own units (Blender metres, ~5 per gun) and every model is untextured vertex-colour geometry — see textures:false.',
  count: manifest.length, models: manifest,
}, null, 1) + '\n');
console.log('\n' + manifest.length + ' models,',
  manifest.filter(m => m.textures).length, 'textured,',
  ['guns', 'tools', 'pots', 'misc', 'attachments'].map(c => c + ':' + manifest.filter(m => m.category === c).length).join(' '));
