'use strict';
// The road mesh.
// ---------------------------------------------------------------- road mesh
let vi = 0;
function quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, col, uv) {
  // a-b at the near edge (left, right), c-d at the far edge (right, left); uv: [ua, va, ub, vb, uc, vc, ud, vd]
  const p = roadPos, c = roadCol, pts = [ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz];
  for (let k = 0; k < 18; k++) p[vi * 3 + k] = pts[k];
  for (let k = 0; k < 6; k++) { c[(vi + k) * 3] = col.r; c[(vi + k) * 3 + 1] = col.g; c[(vi + k) * 3 + 2] = col.b; roadDet[vi + k] = det; }
  const u = [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]];
  for (let k = 0; k < 12; k++) roadUV[vi * 2 + k] = u[k];
  vi += 6;
}
// a quad across the road between fractions f1..f2 of segment n (0 = its near end), from lateral a..b at the
// near end to c..d at the far end (so a strip can widen along a taper)
function stripT(n, f1, f2, a1, b1, a2, b2, yOff, col, yOff2 = yOff) { // yOff2: the height at the far end, when it differs
  const A = P[n], B = P[n + 1];
  const lerp = (u, v, f) => u + (v - u) * f;
  const px1 = lerp(A.x, B.x, f1), pz1 = lerp(A.z, B.z, f1), px2 = lerp(A.x, B.x, f2), pz2 = lerp(A.z, B.z, f2);
  const t1 = lerp(TH[n], TH[n + 1], f1), t2 = lerp(TH[n], TH[n + 1], f2), y1 = lerp(Y[n], Y[n + 1], f1) + yOff, y2 = lerp(Y[n], Y[n + 1], f2) + yOff2;
  const c1 = Math.cos(t1), s1 = Math.sin(t1), c2 = Math.cos(t2), s2 = Math.sin(t2);
  const o1 = lerp(a1, a2, f1), o2 = lerp(b1, b2, f1), o3 = lerp(a1, a2, f2), o4 = lerp(b1, b2, f2);
  // texture coordinates: one asphalt tile per lane across and three lane-widths along (wrapped to keep floats exact)
  const L = segments3D.length, d1 = (((baseIdx + n + f1) % L) * SEG_LEN_3D) / (TILE * 3), d2 = d1 + (f2 - f1) * SEG_LEN_3D / (TILE * 3);   // tile is 3 lanes long
  quad(px1 + c1 * o1, y1, pz1 + s1 * o1, px1 + c1 * o2, y1, pz1 + s1 * o2,
       px2 + c2 * o4, y2, pz2 + s2 * o4, px2 + c2 * o3, y2, pz2 + s2 * o3, col,
       [o1 / TILE, d1, o2 / TILE, d1, o4 / TILE, d2, o3 / TILE, d2]);
}
const strip = (n, o1, o2, yOff, col) => stripT(n, 0, 1, o1, o2, o1, o2, yOff, col);
// an upright face along segment n, at lateral a at its near end and b at its far end: from y0 up to y1 at the
// near end, y2 up to y3 at the far end (a kerb)
// a vertical face along the road at offset a (near end) to b (far end), from height y0 up to y1 (near) and y2 up to
// y3 (far); it faces the way `out` points (+1: towards the road's right, -1: its left), as the road is one-sided
function wallT(n, a, b, y0, y1, y2, y3, col, out = 1) {
  const A = P[n], B = P[n + 1], ax = A.x + Math.cos(TH[n]) * a, az = A.z + Math.sin(TH[n]) * a, bx = B.x + Math.cos(TH[n + 1]) * b, bz = B.z + Math.sin(TH[n + 1]) * b;
  if (out > 0) quad(ax, Y[n] + y0, az, ax, Y[n] + y1, az, bx, Y[n + 1] + y3, bz, bx, Y[n + 1] + y2, bz, col, [0, 0, 0, 0, 0, 0, 0, 0]);
  else quad(ax, Y[n] + y1, az, ax, Y[n] + y0, az, bx, Y[n + 1] + y2, bz, bx, Y[n + 1] + y3, bz, col, [0, 0, 0, 0, 0, 0, 0, 0]);
}
function buildRoad() {
  vi = 0;
  const L = segments3D.length, U = ROAD_W_3D, rw = U / 6, sw = U * 0.35, lw = U / 40, LW = (cfg.LANE_W || 0.6) * U;
  for (let n = 0; n < DRAW; n++) {
    const seg = segments3D[(baseIdx + n) % L], col = seg.dark ? colors.dark : colors.light, start = vi;
    const h1 = (seg.hw1 || 1) * U, h2 = (seg.hw2 || 1) * U;
    if (seg.junction) {
      // the cross road runs right through: road surface everywhere, its centre line, zebra crossings at the edges
      det = 1; strip(n, -26000, 26000, 0, col.road); det = 0.7;
      const j = seg.junction, k = (baseIdx + n) % L;
      if (k === j.s0 + (j.s1 - j.s0 + 1) / 2) { stripT(n, 0, 0.12, -26000, -h1 - 300, -26000, -h1 - 300, 3, colors.yellow); stripT(n, 0, 0.12, h1 + 300, 26000, h1 + 300, 26000, 3, colors.yellow); }
      if (k === j.s0 || k === j.s1) for (let x = -h1 + 60; x < h1 - 150; x += 300) stripT(n, 0.15, 0.85, x, x + 170, x, x + 170, 3, colors.white);
    } else {
      // the footpath: raised, with a kerb face towards the road and a back face towards the grass; next to a
      // junction it slopes down to road level (a dropped kerb). Without one, the old narrow paved strip.
      const fp = cfg.footpath, fw = fp ? fp.width * U : sw;
      const ya = !fp ? -3 : segments3D[(baseIdx + n - 1 + L) % L].junction ? 0 : FP_H, yb = !fp ? -3 : segments3D[(baseIdx + n + 1) % L].junction ? 0 : FP_H;
      det = 0; strip(n, -26000, -h1 - rw - fw, -6, col.grass); stripT(n, 0, 1, h1 + rw + fw, 26000, h2 + rw + fw, 26000, -6, col.grass);
      det = 0.3; stripT(n, 0, 1, -h1 - rw - fw, -h1 - rw, -h2 - rw - fw, -h2 - rw, ya, col.shoulder, yb); stripT(n, 0, 1, h1 + rw, h1 + rw + fw, h2 + rw, h2 + rw + fw, ya, col.shoulder, yb);
      if (fp) { det = 0; for (const sd of [-1, 1]) { wallT(n, sd * (h1 + rw), sd * (h2 + rw), 0, ya, 0, yb, colors.kerb, -sd); wallT(n, sd * (h1 + rw + fw), sd * (h2 + rw + fw), -6, ya, -6, yb, colors.kerb, sd); } }
      det = 0.45; stripT(n, 0, 1, -h1 - rw, -h1, -h2 - rw, -h2, 0, col.rumble); stripT(n, 0, 1, h1, h1 + rw, h2, h2 + rw, 0, col.rumble);
      det = 1; stripT(n, 0, 1, -h1, h1, -h2, h2, 0, col.road); det = 0.7;                       // (paint on top: worn)
      if (seg.finish) {
        const phase = seg.finish === 2 ? 1 : 0;
        for (let q = 0; q < 12; q++) { if ((q + phase) % 2) continue; strip(n, -h1 + 2 * h1 * q / 12, -h1 + 2 * h1 * (q + 1) / 12, 3, colors.white); }
      } else {
        for (const o of [-60, 60]) strip(n, o - lw / 2, o + lw / 2, 3, colors.yellow);          // double yellow centre line
        if (col.lane) for (const sd of [-1, 1]) for (let i = 1; i < (seg.lanes || 1); i++) strip(n, sd * i * LW - lw / 2, sd * i * LW + lw / 2, 3, col.lane);
        // stop lines just before a junction, on each side's own carriageway
        const next = segments3D[(baseIdx + n + 1) % L], prev = segments3D[(baseIdx + n - 1 + L) % L];
        if (next.junction && !seg.junction) stripT(n, 0.35, 0.6, -h1, -60, -h1, -60, 3, colors.white);
        if (prev.junction && !seg.junction) stripT(n, 0.4, 0.65, 60, h1, 60, h1, 3, colors.white);
      }
    }
    det = 1;
    for (let used = (vi - start) / 6; used < QUADS; used++) { for (let k = 0; k < 18; k++) roadPos[vi * 3 + k] = 0; vi += 6; }
  }
  road.geometry.attributes.position.needsUpdate = true;
  road.geometry.attributes.color.needsUpdate = true;
  road.geometry.attributes.uv.needsUpdate = true; road.geometry.attributes.detail.needsUpdate = true;
}

