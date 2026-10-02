'use strict';
// Delhi: Qutub Minar, Lotus Temple far; Rashtrapati Bhavan, India Gate, Red Fort, Jama Masjid near.
// Two parallax layers, each tiling horizontally at LAYER_W px. The painters draw with the kit game.js
// passes in (paint); t is the track's look and seed its road seed.
RRR.skylines.register({
  id: 'delhi',
  far(paint, t, seed) {
    const { mk, ell, shade, lerp, mulberry32, LAYER_W, fillerBlocks, trees } = paint;
    const h = 230, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed), base = h - 30, col = t.far;
    fillerBlocks(g, r, t, col, base, 0, LAYER_W, 18, 60, [[260, 360], [1020, 1200]]);
    trees(g, r, shade(col, -0.05), base, 0, LAYER_W, 60);
    // Qutub Minar: tapered, banded, with balconies
    g.fillStyle = col; g.beginPath(); g.moveTo(290, base + 30); g.lineTo(300, base - 190); g.lineTo(318, base - 190); g.lineTo(328, base + 30); g.fill();
    for (const k of [0.25, 0.48, 0.68, 0.84]) { const y = base - 190 * k, half = lerp(19, 9, k) + 4; g.fillRect(309 - half, y - 3, half * 2, 5); }
    g.fillRect(304, base - 202, 10, 12); ell(g, 309, base - 203, 6, 4); g.fill();
    // Lotus Temple: overlapping pointed petals
    const lx = 1110;
    for (const [layer, spread, hgt] of [[0, 22, 70], [1, 16, 56], [2, 10, 40]]) {
      g.fillStyle = shade(col, 0.06 - layer * 0.04);
      for (let i = -3; i <= 3; i++) {
        const px = lx + i * spread, tip = base - hgt + Math.abs(i) * 6;
        g.beginPath(); g.moveTo(px - spread * 0.8, base); g.quadraticCurveTo(px - spread * 0.6, tip + 18, px, tip); g.quadraticCurveTo(px + spread * 0.6, tip + 18, px + spread * 0.8, base); g.fill();
      }
    }
    g.fillStyle = col; g.fillRect(0, base, LAYER_W, h - base);
    return c;
  },
  near(paint, t, seed) {
    const { mk, shade, mulberry32, LAYER_W, fillerBlocks, trees, cutOut, archPath, onion } = paint;
    const h = 200, c = mk(LAYER_W, h), g = c.getContext('2d'), r = mulberry32(seed), base = h - 34, col = t.near;
    fillerBlocks(g, r, t, col, base, 0, LAYER_W, 16, 44, [[80, 330], [480, 640], [930, 1380], [1540, 1760]]);
    trees(g, r, shade(col, 0.04), base, 0, LAYER_W, 40);
    g.fillStyle = col;
    // Rashtrapati Bhavan: long colonnade, dome on a drum
    g.fillRect(90, base - 40, 230, 80); g.fillRect(170, base - 60, 70, 22); g.beginPath(); g.arc(205, base - 60, 28, Math.PI, 0); g.fill(); g.fillRect(203, base - 98, 4, 12);
    g.fillStyle = 'rgba(255,255,255,.12)'; for (let x = 100; x < 316; x += 9) g.fillRect(x, base - 34, 3, 30);
    // India Gate
    g.fillStyle = col; const ix = 560;
    g.fillRect(ix - 58, base - 112, 116, 152); g.fillRect(ix - 64, base - 118, 128, 8); g.fillRect(ix - 40, base - 132, 80, 16); g.fillRect(ix - 26, base - 142, 52, 10);
    g.beginPath(); g.arc(ix, base - 142, 18, Math.PI, 0); g.fill();
    cutOut(g, () => archPath(g, ix - 26, base - 88, 52, 130));
    // Red Fort: crenellated wall, Lahori Gate with chhatris
    g.fillStyle = col; g.fillRect(940, base - 52, 440, 92);
    for (let x = 942; x < 1378; x += 12) g.fillRect(x, base - 60, 7, 8);
    g.fillRect(1120, base - 86, 80, 40);
    cutOut(g, () => archPath(g, 1144, base - 62, 32, 100));
    g.fillStyle = col;
    for (const x of [1128, 1160, 1192]) { g.fillRect(x - 7, base - 102, 14, 16); g.beginPath(); g.arc(x, base - 102, 8, Math.PI, 0); g.fill(); }
    for (const x of [950, 1370]) { g.fillRect(x - 10, base - 82, 20, 32); g.beginPath(); g.arc(x, base - 82, 11, Math.PI, 0); g.fill(); }
    // Jama Masjid: three onion domes between two minarets
    const jx = 1650;
    g.fillRect(jx - 90, base - 44, 180, 84);
    onion(g, jx, base - 44, 26); onion(g, jx - 52, base - 44, 18); onion(g, jx + 52, base - 44, 18);
    for (const mx of [jx - 96, jx + 96]) { g.fillRect(mx - 6, base - 130, 12, 170); onion(g, mx, base - 130, 8); g.fillRect(mx - 9, base - 96, 18, 4); }
    g.fillStyle = t.sea; g.fillRect(0, base + 4, LAYER_W, h - base);
    g.fillStyle = shade(t.sea, 0.06); for (let x = 0; x < LAYER_W; x += 60) g.fillRect(x, base + 4, 30, h - base);
    return c;
  },
});
