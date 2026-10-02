'use strict';
// Hyderabad: Golconda Fort + HITEC City far; Charminar, Birla Mandir, Buddha in Hussain Sagar near.
// Two parallax layers, each tiling horizontally at LAYER_W px. The painters draw with the kit game.js
// passes in (paint); t is the track's look and seed its road seed.
RRR.skylines.register({
  id: 'hyderabad',
  far(paint, t, seed) {
    const { mk, rr, mulberry32, LAYER_W, litWindows, fillerBlocks, cutOut, archPath } = paint;
    const h = 230, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed), base = h - 30, col = t.far;
    // Golconda: rocky hill crowned with walls, bastions and the Bala Hissar pavilion
    const hillY = x => base - 20 - Math.max(0, Math.sin((x - 60) / 640 * Math.PI)) * 110;
    g.fillStyle = col; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= 760; x += 8) g.lineTo(x, hillY(x)); g.lineTo(760, h); g.fill();
    for (let x = 120; x < 700; x += 70) { const y = hillY(x); g.fillRect(x - 12, y - 22, 24, 26); for (let k = -10; k < 12; k += 7) g.fillRect(x + k, y - 28, 4, 6); g.fillRect(x + 12, y - 12, 58, 10); }
    const py = hillY(380); g.fillRect(352, py - 60, 56, 40); for (let k = 0; k < 3; k++) cutOut(g, () => archPath(g, 358 + k * 17, py - 52, 10, 26));
    g.fillStyle = col; g.fillRect(348, py - 64, 64, 6);
    // HITEC City: Cyber Towers (rounded glass block) and glass towers
    fillerBlocks(g, r, t, col, base, 800, LAYER_W, 40, 130, [[1060, 1180]], 0.6);
    g.fillStyle = col; rr(g, 1060, base - 150, 120, 190, 50); g.fill();
    g.fillStyle = 'rgba(255,255,255,.12)'; for (let y = base - 130; y < base; y += 12) g.fillRect(1064, y, 112, 3);
    litWindows(g, r, 1066, base - 130, 108, 128, t.lights * 0.8);
    g.fillStyle = col; g.fillRect(0, base, LAYER_W, h - base);
    return c;
  },
  near(paint, t, seed) {
    const { mk, ell, mulberry32, LAYER_W, fillerBlocks, waterBand, cutOut, archPath, onion } = paint;
    const h = 200, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed), base = h - 34, col = t.near;
    fillerBlocks(g, r, t, col, base, 0, LAYER_W, 20, 55, [[500, 760], [1180, 1420], [1560, 1760]]);
    // Charminar
    const cx = 630, bw = 130;
    g.fillStyle = col; g.fillRect(cx - bw / 2, base - 80, bw, 120); g.fillRect(cx - bw / 2 - 4, base - 84, bw + 8, 8);
    g.fillRect(cx - bw / 2 + 8, base - 104, bw - 16, 22);
    cutOut(g, () => archPath(g, cx - 26, base - 66, 52, 100));
    for (let k = 0; k < 6; k++) cutOut(g, () => archPath(g, cx - bw / 2 + 14 + k * 18, base - 100, 9, 14));
    g.fillStyle = col;
    for (const mx of [cx - bw / 2 - 2, cx + bw / 2 + 2]) {
      g.fillRect(mx - 8, base - 176, 16, 216);
      for (const by of [base - 84, base - 118, base - 150]) g.fillRect(mx - 12, by, 24, 6);
      onion(g, mx, base - 176, 10); g.fillRect(mx - 1, base - 206, 2, 12);
    }
    onion(g, cx, base - 104, 12);
    // Birla Mandir on its hillock
    g.beginPath(); g.moveTo(1560, base + 10); g.quadraticCurveTo(1660, base - 60, 1760, base + 10); g.fill();
    for (const [dx, th] of [[-30, 36], [0, 62], [30, 36]]) { g.beginPath(); g.moveTo(1660 + dx - 12, base - 40); g.lineTo(1660 + dx, base - 40 - th); g.lineTo(1660 + dx + 12, base - 40); g.fill(); }
    waterBand(g, r, t, base, h, t.lights > 0);
    // Buddha statue on the Hussain Sagar islet
    g.fillStyle = col; ell(g, 1300, base + 16, 50, 7); g.fill();
    g.fillRect(1284, base - 8, 32, 22); g.fillRect(1290, base - 58, 20, 52); ell(g, 1300, base - 64, 8, 9); g.fill();
    return c;
  },
});
