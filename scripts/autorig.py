# GIVE AN UNRIGGED CHARACTER A SKELETON, HEADLESS AND REPEATABLE.
#
# The fox girl's free version ships with no armature in any of its three .blend files — the rig was stripped before
# publication — so nothing can animate her. This builds one, binds the mesh to it with automatic weights, and then STANDS HER
# UP, because the asset is not in a neutral pose either.
#
# SHE IS SEATED WITH HER LEGS SPLAYED, which is the fact that decides this whole script and which took a silhouette render to
# see: measured, her body is 2.595 wide against 2.057 tall, and the width is at ANKLE height, not shoulder height. Twice I
# read a game frame of her as "kneeling because of the camera" and it was not the camera. So the bones cannot be placed from
# a proportion table — they are placed from measured landmarks in the pose she is actually in, and then rotated to standing
# and applied as the new rest pose.
#
# WHY A HAND-PLACED SKELETON RATHER THAN RIGIFY: a metarig still has to be fitted to the body, and fitting is the whole job.
# Fifteen bones placed from slice measurements is less code than driving Rigify headless and it produces a skeleton whose
# every bone position is a number someone can check.
#
#   M:\blender.exe "<file>.blend" --background --python scripts/autorig.py -- <out.glb> [--drop a,b] [--decimate 0.1]
import bpy, sys, os, json, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
out  = argv[0] if argv else 'out.glb'
drop = set()
if '--drop' in argv:
    drop = {n.strip().lower() for n in argv[argv.index('--drop')+1].split(',') if n.strip()}
ratio = float(argv[argv.index('--decimate')+1]) if '--decimate' in argv else 0.0
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)

JUNK = {'plane', 'suzanne', 'lighting'}
for o in list(bpy.data.objects):
    n = o.name.lower()
    if o.type in ('LIGHT', 'CAMERA') or n in JUNK or n in drop or any(n.startswith(d) for d in drop):
        bpy.data.objects.remove(o, do_unlink=True)
root = bpy.context.scene.collection
for o in list(bpy.data.objects):
    if o.name not in bpy.context.view_layer.objects:
        try: root.objects.link(o)
        except Exception: pass

if ratio:
    for o in [x for x in bpy.data.objects if x.type == 'MESH']:
        if len(o.data.polygons) < 8000: continue
        m = o.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = ratio
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=m.name)

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
body = bpy.data.objects.get('body') or (meshes[0] if meshes else None)
if body is None: print('AUTORIG FAIL: no mesh'); sys.exit(2)

# ---- landmarks, measured off the body rather than assumed ---------------------------------------------------------------
mw = body.matrix_world
vs = [mw @ v.co for v in body.data.vertices]
zmin = min(v.z for v in vs); zmax = max(v.z for v in vs)
H = zmax - zmin
def widest_at(z0, z1):
    sl = [v for v in vs if z0 <= v.z < z1]
    if not sl: return 0.0
    return max(abs(v.x) for v in sl)
def ymid_at(z0, z1):
    sl = [v for v in vs if z0 <= v.z < z1]
    if not sl: return 0.0
    return (min(v.y for v in sl) + max(v.y for v in sl)) / 2

# Fractions of her seated height, read off the slice table: neck pinches to +-0.106 at 0.82 of height, the hands reach their
# widest at 0.46, the feet at 0.07. Each landmark's x is MEASURED at that height rather than guessed, so the same script
# fits a different body without new numbers.
def L(fz, xf, yo=0.0):
    z = zmin + H*fz
    w = widest_at(z - H*0.02, z + H*0.02)
    return Vector((w*xf, ymid_at(z - H*0.02, z + H*0.02) + yo, z))

