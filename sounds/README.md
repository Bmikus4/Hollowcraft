# HOLLOWCRAFT — sound library

**~50 SFX variants + an 80s music track ship generated** (synthesized offline via `gen-sfx.js`
+ ffmpeg — no copyrighted audio). The game loads them automatically. They're *synthesized*,
not recordings — replace any file with a same-named `.ogg` (or `.wav`) to use real audio, or
delete a file to fall back to the built-in procedural synth. Empty folder = still playable.

## Loading model
The loader reads **base names with numbered variants**; `playSample('grass', …)` picks one of
`grass1.ogg`/`grass2.ogg`/`grass3.ogg` at random. Counts (see `SFX_COUNTS` in `index.html`):

| base | n | plays when |
|------|---|------------|
| grass / stone / wood / sand / water | 3 each | footsteps (per material; water = splash too) |
| break_wood / break_stone / break_leaves | 2 each | mining that block family |
| drip | 3 | underground water drips (with a visual droplet) |
| wind / creak / branch | 2 each | outdoor ambience (gusts / groaning trees / snapping wood) |
| owl / crow / bird | 2 each | night owls & crows / daytime birdsong |
| sheep / deer | 1 each | (reserved for animal calls) |
| growl / shriek / clicks / call | 2 each | the Wretch's voice (growl / scream / sub-vocal clicks / distant call) |
| hurt | 2 | an animal is hit |
| thunder | 2 | lightning |
| `music.ogg` | 1 | looping dread bed, rises with menace |

## Regenerate / swap
- Regenerate all: `node gen-sfx.js .` then encode each `.wav` with
  `ffmpeg -i x.wav -c:a libvorbis -q:a 4 x.ogg`. Edit `gen-sfx.js` to tune the DSP.
- Real recordings: name them per the table (e.g. `thunder1.ogg`) and drop them here. Use CC0
  clips (freesound.org → License: Creative Commons 0) or your own — **not** Minecraft's
  copyrighted audio. Server also serves `.wav/.mp3/.m4a/.flac`.
