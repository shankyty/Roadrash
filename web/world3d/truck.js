'use strict';
// Goods trucks.
// Indian goods truck (Tata / Leyland style): flat-fronted cab with a painted crown over the split
// windscreen, chrome grille, round headlamps and a hazard-striped bumper; a high-sided painted body with
// PUBLIC CARRIER on it and a roped tarpaulin over the load; HORN OK PLEASE on the tailgate, mud flaps.
function truckModel(rearCanvas) {
  const Wd = 1120, L = 2800, R = L / 2, g = new T.Group(), axles = [-R + 400, R - 720, R - 330];
  g.add(baked('truck', () => {
    const s = new T.Group(), cab = paint('#f4a300', 40), dark = lambert('#141517'), bodyC = paint('#ffca28', 20);
    well(s, 232, Wd + 4, 195, axles[0]);
    s.add(box(Wd * 0.62, 90, L - 200, '#1a1a1a', 0, 250, 80));                           // chassis
    // cab
    s.add(rbox(Wd, 820, 760, cab, 0, 790, -R + 380, 110));
    s.add(rbox(Wd * 0.78, 290, 20, glass, 0, 990, -R + 4, 12));
    s.add(rbox(44, 300, 26, cab, 0, 990, -R + 2, 10));
    for (const sx of [-1, 1]) {
      s.add(rbox(12, 260, 360, glass, sx * (Wd / 2 + 1), 990, -R + 330, 8));             // door windows
      s.add(rbox(14, 12, 60, dark, sx * (Wd / 2 + 2), 800, -R + 250, 4));                 // handle
      s.add(rbox(90, 28, 260, '#333', sx * (Wd / 2 - 40), 340, -R + 380, 8));            // step
      s.add(rbox(120, 16, 16, '#333', sx * (Wd / 2 + 50), 1060, -R + 60, 6));             // mirror arm
      s.add(rbox(30, 230, 110, '#222', sx * (Wd / 2 + 110), 1010, -R + 60, 10));          // mirror
    }
    s.add(rbox(Wd * 1.02, 110, 240, '#c62828', 0, 1200, -R + 110, 40));
    s.add(facePanel(truckCrown(), Wd * 0.96, 100, 0, 1200, -R - 12, Math.PI));
    s.add(rbox(Wd * 0.56, 230, 20, dark, 0, 610, -R - 2, 12));
    for (let i = 0; i < 5; i++) s.add(rbox(Wd * 0.54, 14, 12, chrome3D, 0, 520 + i * 44, -R - 12, 5));
    for (const sx of [-1, 1]) roundLamp(s, 62, sx * (Wd / 2 - 130), 560, -R - 6);
    s.add(rbox(Wd + 30, 130, 90, dark, 0, 330, -R - 20, 25));
    s.add(facePanel(hazard(), Wd + 10, 100, 0, 330, -R - 66, Math.PI));
    s.add(facePanel(plate('MH 04 TK', '#ffd21f'), 190, 48, 0, 450, -R - 14, Math.PI));
    // air horns and amber marker lamps on the roof, wipers, grab handles by the doors
    for (const sx of [-1, 1]) {
      spokeTo(s, [sx * 160, 1290, -R + 260], [sx * 160, 1290, -R + 60], 20, chrome3D);
      s.add(sph(chrome3D, 70, 70, 30, sx * 160, 1290, -R + 50));
      const w = rbox(260, 10, 10, satin, sx * 210, 870, -R - 6, 3); w.rotation.z = sx * 0.35; s.add(w);
      spokeTo(s, [sx * (Wd / 2 + 8), 560, -R + 640], [sx * (Wd / 2 + 8), 900, -R + 640], 9, chrome3D);
    }
    for (let i = 0; i < 5; i++) s.add(sph(lambert('#ffa000', { emissive: '#7a4a00', emissiveIntensity: 0.4 }), 40, 30, 30, -360 + i * 180, 1268, -R - 6));
    // fuel tank and tool box between the axles
    const tank = cyl(110, 480, '#a7abb0', -(Wd / 2 - 150), 330, -R + 1050); tank.rotation.x = Math.PI / 2; s.add(tank);
    s.add(rbox(200, 200, 380, '#37474f', Wd / 2 - 130, 330, -R + 1050, 12));
    // cargo body: floor, headboard, sides, tailgate, top rail
    const bz = 400, bl = 2000;
    s.add(rbox(Wd, 80, bl, '#5d4037', 0, 460, bz, 15));
    s.add(rbox(Wd, 800, 50, bodyC, 0, 900, bz - bl / 2 + 25, 15));
    for (const sx of [-1, 1]) {
      s.add(rbox(40, 650, bl, bodyC, sx * (Wd / 2 - 20), 825, bz, 12));
      s.add(facePanel(truckSide(), bl - 100, 560, sx * (Wd / 2 + 1), 825, bz, sx * Math.PI / 2));
    }
    s.add(rbox(Wd, 650, 50, bodyC, 0, 825, R - 25, 12));
    s.add(rbox(Wd + 16, 40, bl, '#d32f2f', 0, 1155, bz, 12));
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 7; i++) s.add(rbox(14, 40, 24, chrome3D, sx * (Wd / 2 + 10), 1110, bz - bl / 2 + 150 + i * 285, 5));    // rope hooks
      for (const y of [300, 370]) s.add(rbox(16, 26, 360, satin, sx * (Wd / 2 - 10), y, 330, 8));                         // side guard
    }
    // tarpaulin bulging over the load, tied down with ropes
    s.add(rbox(Wd * 0.97, 420, bl - 60, lambert('#1565c0'), 0, 1270, bz + 10, 190));
    for (let i = 0; i < 5; i++) {
      const z = bz - bl / 2 + 250 + i * 375;
      s.add(rbox(Wd * 0.7, 12, 16, '#e0c080', 0, 1482, z, 5));
      for (const sx of [-1, 1]) s.add(rbox(12, 200, 16, '#e0c080', sx * (Wd * 0.485 + 4), 1250, z, 5));
    }
    // back: HORN OK PLEASE, under-run bar, tail lamps, mud flaps behind the rear wheels
    if (rearCanvas) s.add(facePanel(crop(rearCanvas, 8, 130, 292, 290), Wd - 60, 590, 0, 830, R + 2));
    s.add(rbox(Wd, 60, 40, dark, 0, 300, R - 20, 12));
    for (const sx of [-1, 1]) {
      s.add(rbox(110, 50, 24, tailGlow, sx * (Wd / 2 - 110), 380, R + 2, 10));
      s.add(box(240, 260, 12, dark, sx * (Wd / 2 - 90), 200, R - 140));
      s.add(rbox(220, 30, 520, '#222', sx * (Wd / 2 - 88), 410, (axles[1] + axles[2]) / 2, 10));  // rear mudguards
    }
    return s;
  }));
  for (const sx of [-1, 1]) {
    g.add(wheel(195, 170, sx * (Wd / 2 - 56), 195, axles[0], '#9e1b1b'));
    for (const z of axles.slice(1)) g.add(wheel(195, 240, sx * (Wd / 2 - 90), 195, z, '#9e1b1b', 'dual'));
  }
  g.add(shadow(Wd, L));
  indicators(g, Wd, L, 450); g.userData.headY = 560;
  g.userData.size = { w: Wd, h: 1500, l: L };
  return g;
}