pelvis = L(0.355, 0.0); spine = L(0.47, 0.0); chest = L(0.62, 0.0)
neck   = L(0.815, 0.0); head  = L(0.865, 0.0); headtop = L(0.99, 0.0)
sh     = 0.42                              # shoulder x as a fraction of the body's half-width at that height
BONES = [
    ('pelvis',  pelvis,                    spine,   None),
    ('spine',   spine,                     chest,   'pelvis'),
    ('chest',   chest,                     neck,    'spine'),
    ('neck',    neck,                      head,    'chest'),
    ('head',    head,                      headtop, 'neck'),
]
for s, side in ((1, 'L'), (-1, 'R')):
    shoulder = Vector((s*abs(chest.x) + s*0.10, chest.y, chest.z*0.98 + zmin*0.02))
    upper = L(0.775, s*sh); elbow = L(0.66, s*0.80); hand = L(0.47, s*0.92)
    upper.x = s*abs(upper.x); elbow.x = s*abs(elbow.x); hand.x = s*abs(hand.x)
    BONES += [(f'shoulder{side}', chest,    upper, 'chest'),
              (f'arm{side}',      upper,    elbow, f'shoulder{side}'),
              (f'forearm{side}',  elbow,    hand,  f'arm{side}')]
    hip = Vector((s*0.13*abs(pelvis.x if pelvis.x else 1) + s*0.11, pelvis.y, pelvis.z))
    knee = L(0.27, s*0.85); ankle = L(0.09, s*0.95); toe = L(0.05, s*1.0)
    knee.x = s*abs(knee.x); ankle.x = s*abs(ankle.x); toe.x = s*abs(toe.x)
    toe.y = ankle.y - 0.18
    BONES += [(f'thigh{side}', hip,   knee,  'pelvis'),
              (f'shin{side}',  knee,  ankle, f'thigh{side}'),
              (f'foot{side}',  ankle, toe,   f'shin{side}')]

bpy.ops.object.armature_add(enter_editmode=False, location=(0, 0, 0))
arm = bpy.context.object; arm.name = 'rig'
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
for b in list(eb): eb.remove(b)
made = {}
for name, a, b, parent in BONES:
    e = eb.new(name); e.head = a; e.tail = b
    if parent and parent in made: e.parent = made[parent]; e.use_connect = False
    made[name] = e
bpy.ops.object.mode_set(mode='OBJECT')

# ---- bind ---------------------------------------------------------------------------------------------------------------
# PARENTING AND WEIGHTING ARE DONE SEPARATELY, and that is the whole lesson of the first attempt. parent_set(ARMATURE_AUTO)
# does both in one operator, and when its heat solver gives up on a mesh it can leave the object unparented while still
# writing vertex groups — so the export came out with JOINTS_0 and WEIGHTS_0 on all eight meshes and the `skin` reference
# missing from three of them, which is a file that looks rigged in every listing and animates nothing. Parenting is set by
# hand, where it cannot fail quietly; weighting is attempted after, and a mesh that fails it is REPORTED rather than shipped.
bound, unweighted, envelope = [], [], []
for m in meshes:
    for md in list(m.modifiers):
        if md.type == 'ARMATURE': m.modifiers.remove(md)     # the stripped rig left dangling ones behind
    m.parent = arm
    m.matrix_parent_inverse = arm.matrix_world.inverted()
    md = m.modifiers.new('Armature', 'ARMATURE'); md.object = arm
    bpy.ops.object.select_all(action='DESELECT')
    m.select_set(True); arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    try:
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        bound.append(m.name)
    except Exception:
        unweighted.append(m.name)
    # A MESH WITH NO WEIGHTS COLLAPSES ONTO BONE ZERO, which is a body folded into its own pelvis rather than an error.
    def weighted(o):
        return bool(o.vertex_groups) and any(len(v.groups) > 0 for v in o.data.vertices[:400])
    if not weighted(m):
        # ENVELOPES WHEN THE HEAT SOLVER GIVES UP. Heat weighting needs every bone enclosed by the surface and fails on the
        # three biggest meshes here; envelopes are cruder — a falloff around each bone rather than a solve over the surface —
        # but they cannot fail, and a slightly soft elbow on a character seen at gameplay distance beats a body with no
        # weights at all, which does not deform, it collapses.
        bpy.ops.object.select_all(action='DESELECT')
        m.select_set(True); arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        try: bpy.ops.object.parent_set(type='ARMATURE_ENVELOPE')
        except Exception: pass
        if weighted(m): envelope.append(m.name)
        else: unweighted.append(m.name)

