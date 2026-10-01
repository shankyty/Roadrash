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

def build():
    reset()
    parts = []
    # body: rear tub over the back wheels, low footboard, and the nose cowl rising to the dashboard,
    # narrowing down to the front wheel
    parts.append(slot(smooth(loft('body', [
        (-530, 268, 165, 380, 5), (-500, 280, 145, 425, 6), (-200, 284, 140, 432, 6), (-95, 282, 140, 425, 6),
        (-62, 262, 128, 235, 5), (0, 255, 124, 192, 6), (250, 250, 124, 196, 6),
        (300, 236, 130, 560, 5), (380, 205, 148, 610, 4), (455, 160, 195, 540, 3.5), (515, 112, 255, 400, 3), (540, 70, 300, 330, 2.6),
    ], n=16), 2), 'body'))
    # canopy: rounded roof running the length, closed back wall and sides behind the passengers, a visor
    parts.append(slot(smooth(loft('roof', [
        (-535, 300, 820, 880, 6), (-450, 306, 835, 892, 7), (100, 306, 838, 895, 7), (230, 300, 830, 885, 6), (300, 290, 815, 860, 4),
    ], n=16), 2), 'canopy'))
    parts.append(slot(smooth(box('back', (604, 70, 470), (0, -500, 640), 0.25), 1), 'canopy'))
    for sx in (-1, 1):
        parts.append(slot(smooth(box('side%d' % sx, (40, 330, 470), (sx * 288, -360, 640), 0.15), 1), 'canopy'))
        parts.append(slot(smooth(box('rail%d' % sx, (30, 470, 120), (sx * 291, 40, 775), 0.12), 1), 'canopy'))
        parts.append(slot(smooth(box('pillar%d' % sx, (28, 30, 440), (sx * 272, 255, 620), 0.1), 1), 'trim'))
    # windscreen frame and dashboard panel in the trim colour; glass
    parts.append(slot(smooth(box('screenTop', (560, 30, 26), (0, 300, 820), 0.1), 1), 'trim'))
    parts.append(slot(smooth(box('dash', (440, 110, 120), (0, 330, 545), 0.3), 1), 'trim'))
    g = slot(box('glass', (510, 10, 250), (0, 290, 700)), 'glass'); g.rotation_euler.x = 0.16; parts.append(g)   # raked back
    # front mudguard over the front wheel
    parts.append(slot(smooth(loft('guard', [
        (420, 70, 230, 300, 3), (480, 80, 250, 315, 3), (560, 76, 225, 295, 3), (600, 60, 170, 250, 3),
    ], n=12), 2), 'body'))
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
        mat.diffuse_color = {'body': (0.1, 0.6, 0.25, 1), 'trim': (1, 0.82, 0.1, 1), 'canopy': (0.05, 0.05, 0.05, 1), 'glass': (0.3, 0.5, 0.6, 1)}[ob['slot']]
        ob.data.materials.append(mat)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scn.collection.objects.link(cam)
    aim = bpy.data.objects.new('aim', None); scn.collection.objects.link(aim); aim.location = (0, 0, 4.5)
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
