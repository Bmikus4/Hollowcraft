// THE 52 APPENDED BLOCKS TAKE THEIR PACK TEXTURES. Run when the pack changes:
//   node tools/pack-52.mjs          -> assets/blocks/<ourname>.png for every mapped row
//   node tools/pack-52.mjs --list   -> print the table without writing anything
//
// f13c755 appended ids 184-235 and painted 52 procedural tiles for them; the pixels never followed, which is Ben's
// "none of the new 52 blocks have their hd textures". This is the same fault the 43 had — the table was treated as the
// deliverable and the pixels were not.
//
// NO DECODING HAPPENS HERE. Unlike tools/pack-grass.mjs, none of these needs a tint, so each row is a byte-for-byte
// copy of the zip entry. That matters for the glass rows in particular: they carry alpha, and a copy cannot lose it.
//
// A ROW IS A JUDGEMENT AND IT SAYS SO. `exact` means the pack ships the same block; `sub` means the pack has no such
// block and this is the nearest thing that reads right, which is a look call Ben can overrule one line at a time.
// Four of the 52 have NO honest match and keep their painter rather than wearing something that is not them — listed
// at the bottom, because a silent omission here is exactly what produced this complaint.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ZIP = 'D:/Content/Desktop-Assets/ModernArch v3.0.6 [26.2] [128x].zip';
const OUT = path.resolve(process.argv[1], '..', '..', 'assets', 'blocks');
const P = 'assets/minecraft/textures/block/';

// ours                 pack texture              kind    why, when it is not obvious
const MAP = [
  ['bricks',              'bricks',                'exact'],
  ['pale_bricks',         'quartz_bricks',         'sub',  'the pack has no pale clay brick; quartz brick is the same bond in white'],
  ['mossy_bricks',        'mossy_stone_bricks',    'sub',  'moss over a brick bond, which is the whole of what this block is'],
  ['cracked_bricks',      'mud_bricks',            'sub',  'no cracked CLAY brick in the pack; mud brick is the crumbling warm one'],
  ['soot_bricks',         'nether_bricks',         'sub',  'dark, sooted brick — nether brick is the pack\'s blackened bond'],
  ['tinted_glass',        'tinted_glass',          'exact'],
  ['frosted_glass',       'white_stained_glass',   'sub',  'the pack has no frosted pane; white stained is the translucent white'],
  ['smooth_stone',        'smooth_stone',          'exact'],
  ['stone_bricks',        'stone_bricks',          'exact'],
  ['cracked_stone_bricks','cracked_stone_bricks',  'exact'],
  ['chiselled_stone',     'chiseled_stone_bricks', 'exact', 'their spelling, ours is the British one'],
  ['slate',               'deepslate',             'exact', 'deepslate IS slate; the name is Minecraft\'s, not the material\'s'],
  ['slate_tile',          'deepslate_tiles',       'exact'],
  ['granite',             'granite',               'exact'],
  ['marble',              'calcite',               'sub',  'no marble in the pack; calcite is the white crystalline stone'],
  ['dark_planks',         'dark_oak_planks',       'exact'],
  ['weathered_planks',    'spruce_planks',         'sub',  'spruce is the pack\'s grey-brown weathered board'],
  ['parquet',             'bamboo_mosaic',         'sub',  'the only laid-pattern floor board the pack ships'],
  ['plywood',             'birch_planks',          'sub',  'pale, flat, no grain to speak of — which is plywood'],
  ['stripped_log',        'stripped_oak_log',      'exact'],
  ['driftwood',           'stripped_pale_oak_log', 'sub',  'sun-bleached pale timber'],
  ['charred_wood',        'polished_basalt_side',  'sub',  'no charred timber; polished basalt is the black column grain'],
  ['steel_panel',         'iron_block',            'sub',  'flat sheet steel'],
  ['corrugated_metal',    'iron_trapdoor',         'sub',  'the pack\'s only ribbed metal face'],
  ['copper_sheet',        'copper_block',          'exact'],
  ['verdigris_copper',    'oxidized_copper',       'exact', 'verdigris IS oxidised copper'],
  ['riveted_iron',        'raw_iron_block',        'sub',  'lumpen iron with proud bosses, which is what reads as rivets'],
  ['brass',               'exposed_copper',        'sub',  'no brass; part-oxidised copper is the warm yellow metal'],
  ['asphalt',             'black_concrete',        'sub'],
  ['kerb_stone',          'gray_concrete',         'sub'],
  ['breeze_block',        'white_concrete',        'sub',  'the perforation is the block\'s geometry, not its texture'],
  ['plaster',             'white_terracotta',      'sub',  'flat, slightly warm white render'],
  ['cracked_plaster',     'light_gray_terracotta', 'sub'],
  ['tiles_white',         'quartz_block_side',     'sub',  'white tile'],
  ['terrazzo',            'polished_diorite',      'sub',  'polished stone with a speckled aggregate, which is terrazzo'],
  ['ash_block',           'gray_concrete_powder',  'sub',  'a powder, not a solid — the right surface for ash'],
  ['bone_block',          'bone_block_side',       'exact'],
  ['tar',                 'coal_block',            'sub',  'black and glossy'],
  ['salt_block',          'white_concrete_powder', 'sub',  'white crystalline powder'],
  ['fungus_block',        'brown_mushroom_block',  'exact'],
  ['root_mass',           'mangrove_roots',        'exact'],
  ['grave_soil',          'coarse_dirt',           'sub',  'turned, stony soil'],
  ['canvas',              'light_gray_wool',       'sub',  'woven, undyed'],
  ['burlap',              'brown_wool',            'sub',  'coarse woven brown'],
  ['carpet_red',          'red_wool',              'exact'],
  ['crate_side',          'barrel_side',           'sub',  'slatted timber container side'],
  ['shelf_boards',        'oak_planks',            'sub'],
  ['scaffold_board',      'scaffolding_side',      'exact'],
];

