# Hindustan Ambassador (see common.py for how models are built and exported).
#   blender --background --python tools/blender/amby.py -- [--render out.png] [--view x,y,z]
# After Sketchfab references (Hindustan Ambassador, Ambassador taxi): a rounded, high body; a long bonnet with a
# centre strip, sitting between two separate front wings that bulge up and forward and carry the round
# headlamps; the chrome grille recessed between the wings; a humped boot with rounded haunches over the rear
# wheels; a high domed roof over a glasshouse with thin pillars; chrome bumpers with overriders; real wheel
# arches cut through the body. 1680 long, 720 wide (game units), axles at +560 / -525.
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *

FRONT, REAR, R = 560, -525, 122

def build():
    reset()
    arches = [cutter('archF', 150, 900, (0, FRONT, R)), cutter('archR', 148, 900, (0, REAR, R))]
    # main body: boot, cabin sides and bonnet in one lengthways loft
    slot(cut(smooth(loft('body', [
        (-842, 290, 200, 330, 4), (-805, 335, 168, 382, 5), (-660, 352, 152, 405, 6), (-400, 356, 146, 418, 6.5),
        (280, 356, 146, 418, 6.5), (480, 330, 152, 400, 5.5), (690, 300, 170, 380, 4.5), (790, 262, 200, 342, 3.5), (828, 210, 228, 300, 3),
    ], n=20), 2), arches), 'body')
    # front wings: fenders bulging up and forward either side of the bonnet, carrying the headlamps
    for sx in (-1, 1):
        w = slot(cut(smooth(loft('wing%d' % sx, [
            (300, 62, 210, 392, 3), (520, 84, 196, 420, 3.2), (720, 86, 200, 418, 3), (805, 78, 218, 400, 2.6), (828, 60, 240, 372, 2.3),
        ], n=16), 2), arches), 'body')
        w.location.x = sx * 272 * S
        # rounded haunches over the rear wheels
        h = slot(cut(smooth(loft('haunch%d' % sx, [
            (-790, 50, 190, 350, 3), (-650, 76, 168, 398, 3.5), (-420, 80, 165, 402, 3.5), (-300, 56, 180, 370, 3),
        ], n=16), 2), arches), 'body')
        h.location.x = sx * 300 * S
    # glasshouse (tinted glass all round) under a high domed roof; thin pillars in the body colour
    slot(smooth(loft('glasshouse', [
        (-478, 292, 398, 560, 5), (-430, 308, 404, 612, 6), (-370, 318, 408, 645, 7), (120, 318, 408, 652, 7),
        (190, 312, 406, 625, 6), (262, 296, 400, 575, 5),
    ], n=24), 2), 'glass')
    slot(smooth(loft('roof', [
        (-405, 300, 622, 682, 5), (-360, 318, 638, 704, 6), (110, 318, 640, 710, 6), (172, 308, 626, 692, 5),
    ], n=20), 2), 'body')
    for sx in (-1, 1):
        for y0, z0, y1, z1 in ((255, 410, 150, 640), (-95, 410, -95, 645), (-470, 410, -385, 640)):   # A, B, C pillars
            slot(strut('pillar', (sx * 318, y0, z0), (sx * 312, y1, z1), 22, 30, 0.04), 'body')
        slot(box('belt', (8, 720, 10), (sx * 334, -100, 410)), 'chrome')                               # chrome belt line
        slot(box('crease', (6, 1000, 8), (sx * 344, -60, 300)), 'chrome')                               # side trim
    # bonnet centre strip, grille recessed between the wings, chrome bumpers with overriders
    slot(box('strip', (18, 420, 10), (0, 560, 396)), 'chrome')
    slot(smooth(box('grille', (300, 26, 140), (0, 818, 292), 0.2), 1), 'chrome')
    for i in range(9):
        slot(box('slat', (8, 10, 118), (-128 + i * 32, 834, 292)), 'dark')
    for y in (872, -872):
        slot(smooth(box('bumper', (760, 64, 58), (0, y, 202), 0.25), 1), 'chrome')
        for sx in (-1, 1):
            slot(smooth(box('over', (40, 54, 100), (sx * 205, y + (12 if y > 0 else -12), 222), 0.2), 1), 'chrome')
    # dark underbody between the arches (you don't see through the car)
    slot(box('under', (480, 1150, 50), (0, 20, 195)), 'dark')

main('amby', build)