// Asphalt: a painted tile (one lane wide) that the road's own colours are multiplied by, so the palette
// stays and the surface gets grain, darker wheel paths with tyre marks, an oily strip down the middle of
// the lane, patched repairs and cracks. 'detail' fades it per surface (full on the road, worn paint,
// a little on kerbs and pavement, none on the grass).
let TILE = 1200;
function asphaltTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = 'rgb(232,232,232)'; x.fillRect(0, 0, S, S);
  // repair patches (slightly different tone, darker seam)
  for (let i = 0; i < 4; i++) {
    const w = 60 + rnd() * 120, h = 50 + rnd() * 160, px = rnd() * (S - w), py = rnd() * (S - h), t = rnd() < 0.5 ? 224 : 240;
    x.fillStyle = `rgb(${t},${t},${t})`; x.fillRect(px, py, w, h); x.strokeStyle = 'rgba(80,80,80,.18)'; x.lineWidth = 2; x.strokeRect(px, py, w, h);
  }
  // wheel paths: darker, streaky; oil down the middle of the lane
  for (const cx of [0.28, 0.72]) for (let i = 0; i < 260; i++) {
    const px = (cx + (rnd() - 0.5) * 0.09) * S, py = rnd() * S;
    x.fillStyle = `rgba(60,60,60,${0.03 + rnd() * 0.05})`; x.fillRect(px, py, 2 + rnd() * 6, 20 + rnd() * 90);
  }
  for (let i = 0; i < 9; i++) { x.fillStyle = `rgba(40,40,40,${0.05 + rnd() * 0.07})`; x.beginPath(); x.ellipse(S * (0.5 + (rnd() - 0.5) * 0.08), rnd() * S, 8 + rnd() * 18, 16 + rnd() * 40, 0, 0, 7); x.fill(); }
  // cracks
  x.strokeStyle = 'rgba(70,70,70,.55)'; x.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) { let px = rnd() * S, py = rnd() * S; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 12; k++) { px += (rnd() - 0.5) * 22; py += (rnd() - 0.3) * 18; x.lineTo(px, py); } x.stroke(); }
  // grain
  const img = x.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 26; d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n)); }
  x.putImageData(img, 0, 0);
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
function roadMaterial() {
  const m = nightify(new T.MeshBasicMaterial({ vertexColors: true, map: asphaltTexture() }), true), night = m.onBeforeCompile;
  m.onBeforeCompile = sh => {
    night(sh);
    sh.vertexShader = 'attribute float detail; varying float vDetail;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvDetail = detail;');
    sh.fragmentShader = 'varying float vDetail;\n' + sh.fragmentShader.replace('#include <map_fragment>', 'diffuseColor *= mix(vec4(1.0), texture2D(map, vUv), vDetail);');
  };
  m.customProgramCacheKey = () => 'road';
  return m;
}