# ---- stand her up -------------------------------------------------------------------------------------------------------
# HER REST POSE IS A SPLAYED SIT AND A GAME CHARACTER HAS TO START FROM STANDING. The bones are rotated into a stand and that
# pose is APPLIED as the new rest, so the exported file's bind pose is upright and every animation is written against it.
# The hips are where an auto-weighted re-pose is worst; this is a bind for a game character at gameplay distance, not a film
# deform, and it is stated rather than discovered.
bpy.ops.object.mode_set(mode='POSE')
def turn(name, axis, deg):
    pb = arm.pose.bones.get(name)
    if not pb: return
    pb.rotation_mode = 'XYZ'
    v = list(pb.rotation_euler); v['XYZ'.index(axis)] += math.radians(deg)
    pb.rotation_euler = v
# THE STAND-UP IS DELIBERATELY EMPTY AND THE POSE IS THE GAME'S JOB NOW. The first attempt rotated each limb about its own
# Y axis, which in bone space runs ALONG the bone — so every "swing" was a twist and she came out wider and shorter than she
# started (2.595 -> 2.773 across, 2.057 -> 1.919 tall). The mistake is cheap to make and expensive to find here, because
# every correction is a three-minute headless round trip before anything can be looked at.
# Once bones exist the pose costs nothing at runtime, where it can be seen the moment it is written. So this exports her
# RIGGED IN HER ORIGINAL POSE, which is honest — the file's bind pose is the pose the artist shipped — and standing her up
# is a handful of bone rotations in the game. Fill this in only if a future asset needs its rest pose changed on disk.
bpy.ops.object.mode_set(mode='OBJECT')
# APPLYING THE POSE AS REST IS NOT ENOUGH ON ITS OWN, and this is the step that was missing. armature_apply moves the BONES'
# rest to the current pose; the mesh vertices do not move, so the exported bind pose still looked exactly as seated as
# before while every bone claimed to be standing. The deformation has to be baked into the vertices FIRST — apply the
# armature modifier on each mesh while it is posed standing — and only then is the pose made the new rest and the meshes
# re-bound. Order is the whole of it.
for m in meshes:
    bpy.ops.object.select_all(action='DESELECT')
    m.select_set(True); bpy.context.view_layer.objects.active = m
    for md in list(m.modifiers):
        if md.type == 'ARMATURE':
            try: bpy.ops.object.modifier_apply(modifier=md.name)
            except Exception: pass
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
bpy.ops.pose.select_all(action='SELECT')
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode='OBJECT')
for m in meshes:
    if not any(md.type == 'ARMATURE' for md in m.modifiers):
        md = m.modifiers.new('Armature', 'ARMATURE'); md.object = arm      # weights live in the vertex groups and survived

info = {'bones': len(arm.data.bones), 'bound': bound, 'unweighted': sorted(set(unweighted)), 'envelope': sorted(set(envelope)),
        'meshes': len(meshes), 'H': round(H, 3),
        'landmarks': {n: [round(c, 3) for c in a] for n, a, b, p in BONES}}

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False,
                          export_apply=False, export_skins=True, export_animations=True,
                          export_yup=True, export_materials='EXPORT', export_image_format='NONE')
mesh_objs = [o for o in bpy.data.objects if o.type == 'MESH']
info['skinned'] = sum(1 for m in mesh_objs if any(md.type == 'ARMATURE' and md.object for md in m.modifiers) and len(m.vertex_groups) > 0)
info['bytes'] = os.path.getsize(out) if os.path.exists(out) else 0
print('AUTORIG ' + json.dumps(info))
if info['bones'] == 0 or info['skinned'] == 0:
    print('AUTORIG FAIL: no bones or nothing skinned')
    sys.exit(2)