// NO HONEST MATCH — these keep their procedural painter, and that is a decision rather than an oversight:
//   herringbone_brick  the pack lays every brick in a running bond; the herringbone IS this block
//   wired_glass        no wired/meshed pane in the pack, and the mesh is the whole point of the block
//   cracked_glass      no cracked pane
//   diamond_plate      no tread plate
const KEEP = ['herringbone_brick','wired_glass','cracked_glass','diamond_plate'];

function zipEntries(file){
  const b = fs.readFileSync(file);
  let eocd=-1; for(let i=b.length-22;i>=0;i--) if(b.readUInt32LE(i)===0x06054b50){ eocd=i; break; }
  if(eocd<0) throw new Error('not a zip');
  const n=b.readUInt16LE(eocd+10); let off=b.readUInt32LE(eocd+16);
  const map=new Map();
  for(let k=0;k<n;k++){
    const nameLen=b.readUInt16LE(off+28), extLen=b.readUInt16LE(off+30), cmtLen=b.readUInt16LE(off+32);
    map.set(b.toString('latin1', off+46, off+46+nameLen), {lho:b.readUInt32LE(off+42), method:b.readUInt16LE(off+10), csize:b.readUInt32LE(off+20)});
    off += 46+nameLen+extLen+cmtLen;
  }
  return {b, map};
}
function read({b,map}, name){
  const e=map.get(name); if(!e) return null;
  const lNameLen=b.readUInt16LE(e.lho+26), lExtLen=b.readUInt16LE(e.lho+28);
  const start=e.lho+30+lNameLen+lExtLen, raw=b.subarray(start, start+e.csize);
  return e.method===0 ? raw : zlib.inflateRawSync(raw);
}

const zip = zipEntries(ZIP);
if(process.argv.includes('--list')){
  for(const [ours,pack,kind,why] of MAP) console.log(kind.padEnd(6), ours.padEnd(21), pack.padEnd(24), why||'');
  console.log('\nkeeping their painter:', KEEP.join(' '));
  process.exit(0);
}
fs.mkdirSync(OUT,{recursive:true});
let wrote=0; const absent=[];
for(const [ours,pack] of MAP){
  const buf = read(zip, P+pack+'.png');
  if(!buf){ absent.push(ours+' <- '+pack); continue; }
  fs.writeFileSync(path.join(OUT, ours+'.png'), buf); wrote++;
}
console.log('wrote', wrote, 'of', MAP.length, 'to', OUT);
console.log('exact', MAP.filter(r=>r[2]==='exact').length, ' substituted', MAP.filter(r=>r[2]==='sub').length,
            ' keeping their painter', KEEP.length);
if(absent.length) console.log('NOT IN THE PACK (nothing written, tile keeps its painter):\n  '+absent.join('\n  '));
console.log('\nadd to _stampWant in index.html:\n  '+MAP.map(r=>"'"+r[0]+"'").join(','));
