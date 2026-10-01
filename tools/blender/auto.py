# The auto-rickshaw body (see common.py for how models are built and exported).
#   blender --background --python tools/blender/auto.py -- [--render out.png] [--view x,y,z]
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *

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

main('auto', build)
