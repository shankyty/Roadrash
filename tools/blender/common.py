# Shared helpers for the vehicle models built headless in Blender and exported for the game.
# A model script defines build() (making objects tagged with a material slot) and calls main(name, build):
#   blender --background --python tools/blender/<name>.py -- [--render out.png] [--view x,y,z]
# Shapes are lofted from cross-sections and smoothed with subdivision surfaces; units are game units / 100
# (Blender +Y forward, +Z up). Writes web/models/<name>.js: per material slot, flat vertex + normal arrays at
# two levels of detail, which web/world3d/blender-models.js turns into meshes and paints with each vehicle's own colours.
# Objects without a slot (boolean cutters for wheel arches) are not exported.
import bpy, bmesh, math, sys, os, json, base64, struct
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
S = 0.01  # game units -> Blender units
BASE = {}  # (object, modifier) -> its detailed subdivision level
COLORS = {'body': (0.1, 0.6, 0.25, 1), 'trim': (1, 0.82, 0.1, 1), 'canopy': (0.05, 0.05, 0.05, 1), 'glass': (0.3, 0.5, 0.6, 1),
          'dark': (0.08, 0.08, 0.08, 1), 'chrome': (0.85, 0.87, 0.9, 1), 'band': (0.95, 0.9, 0.75, 1), 'roof': (0.75, 0.15, 0.15, 1)}

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

def export(name, path):
    out = {}
    for lod, extra in (('hi', 0), ('lo', -1)):
        for ob in bpy.data.objects:
            for m in ob.modifiers:
                if m.type == 'SUBSURF': m.levels = max(0, BASE[(ob.name, m.name)] + extra)
        dg = bpy.context.evaluated_depsgraph_get()
        slots = {}
        for ob in bpy.data.objects:
            if 'slot' not in ob: continue
            p, n = tris(ob, dg)
            s = slots.setdefault(ob['slot'], ([], []))
            s[0].extend(p); s[1].extend(n)
        out[lod] = {k: {'p': b64(v[0], 0.5), 'n': b64(v[1], 1 / 32767), 'c': len(v[0]) // 3} for k, v in slots.items()}
    for ob in bpy.data.objects:                                # back to the detailed levels (for a preview render)
        for m in ob.modifiers:
            if m.type == 'SUBSURF': m.levels = BASE[(ob.name, m.name)]
    js = '// generated by tools/blender/%s.py (Blender %s): do not edit\nwindow.RR_MODELS = window.RR_MODELS || {};\nwindow.RR_MODELS.%s = %s;\n' % (name, bpy.app.version_string, name, json.dumps(out))
    open(path, 'w').write(js)
    return {k: {s: v['c'] for s, v in out[k].items()} for k in out}

def strut(name, a, b, w, d, bevel=0.0):
    """a bar from point a to point b (game units), w wide (x) and d deep: pillars, posts, rails"""
    a, b = Vector(a) * S, Vector(b) * S
    axis = (b - a).normalized(); side = Vector((1, 0, 0)); fwd = axis.cross(side).normalized()
    bm = bmesh.new(); vs = []
    for end in (a, b):
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            vs.append(bm.verts.new(end + side * (sx * w / 2 * S) + fwd * (sy * d / 2 * S)))
    for f in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    if bevel:
        m = ob.modifiers.new('bevel', 'BEVEL'); m.width = bevel; m.segments = 2; m.limit_method = 'NONE'
    return ob

def cutter(name, r, length, loc):
    """a cylinder across the car (axis x) for cutting a wheel arch; not exported"""
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r * S, depth=length * S, location=Vector(loc) * S, rotation=(0, math.pi / 2, 0))
    ob = bpy.context.active_object; ob.name = name; ob.hide_render = True; ob.display_type = 'WIRE'
    return ob

def cut(ob, cutters):
    """wheel arches: subtract the cutters after smoothing"""
    for c in cutters:
        m = ob.modifiers.new('arch_' + c.name, 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = c; m.solver = 'EXACT'
    return ob

VIEW = (13, 15, 10)  # preview camera position (front three-quarters)
def render(path):
    scn = bpy.context.scene
    for ob in bpy.data.objects:
        mat = bpy.data.materials.new(ob.name)
        if 'slot' not in ob: continue
        mat.diffuse_color = COLORS[ob['slot']]
        ob.data.materials.append(mat)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scn.collection.objects.link(cam)
    aim = bpy.data.objects.new('aim', None); scn.collection.objects.link(aim); aim.location = (0, 0, 4)
    cam.location = VIEW; c = cam.constraints.new('TRACK_TO'); c.target = aim; scn.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); scn.collection.objects.link(sun); sun.rotation_euler = (0.6, 0.3, 0.8)
    scn.render.engine = 'BLENDER_WORKBENCH'; scn.display.shading.light = 'STUDIO'; scn.display.shading.color_type = 'MATERIAL'
    scn.render.resolution_x, scn.render.resolution_y = 900, 700; scn.render.filepath = path
    bpy.ops.render.render(write_still=True)

def main(name, build):
    global VIEW
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    build()
    for ob in bpy.data.objects:
        for m in ob.modifiers:
            if m.type == 'SUBSURF': BASE[(ob.name, m.name)] = m.levels
    print('EXPORT', export(name, os.path.join(ROOT, 'web', 'models', name + '.js')))
    if '--view' in argv: VIEW = tuple(float(v) for v in argv[argv.index('--view') + 1].split(','))
    if '--render' in argv: render(argv[argv.index('--render') + 1])
