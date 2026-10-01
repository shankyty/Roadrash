# Builds the auto-rickshaw body in Blender (headless) and exports it for the game.
#   blender --background --python tools/blender/auto.py -- [--render out.png]
# Shapes are lofted from cross-sections and smoothed with subdivision surfaces; units are game units / 100
# (Blender +Y forward, +Z up). Writes web/models/auto.js: per material slot, flat vertex + normal arrays at
# two levels of detail, which world3d.js turns into meshes and paints with each auto's own colours.
import bpy, bmesh, math, sys, os, json, base64, struct
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
S = 0.01  # game units -> Blender units
BASE = {}  # (object, modifier) -> its detailed subdivision level

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def loft(name, sections, n=12, cap=True):
    """sections: (y, halfwidth, z_bottom, z_top, squareness) along +Y; each becomes a rounded rectangle ring"""
    bm = bmesh.new(); rings = []
    for (y, hw, zb, zt, sq) in sections:
        ring = []
        cz, hz = (zb + zt) / 2, (zt - zb) / 2
        for i in range(n):
            a = 2 * math.pi * i / n
            c, s = math.cos(a), math.sin(a)
            # superellipse: squareness 2 = ellipse, higher = boxier
            x = math.copysign(abs(c) ** (2 / sq), c) * hw
            z = math.copysign(abs(s) ** (2 / sq), s) * hz + cz
            ring.append(bm.verts.new((x * S, y * S, z * S)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    if cap:
        bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    return ob

def box(name, size, loc, bevel=0.0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0] * S, v.co.y * size[1] * S, v.co.z * size[2] * S))   # (game units)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    ob.location = Vector(loc) * S
    if bevel:
        m = ob.modifiers.new('bevel', 'BEVEL'); m.width = bevel; m.segments = 3; m.limit_method = 'NONE'
    return ob

def smooth(ob, levels):
    m = ob.modifiers.new('subsurf', 'SUBSURF'); m.levels = levels; m.render_levels = levels
    return ob

def slot(ob, name):
    ob['slot'] = name
    return ob

