# EXPORT A .blend TO GLB, HEADLESS AND REPEATABLE. Nothing in this game can load a .blend — it is a proprietary binary and
# parsing it is a dead end — so every character asset comes through Blender once. Making that a script rather than a manual
# export is the difference between the next model costing one command and costing an afternoon.
#
# THE EXPORT SUCCEEDING IS NOT THE THING TO CHECK. A body with no armature exports perfectly happily and is useless: it can be
# stood in the world and never animated. So this REPORTS what it actually wrote — meshes, armatures, bones, whether any skin
# weights survived, and how many actions came with it. "It exported successfully" is exactly the shape of green that has
# misled this project all day.
#
# WHAT IT DROPS, and why by name rather than by hand afterwards: scene furniture that is not the character (lights, the
# default Plane and Suzanne that ship in half the .blend files on the internet), and anything listed in --drop. Ben: "get rid
# of all of her clothes as well" — the clothing is separate objects with their own materials, so excluding them at export is
# one flag, where deleting geometry afterwards is a modelling job that has to be redone for every new version of the model.
#
#   M:\blender.exe "<file>.blend" --background --python scripts/blend-to-glb.py -- <out.glb> [--drop name,name,...]
import bpy, sys, os, json

argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
out  = argv[0] if argv else 'out.glb'
drop = set()
if '--drop' in argv:
    drop = {n.strip().lower() for n in argv[argv.index('--drop')+1].split(',') if n.strip()}
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)

JUNK = {'plane', 'suzanne', 'lighting'}
removed = []
for o in list(bpy.data.objects):
    n = o.name.lower()
    if o.type in ('LIGHT', 'CAMERA') or n in JUNK or n in drop or any(n.startswith(d) for d in drop):
        removed.append(o.name)
        bpy.data.objects.remove(o, do_unlink=True)

# LINK EVERYTHING SURVIVING INTO THE SCENE FIRST. This file keeps four of its twenty-four objects out of the view layer —
# hair1 among them — and an unlinked object is invisible to both the decimator and the exporter, so it would silently ship
# undecimated or not at all. Blender raised "ViewLayer does not contain object 'hair1'" rather than skipping it, which is the
# better failure and worth keeping the fix small enough not to hide.
_root = bpy.context.scene.collection
for o in list(bpy.data.objects):
    if o.name not in bpy.context.view_layer.objects:
        try: _root.objects.link(o)
        except Exception: pass

# DECIMATE, BECAUSE THIS IS A FILM ASSET IN A BROWSER. The fox girl is 615k triangles with the clothes already off, which is
# ten to twenty times what a game character carries — and the cost is not only the frame, it is a 24 MB download before anyone
# sees a pixel. The collapse decimator keeps the silhouette and the UVs, which is what survives being looked at; what it
# spends is density nobody can resolve at gameplay distance. Ratio is a flag so the number is a decision, not a default.
if '--decimate' in argv:
    ratio = float(argv[argv.index('--decimate')+1])
    for o in [x for x in bpy.data.objects if x.type == 'MESH']:
        # EYES, TEETH AND LASHES ARE ALREADY SMALL AND ARE READ CLOSE UP. Decimating a 2k-triangle eye saves nothing and
        # turns a sphere into a facet; the budget is in the body and the hair and nowhere else.
        if len(o.data.polygons) < 8000: continue
        m = o.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = ratio
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=m.name)

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
arms   = [o for o in bpy.data.objects if o.type == 'ARMATURE']
info = {
    'kept':      sorted(o.name for o in meshes),
    'removed':   sorted(removed),
    'armatures': len(arms),
    'bones':     sum(len(a.data.bones) for a in arms),
    'actions':   len(bpy.data.actions),
    'tris':      sum(len(m.data.polygons) for m in meshes),
    # SKIN WEIGHTS ARE A PROPERTY OF THE MESH, NOT OF THE ARMATURE, and the two exist independently: a rig beside an
    # unweighted body exports as both and animates neither. An Armature modifier whose object is None is the signature of a
    # rig that was stripped before the file was published, which is exactly what this asset turned out to be.
    'skinned':   sum(1 for m in meshes if any(md.type == 'ARMATURE' and md.object for md in m.modifiers) and len(m.vertex_groups) > 0),
    'danglingArmatureMods': sorted(m.name for m in meshes if any(md.type == 'ARMATURE' and not md.object for md in m.modifiers)),
    'materials': sorted({s.material.name for m in meshes for s in m.material_slots if s.material}),
}

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    use_selection=False,
    export_apply=False,          # NOT True: applying modifiers destroys the Armature modifier and with it any skin
    export_skins=True,
    export_animations=True,
    export_yup=True,             # three.js is Y-up, Blender is Z-up; a character lying on her face is this flag
    export_materials='EXPORT',
    export_image_format='NONE',  # the film-resolution PNGs are downsampled separately and bound in code
)
info['bytes'] = os.path.getsize(out) if os.path.exists(out) else 0
info['out'] = out
print('BLEND2GLB ' + json.dumps(info))
if info['armatures'] == 0:
    print('BLEND2GLB NOTE: no armature in this file — the export is a STATUE. Anything that has to move it must bring its own rig.')
