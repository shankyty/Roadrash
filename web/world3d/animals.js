'use strict';
// Cows and dogs.
// Indian zebu cow: a long body with a hump over the shoulders and a hanging dewlap, a long face with a dark
// muzzle, droopy ears, two curving horns with painted tips, a marigold garland, slim jointed legs and a
// tail that hangs down to a tuft (and swishes). Coats: white, grey or Gir red-brown.
const COW_COATS = [
  { hide: '#f3efe6', shade: '#e2dccf', horn: '#c9b48a', tip: '#ff6f00' },
  { hide: '#d9d6cf', shade: '#bdb8ae', horn: '#bfa77a', tip: '#1e88e5' },
  { hide: '#a0522d', shade: '#7a3e22', horn: '#d2bf95', tip: '#e53935' },
];
function cowModel(coat = COW_COATS[0]) {
  const g = new T.Group();
  g.add(baked('cow' + coat.hide, () => {
    const s = new T.Group(), hide = lambert(coat.hide), shade = lambert(coat.shade), horn = lambert(coat.horn), tip = lambert(coat.tip), dark = lambert('#2b2222');
    s.add(sph(hide, 350, 320, 820, 0, 600, 10));                                              // barrel
    s.add(sph(hide, 320, 330, 380, 0, 600, -200));                                            // chest
    s.add(sph(hide, 330, 320, 400, 0, 615, 230));                                             // rump
    s.add(sph(shade, 200, 220, 240, 0, 770, -250));                                           // hump
    s.add(sph(shade, 46, 200, 300, 0, 520, -400));                                            // dewlap (a thin hanging fold)
    s.add(limb([0, 650, -330], [0, 730, -520], 100, hide));                                   // neck
    s.add(sph(hide, 175, 175, 180, 0, 780, -560));                                            // forehead
    s.add(limb([0, 760, -600], [0, 630, -760], 72, hide));                                    // long face
    s.add(sph(dark, 128, 100, 96, 0, 615, -790));                                             // muzzle
    for (const sx of [-1, 1]) {
      s.add(sph(dark, 30, 30, 26, sx * 78, 765, -630));                                       // eyes
      const ear = sph(hide, 150, 46, 74, sx * 135, 730, -560); ear.rotation.z = sx * 0.45; s.add(ear);   // droopy ears
      s.add(limb([sx * 50, 840, -555], [sx * 115, 930, -540], 19, horn));                    // horns curving up
      s.add(limb([sx * 115, 930, -540], [sx * 125, 1010, -500], 12, tip));                   // painted tips
    }
    for (let i = 0; i < 9; i++) {                                                               // marigold garland
      const a = -Math.PI * 0.95 + i * Math.PI * 0.95 / 4;
      s.add(sph(lambert(i % 2 ? '#ffb300' : '#ff6f00'), 50, 50, 50, Math.cos(a) * 100, 690 + Math.sin(a) * 90, -470));
    }
    return s;
  }));
  // tail: hangs from the top of the rump to a dark tuft; swishes as the cow walks (see walk)
  const tail = new T.Group(); tail.position.set(0, 700, 420);
  tail.add(limb([0, 0, 0], [0, -200, 50], 16, lambert(coat.hide)));
  tail.add(limb([0, -200, 50], [0, -390, 60], 13, lambert(coat.hide)));
  tail.add(sph(lambert('#2b2222'), 54, 110, 54, 0, -440, 60));
  g.add(tail); g.userData.tail = tail;
  // legs: thicker upper leg to the knee, slimmer shin, dark hoof (pivoting at the body)
  const out = [];
  for (const [x, z] of [[-105, -250], [105, -250], [-105, 270], [105, 270]]) {
    const pivot = new T.Group(); pivot.position.set(x, 470, z);
    pivot.add(limb([0, 0, 0], [0, -230, z < 0 ? -10 : 20], 44, lambert(coat.hide)));
    pivot.add(limb([0, -230, z < 0 ? -10 : 20], [0, -440, 0], 28, lambert(coat.shade)));
    pivot.add(cyl(32, 34, '#3a3030', 0, -455, 0));
    g.add(pivot); out.push(pivot);
  }
  g.userData.legs = out;
  g.add(shadow(380, 980));
  g.userData.size = { w: 380, h: 1020, l: 1000 };
  return g;
}
function dogModel(coat) {
  const g = new T.Group();
  g.add(shadow(180, 420));
  g.add(blobAt(coat.body, 170, 170, 420, 0, 255, 0));                                       // body
  g.add(blobAt(coat.belly, 150, 110, 300, 0, 215, -10));
  const head = new T.Group(); head.position.set(0, 350, -230);
  head.add(blobAt(coat.body, 150, 145, 160, 0, 0, 0));
  head.add(rbox(84, 70, 120, coat.belly, 0, -26, -110, 30));                                 // snout
  head.add(blobAt('#111', 38, 32, 30, 0, -12, -172));                                        // nose
  for (const sx of [-1, 1]) {
    head.add(blobAt('#111', 20, 20, 20, sx * 42, 22, -70));
    const ear = new T.Mesh(unitCone, lambert(coat.dark)); ear.scale.set(50, 90, 40); ear.position.set(sx * 45, 100, 0); head.add(ear);
  }
  g.add(head); g.userData.head = head;
  const tail = new T.Mesh(capsule(13, 150), lambert(coat.body)); tail.position.set(0, 360, 230); tail.rotation.x = -0.7; g.add(tail);
  if (coat.spots) g.add(blobAt(coat.spots, 176, 110, 150, 0, 285, -40));
  legs(g, coat.dark, [[-55, -150], [55, -150], [-55, 150], [55, 150]], 190, 22);
  g.userData.size = { w: 170, h: 420, l: 420 };
  return g;
}