def loftz(name, sections, n=16, cap=True):
    """vertical loft: sections (z, halfwidth, y_back, y_front, squareness) up the height, each a rounded
    rectangle in plan; lets a shape be wide at the top and narrow at the bottom (the front face)"""
    bm = bmesh.new(); rings = []
    for (z, hw, y0, y1, sq) in sections:
        cy, hy = (y0 + y1) / 2, (y1 - y0) / 2
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n; c, s_ = math.cos(a), math.sin(a)
            ring.append(bm.verts.new((math.copysign(abs(c) ** (2 / sq), c) * hw * S, (math.copysign(abs(s_) ** (2 / sq), s_) * hy + cy) * S, z * S)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n; bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    if cap: bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    return ob

# Proportions after a Bajaj RE (2.6 m long, 1.3 m wide, 1.7 m high) and Sketchfab references: a low rear tub
# with a dark trim line, a low open floor, a tall shield-shaped front face (wide under the windscreen,
# narrowing to the front wheel; the top band in the trim colour, a black panel holding the headlamp), a big
# near-upright windscreen with the canvas roof starting right at its top, closed rear canopy with a big side
# opening and a grab bar.
def build():
    reset()
    parts = []
    # tub and floor (lengthways loft): rear tub over the back wheels stepping down to the open floor
    parts.append(slot(smooth(loft('body', [
        (-530, 266, 170, 368, 6), (-505, 280, 150, 392, 6.5), (-160, 284, 145, 398, 6.5), (-92, 282, 145, 392, 6),
        (-62, 262, 132, 238, 5), (0, 255, 125, 196, 6), (300, 252, 125, 200, 6), (360, 240, 128, 215, 5),
    ], n=16), 2), 'body'))
    # front face (vertical loft): narrow over the front wheel, widening up to the dashboard
    parts.append(slot(smooth(loftz('face', [
        (225, 70, 340, 468, 3), (250, 110, 322, 488, 3.5), (290, 170, 308, 502, 4.5), (335, 220, 298, 510, 6),
        (375, 250, 292, 512, 7), (402, 260, 290, 512, 8), (408, 260, 290, 512, 8),
    ]), 1), 'body'))
    parts.append(slot(smooth(loftz('cap', [                                       # top band of the face, trim colour
        (398, 262, 288, 514, 8), (420, 266, 288, 512, 8), (446, 264, 292, 504, 7), (462, 258, 300, 494, 6),
    ]), 1), 'trim'))
    parts.append(slot(smooth(box('facePanel', (300, 30, 130), (0, 500, 340), 0.2), 1), 'dark'))   # black panel, headlamp
    # front mudguard over the front wheel
    parts.append(slot(smooth(loft('guard', [
        (390, 64, 215, 262, 3), (450, 76, 232, 280, 3), (530, 72, 218, 266, 3), (575, 56, 175, 225, 3),
    ], n=12), 2), 'body'))
    # windscreen: frame in the trim colour, nearly upright glass
    for sx in (-1, 1):
        post = slot(smooth(box('post%d' % sx, (26, 26, 285), (sx * 262, 478, 600), 0.1), 1), 'trim'); post.rotation_euler.x = 0.08; parts.append(post)
    parts.append(slot(smooth(box('screenTop', (560, 34, 30), (0, 468, 735), 0.12), 1), 'trim'))
    g = slot(box('glass', (510, 8, 270), (0, 476, 598)), 'glass'); g.rotation_euler.x = 0.08; parts.append(g)
    # canvas roof, starting right at the windscreen top, sloping a touch to the back
    parts.append(slot(smooth(loft('roof', [
        (-542, 292, 712, 760, 6), (-470, 302, 724, 772, 7), (300, 302, 728, 776, 7), (430, 294, 726, 772, 6), (492, 272, 716, 758, 4),
    ], n=16), 2), 'canopy'))
    # closed canopy at the back: back wall and rear quarters behind the seat; a strip over the side opening
    parts.append(slot(smooth(box('back', (600, 60, 350), (0, -506, 560), 0.22), 1), 'canopy'))
    for sx in (-1, 1):
        parts.append(slot(smooth(box('quarter%d' % sx, (34, 280, 350), (sx * 287, -385, 560), 0.14), 1), 'canopy'))
        parts.append(slot(smooth(box('strip%d' % sx, (26, 560, 70), (sx * 290, 30, 700), 0.1), 1), 'canopy'))
        parts.append(slot(box('grab%d' % sx, (14, 14, 300), (sx * 280, -238, 560)), 'trim'))                 # grab bar
        parts.append(slot(box('line%d' % sx, (8, 380, 18), (sx * 274, -310, 330)), 'dark'))                  # tub trim line
    parts.append(slot(box('mat', (470, 340, 6), (0, 120, 200)), 'dark'))                                     # rubber floor mat
    return parts

def tris(ob, depsgraph):
    """evaluated mesh (modifiers applied) as flat position/normal float lists in three.js axes"""
    ev = ob.evaluated_get(depsgraph); me = ev.to_mesh(); me.calc_loop_triangles()
    mw = ob.matrix_world; nm = mw.to_3x3().inverted().transposed()
    pos, nor = [], []
    for t in me.loop_triangles:
        for li in t.loops:
            v = mw @ me.vertices[me.loops[li].vertex_index].co
            n = (nm @ (me.corner_normals[li].vector if hasattr(me, 'corner_normals') else me.loops[li].normal)).normalized()
            # Blender (x, y fwd, z up) -> three (x, y up, z back), back to game units
            pos += [v.x / S, v.z / S, -v.y / S]; nor += [n.x, n.z, -n.y]
    ev.to_mesh_clear()
    return pos, nor

def b64(floats, step):
    q = [max(-32767, min(32767, round(f / step))) for f in floats]   # quantised to int16 to keep the file small
    return base64.b64encode(struct.pack('<%dh' % len(q), *q)).decode()

def export(path):
    out = {}
    for lod, extra in (('hi', 0), ('lo', -1)):
        for ob in bpy.data.objects:
            for m in ob.modifiers:
                if m.type == 'SUBSURF': m.levels = max(0, BASE[(ob.name, m.name)] + extra)
        dg = bpy.context.evaluated_depsgraph_get()
        slots = {}
        for ob in bpy.data.objects:
            p, n = tris(ob, dg)
            s = slots.setdefault(ob['slot'], ([], []))
            s[0].extend(p); s[1].extend(n)
        out[lod] = {k: {'p': b64(v[0], 0.5), 'n': b64(v[1], 1 / 32767), 'c': len(v[0]) // 3} for k, v in slots.items()}
    for ob in bpy.data.objects:                                # back to the detailed levels (for a preview render)
        for m in ob.modifiers:
            if m.type == 'SUBSURF': m.levels = BASE[(ob.name, m.name)]
    js = '// generated by tools/blender/auto.py (Blender %s): do not edit\nwindow.RR_MODELS = window.RR_MODELS || {};\nwindow.RR_MODELS.auto = %s;\n' % (bpy.app.version_string, json.dumps(out))
    open(path, 'w').write(js)
    return {k: {s: v['c'] for s, v in out[k].items()} for k in out}

VIEW = (13, 15, 10)  # preview camera position (front three-quarters)
def render(path):
    scn = bpy.context.scene
    for ob in bpy.data.objects:
        mat = bpy.data.materials.new(ob['slot'])
        mat.diffuse_color = {'body': (0.1, 0.6, 0.25, 1), 'trim': (1, 0.82, 0.1, 1), 'canopy': (0.05, 0.05, 0.05, 1), 'glass': (0.3, 0.5, 0.6, 1), 'dark': (0.08, 0.08, 0.08, 1)}[ob['slot']]
        ob.data.materials.append(mat)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scn.collection.objects.link(cam)
    aim = bpy.data.objects.new('aim', None); scn.collection.objects.link(aim); aim.location = (0, 0, 4)
    cam.location = VIEW; c = cam.constraints.new('TRACK_TO'); c.target = aim; scn.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); scn.collection.objects.link(sun); sun.rotation_euler = (0.6, 0.3, 0.8)
    scn.render.engine = 'BLENDER_WORKBENCH'; scn.display.shading.light = 'STUDIO'; scn.display.shading.color_type = 'MATERIAL'
    scn.render.resolution_x, scn.render.resolution_y = 900, 700; scn.render.filepath = path
    bpy.ops.render.render(write_still=True)

if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parts = build()
    for ob in bpy.data.objects:
        for m in ob.modifiers:
            if m.type == 'SUBSURF': BASE[(ob.name, m.name)] = m.levels
    print('EXPORT', export(os.path.join(ROOT, 'web', 'models', 'auto.js')))
    if '--view' in argv: VIEW = tuple(float(v) for v in argv[argv.index('--view') + 1].split(','))
    if '--render' in argv: render(argv[argv.index('--render') + 1])
