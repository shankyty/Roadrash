'use strict';
// Draws the road, sky and sprites (2D) and hands the 3D world to web/world3d/.
// ------------------------------------------------------------------ rendering
function poly(x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill();
}

function drawSegment(seg, n) {
  const col = seg.dark ? theme.dark : theme.light;
  const x1 = seg.p1.screen.x, y1 = seg.p1.screen.y, u1 = seg.p1.screen.w;
  const x2 = seg.p2.screen.x, y2 = seg.p2.screen.y, u2 = seg.p2.screen.w;
  const w1 = u1 * seg.hw1, w2 = u2 * seg.hw2; // this stretch's road half-width (4 or 6 lanes)
  if (seg.junction) { ctx.fillStyle = col.road; ctx.fillRect(0, y2, W, y1 - y2 + 1); return; } // the cross road
  ctx.fillStyle = col.grass; ctx.fillRect(0, y2, W, y1 - y2 + 1);
  const fp = footpath(), sw = fp ? fp.width : 0.35; // the footpath (or, without one, the old narrow paved strip)
  const r1 = u1 / 6, r2 = u2 / 6, s1 = u1 * sw, s2 = u2 * sw;
  poly(x1 - w1 - r1 - s1, y1, x1 - w1 - r1, y1, x2 - w2 - r2, y2, x2 - w2 - r2 - s2, y2, col.shoulder);
  poly(x1 + w1 + r1 + s1, y1, x1 + w1 + r1, y1, x2 + w2 + r2, y2, x2 + w2 + r2 + s2, y2, col.shoulder);
  if (fp) for (const sd of [-1, 1]) { const k1 = u1 * 0.035, k2 = u2 * 0.035; // the kerb's shadowed face
    poly(x1 + sd * (w1 + r1), y1, x1 + sd * (w1 + r1 + k1), y1, x2 + sd * (w2 + r2 + k2), y2, x2 + sd * (w2 + r2), y2, 'rgba(0,0,0,.3)'); }
  poly(x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, col.rumble);
  poly(x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, col.rumble);
  poly(x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, col.road);
  if (seg.finish) {
    const cells = 12, phase = seg.finish === 2 ? 1 : 0;
    for (let i = 0; i < cells; i++) {
      if ((i + phase) % 2) continue;
      const a1 = x1 - w1 + (2 * w1 * i) / cells, b1 = x1 - w1 + (2 * w1 * (i + 1)) / cells;
      const a2 = x2 - w2 + (2 * w2 * i) / cells, b2 = x2 - w2 + (2 * w2 * (i + 1)) / cells;
      poly(a1, y1, b1, y1, b2, y2, a2, y2, '#f5f5f5');
    }
    return;
  }
  // double yellow centre line (solid), dashed white lines between the lanes of each direction
  const l1 = u1 / 40, l2 = u2 / 40;
  for (const o of [-0.03, 0.03]) poly(x1 + o * u1 - l1 / 2, y1, x1 + o * u1 + l1 / 2, y1, x2 + o * u2 + l2 / 2, y2, x2 + o * u2 - l2 / 2, y2, '#f2c200');
  if (col.lane) for (const side of [-1, 1]) for (let i = 1; i < seg.lanes; i++) {
    const o = side * i * LANE_W;
    poly(x1 + o * u1 - l1 / 2, y1, x1 + o * u1 + l1 / 2, y1, x2 + o * u2 + l2 / 2, y2, x2 + o * u2 - l2 / 2, y2, col.lane);
  }
}

// Clouds: a wrap-around layer painted once per theme from soft puffs, lit on top (the sun's colour at
// sunset), shaded underneath by the sky; thin and faint at night. Drifts slowly and swings with the curves.
let cloudCanvas = null, cloudTheme = null;
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function cloudLayer() {
  if (cloudTheme === theme) return cloudCanvas;
  cloudTheme = theme;
  const c = mk(W * 2, Math.round(H * 0.42)), g = c.getContext('2d'), r = mulberry32(17), night = !!theme.night;
  const lit = night ? '#5a6890' : theme.sun, base = night ? '#252d4a' : theme.sky[1], alpha = night ? 0.3 : 0.75;
  for (let i = 0; i < (night ? 6 : 12); i++) {
    const cx = r() * c.width, cy = c.height * (0.2 + r() * 0.55), w = 130 + r() * 240, h = w * (0.2 + r() * 0.12);
    for (let k = 0; k < 10; k++) {
      const px = cx + (r() - 0.5) * w, py = cy + (r() - 0.65) * h, pr = h * (0.45 + r() * 0.7);
      for (const dx of [0, c.width, -c.width]) {
        const gr = g.createRadialGradient(px + dx, py - pr * 0.35, pr * 0.1, px + dx, py, pr);
        gr.addColorStop(0, hexA(night ? lit : '#ffffff', alpha)); gr.addColorStop(0.45, hexA(lit, alpha * 0.65));
        gr.addColorStop(0.8, hexA(base, alpha * 0.35)); gr.addColorStop(1, hexA(base, 0));
        g.fillStyle = gr; g.fillRect(px + dx - pr, py - pr, pr * 2, pr * 2);
      }
    }
  }
  return (cloudCanvas = c);
}
function drawBackground(ctx, hz) {
  const g = ctx.createLinearGradient(0, 0, 0, hz * 1.1);
  g.addColorStop(0, theme.sky[0]); g.addColorStop(0.6, theme.sky[1]); g.addColorStop(1, theme.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const sx = W * (0.72 - skyOffset * 0.5), sy = hz * (theme.night ? 0.32 : 0.54);
  if (theme.night) {
    const r = mulberry32(5);
    for (let i = 0; i < 90; i++) { ctx.globalAlpha = 0.3 + r() * 0.7; ctx.fillStyle = '#fff'; ctx.fillRect(((r() - skyOffset * 0.3) % 1 + 1) % 1 * W, r() * H * 0.4, 1.5, 1.5); }
    ctx.globalAlpha = 1;
  }
  const glow = theme.night ? 60 : 120, disc = theme.night ? 20 : 34;
  const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, glow);
  sg.addColorStop(0, theme.sun); sg.addColorStop(0.25, theme.sun + (theme.night ? '55' : 'aa')); sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg; ctx.fillRect(sx - glow, sy - glow, glow * 2, glow * 2);
  ctx.fillStyle = theme.sun; ctx.beginPath(); ctx.arc(sx, sy, disc, 0, Math.PI * 2); ctx.fill();
  if (theme.night) { // crescent: shade part of the disc only
    ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, disc, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = theme.sky[1]; ctx.beginPath(); ctx.arc(sx + 9, sy - 6, disc * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  const cl = cloudLayer(), co = ((skyOffset * 0.35 + performance.now() / 600000) % 1 + 1) % 1;
  ctx.drawImage(cl, -co * cl.width, hz * 0.04); ctx.drawImage(cl, (1 - co) * cl.width, hz * 0.04);
  const layer = (img, off, bottom) => {
    const lw = img.width, x0 = -Math.floor(off * lw);
    for (let x = x0; x < W; x += lw) ctx.drawImage(img, x, bottom - img.height);
    if (x0 > 0) ctx.drawImage(img, x0 - lw, bottom - img.height);
  };
  layer(bgLayers.far, farOffset, hz + 30);
  layer(bgLayers.near, nearOffset, hz + 50);
  ctx.fillStyle = theme.fog; ctx.fillRect(0, hz + 50, W, H);
}

function drawSprite(img, destX, destY, destW, destH, clipY) {
  const clipH = clipY ? Math.max(0, destY + destH - clipY) : 0;
  if (clipH >= destH || destW < 1) return;
  ctx.drawImage(img, 0, 0, img.width, img.height - (img.height * clipH / destH), destX, destY, destW, destH - clipH);
}

// An attack drawn on top of a tuk-tuk sprite rect: the arm swings whatever the driver fights with (weapon.shape),
// or a leg shoots out of the side of the auto (weapon.kind 'kick').
function drawAttack(x, y, w, h, atk, weapon) {
  const side = atk.side, p = clamp(atk.t / atk.dur, 0, 1), kick = weapon.kind === 'kick';
  const line = (x0, y0, x1, y1, color, width) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  // The move seen from behind: z is the angle on screen, a sweep forward or back (y) foreshortens the limb and
  // lifts or drops it a little, and a thrust (ext) slides the hand out along it.
  const px = x + w * (0.5 + side * (kick ? 0.36 : 0.34)), py = y + h * (kick ? 0.6 : 0.3), limb = kick ? 0.42 : 0.28;
  const frame = k => {
    const q = attackPoseAt(weapon, k), f = Math.max(0.35, Math.cos(q.y)), a = -q.z;
    const dx = Math.cos(a) * side, dy = Math.sin(a), oy = py - Math.sin(q.y) * h * 0.05, r = limb * f + q.ext / 2000;
    return { f, dx, dy, ox: px, oy, hx: px + dx * w * r, hy: oy + dy * w * r };
  };
  // the path the end of it has just travelled
  const trail = reach => {
    if (p <= 0.12 || p >= 0.9) return;
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = w * 0.02; ctx.beginPath();
    for (let i = 0; i <= 6; i++) { const q = frame(p - 0.3 * (1 - i / 6)), tx = q.hx + q.dx * w * reach * q.f, ty = q.hy + q.dy * w * reach * q.f; if (i) ctx.lineTo(tx, ty); else ctx.moveTo(tx, ty); }
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  const { f, dx, dy, ox: sx, oy: sy, hx, hy } = frame(p), nx = -dy, ny = dx; // along the limb, and across it
  if (kick) { // a leg out of the side of the auto
    line(sx, sy, hx, hy, weapon.color, w * 0.09);
    line(hx, hy, hx - dy * side * w * 0.07, hy - Math.abs(dx) * w * 0.07, '#1a1a1a', w * 0.075); // the shoe, toes up
    trail(0.04);
    return;
  }
  const at = t => [hx + dx * w * t * f, hy + dy * w * t * f];
  line(sx, sy, sx + (hx - sx) * 0.43, sy + (hy - sy) * 0.43, atk.sleeve || '#3949ab', w * 0.07);
  line(sx + (hx - sx) * 0.36, sy + (hy - sy) * 0.36, hx, hy, '#8d5524', w * 0.05);
  const c = weapon.color, shape = weapon.shape;
  let len = 0.5; // how far the weapon reaches past the hand, in sprite widths (for the swoosh)
  if (shape === 'bat') {
    line(...at(-0.04), ...at(0.14), '#6d4c41', w * 0.028);
    ctx.lineCap = 'butt'; line(...at(0.13), ...at(0.46), c, w * 0.085); ctx.lineCap = 'round'; len = 0.46;
  } else if (shape === 'hockey') {
    line(...at(-0.06), ...at(0.52), c, w * 0.035);
    const [ex, ey] = at(0.52); line(ex, ey, ex + nx * side * w * 0.1 + dx * w * 0.03, ey + ny * side * w * 0.1 + dy * w * 0.03, c, w * 0.045); len = 0.54;
  } else if (shape === 'umbrella') {
    line(...at(-0.05), ...at(0.5), '#8d6e63', w * 0.018);
    line(...at(0.07), ...at(0.44), c, w * 0.06);
    const [kx, ky] = at(-0.05); ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = w * 0.02; ctx.beginPath(); ctx.arc(kx + nx * w * 0.025, ky + ny * w * 0.025, w * 0.025, 0, Math.PI * 2); ctx.stroke();
  } else if (shape === 'cane') {
    line(...at(-0.04), ...at(0.42), c, w * 0.024); len = 0.42;
    ctx.fillStyle = '#d4af37'; ctx.beginPath(); ctx.arc(...at(-0.04), w * 0.022, 0, Math.PI * 2); ctx.fill();
  } else if (shape === 'cloth') { // a wet gamchha: it trails behind the hand, then cracks out straight
    const wob = (1 - Math.min(1, p / moveOf(weapon).at)) * w * 0.16 * side, [mx, my] = at(0.28), [ex, ey] = at(0.56);
    ctx.lineCap = 'butt'; ctx.strokeStyle = c; ctx.lineWidth = w * 0.085; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(mx - nx * wob, my - ny * wob, ex, ey); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = w * 0.085; ctx.setLineDash([w * 0.018, w * 0.11]); ctx.lineDashOffset = -w * 0.08; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(mx - nx * wob, my - ny * wob, ex, ey); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineDashOffset = 0; ctx.lineCap = 'round';
    len = 0.56;
  } else if (shape === 'shoe') {
    line(...at(0.0), ...at(0.15), c, w * 0.07);
    const [tx, ty] = at(0.17); line(tx, ty, tx + nx * side * w * 0.035, ty + ny * side * w * 0.035, c, w * 0.03); len = 0.18; // the curled toe
  } else if (shape === 'bag') {
    line(...at(0.0), ...at(0.18), '#555', w * 0.014);
    ctx.lineCap = 'butt'; line(...at(0.17), ...at(0.36), c, w * 0.15); ctx.lineCap = 'round';
    line(...at(0.2), ...at(0.33), '#9e9e9e', w * 0.012); len = 0.36;
  } else if (shape === 'dandiya') {
    for (const k of [-1, 1]) {
      const ox = nx * k * w * 0.03, oy = ny * k * w * 0.03, [ex, ey] = at(0.32);
      line(hx, hy, ex + ox, ey + oy, c, w * 0.026);
      for (const t of [0.1, 0.2]) { const [bx, by] = at(t); line(bx + ox * t * 3 - dx, by + oy * t * 3 - dy, bx + ox * t * 3 + dx, by + oy * t * 3 + dy, '#ffd21f', w * 0.028); }
    }
    len = 0.32;
  } else if (shape === 'hand') {
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(...at(0.03), w * 0.05, 0, Math.PI * 2); ctx.fill(); len = 0.06;
  } else { // lathi
    const [ex, ey] = at(0.5);
    line(hx - dx * w * 0.06, hy - dy * w * 0.06, ex, ey, c, w * 0.035);
    for (const t of [0.3, 0.6, 0.9]) { const bx = lerp(hx, ex, t), by = lerp(hy, ey, t); line(bx - dx * 2, by - dy * 2, bx + dx * 2, by + dy * 2, '#6d4c41', w * 0.037); }
  }
  if (shape !== 'hand') { ctx.fillStyle = '#8d5524'; ctx.beginPath(); ctx.arc(hx, hy, w * 0.035, 0, Math.PI * 2); ctx.fill(); }
  trail(len);
}
// Neon strip lights on a decked-out auto, at night: a glow on the road under it and bright lines along the foot
// of the tub and the edge of the hood.
function drawNeon(x, y, w, h, color) {
  const cx = x + w / 2, gy = y + h * 0.93, g = ctx.createRadialGradient(cx, gy, 0, cx, gy, w * 0.75);
  g.addColorStop(0, hexA(color, 0.8)); g.addColorStop(0.5, hexA(color, 0.3)); g.addColorStop(1, hexA(color, 0));
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.translate(cx, gy); ctx.scale(1, 0.26); ctx.translate(-cx, -gy);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, gy, w * 0.95, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawNeonStrips(x, y, w, h, color) {
  ctx.save(); ctx.lineCap = 'round'; ctx.shadowColor = color; ctx.shadowBlur = Math.max(6, w * 0.18);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, w * 0.026);
  for (const [fy, x0, x1] of [[0.815, 0.1, 0.9], [0.487, 0.1, 0.9]]) { ctx.beginPath(); ctx.moveTo(x + w * x0, y + h * fy); ctx.lineTo(x + w * x1, y + h * fy); ctx.stroke(); }
  ctx.restore();
}

function drawTuk(img, x, y, w, h, rot, atk, hurt, who) {
  const neon = theme.night && who && who.driver && who.driver.look.neon;
  ctx.save();
  if (hurt > 0) x += Math.sin(hurt * 90) * w * 0.04; // shudder when hit
  if (rot) {
    const px = x + w * (rot > 0 ? 0.9 : 0.1), py = y + h * 0.93;
    ctx.translate(px, py); ctx.rotate(rot); ctx.translate(-px, -py);
  }
  if (neon) drawNeon(x, y, w, h, neon);
  ctx.drawImage(img, x, y, w, h);
  if (neon) drawNeonStrips(x, y, w, h, neon);
  if (atk) drawAttack(x, y, w, h, atk, (who && who.weapon) || LATHI);
  ctx.restore();
}

function render() {
  frameNo++;
  ctx.save();
  if (use3D && !render3D()) disable3D();
  if (!use3D) {
    if (shake > 0) ctx.translate(rand(-1, 1) * shake * 14, rand(-1, 1) * shake * 10);
    drawBackground(ctx, H / 2);
    renderWorld2D();
  }
  // particles
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.t * 1.5, 0, 1); ctx.fillStyle = p.color;
    const sz = p.size + (p.grow ? (0.7 - p.t) * p.grow : 0);
    ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  guardDraw('ui', drawPopups);
  guardDraw('ui', drawBubbles);
  guardDraw('ui', () => {
    if (state === 'title') drawTitle();
    else if (state === 'champion') drawChampion();
    else { drawHUD(); if (state === 'countdown') drawCountdown(); if (state === 'results') drawResults(); }
  });
  guardDraw('ui', () => { if (paused) drawPaused(); else drawMessages(); });
  guardDraw('ui', () => { if (mixer) drawMixer(); else drawSoundHint(); });
}

// 3D mode: sky on its own canvas, the world in WebGL, and this canvas cleared for the UI on top
function render3D() {
  try {
    drawBackground(bgCtx, World3D.horizonY());
    const info = World3D.frame({ player, rivals, traffic, frameNo, shake, t: performance.now() / 1000, cross: crossTraffic, lightOf, marks: skidMarks, now: worldT });
    playerScr = info ? info.player : null;
    ctx.clearRect(0, 0, W, H);
    return true;
  } catch (err) {
    reportProblem('renderer', '3D frame failed, switching to 2D', err);
    return false;
  }
}
function disable3D() {
  use3D = false; playerScr = null;
  if (bgCanvas) bgCanvas.style.display = 'none';
  if (glCanvas) glCanvas.style.display = 'none';
}

// the original pseudo-3D renderer (used when WebGL isn't available)
function renderWorld2D() {
  const baseSeg = findSegment(position);
  const basePct = pctRemaining(position, SEG_LEN);
  const playerSeg = findSegment(position + PLAYER_Z);
  const playerPct = pctRemaining(position + PLAYER_Z, SEG_LEN);
  const playerY = lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPct);
  let maxy = H, x = 0, dx = -(baseSeg.curve * basePct);

  // bucket cars into segments
  const touched = [];
  const bucket = (car, z) => { const s = findSegment(z); s.cars.push(car); car._z = ((z % trackLength) + trackLength) % trackLength; touched.push(s); };
  for (const c of traffic) bucket(c, c.z);
  for (const r of rivals) bucket(r, r.dist);

  for (let n = 0; n < DRAW_DIST; n++) {
    const seg = segments[(baseSeg.index + n) % segments.length];
    const looped = seg.index < baseSeg.index;
    seg.clip = maxy; seg.n = n;
    const camZ = position - (looped ? trackLength : 0);
    project(seg.p1, player.x * ROAD_W - x, playerY + CAM_H, camZ);
    project(seg.p2, player.x * ROAD_W - x - dx, playerY + CAM_H, camZ);
    x += dx; dx += seg.curve;
    if (seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
    drawSegment(seg, n);
    maxy = seg.p1.screen.y;
    maxy = seg.p2.screen.y;
  }

  for (let n = DRAW_DIST - 1; n > 0; n--) {
    const seg = segments[(baseSeg.index + n) % segments.length];
    for (const s of seg.sprites) {
      const scale = seg.p1.screen.scale;
      const destW = s.nw * ROAD_W * scale * W / 2, destH = destW * s.img.height / s.img.width;
      const sx = seg.p1.screen.x + scale * s.offset * ROAD_W * W / 2;
      const ox = s.center ? -0.5 : (s.offset < 0 ? -1 : 0);
      drawSprite(s.img, sx + destW * ox, seg.p1.screen.y - destH, destW, destH, seg.clip);
      if (s.kind === 'chai' || s.kind === 'building') s.scr = { x: sx + destW * (ox + 0.5), y: seg.p1.screen.y - destH * (s.kind === 'chai' ? 0.75 : 0.3), w: destW, frame: frameNo };
    }
    if (seg.cars.length > 1) seg.cars.sort((a, b) => b._z - a._z);
    for (const car of seg.cars) {
      const pct = pctRemaining(car._z, SEG_LEN);
      const scale = lerp(seg.p1.screen.scale, seg.p2.screen.scale, pct);
      const cx = lerp(seg.p1.screen.x, seg.p2.screen.x, pct) + scale * car.x * ROAD_W * W / 2;
      const cy = lerp(seg.p1.screen.y, seg.p2.screen.y, pct);
      const destW = car.nw * ROAD_W * scale * W / 2, destH = destW * car.img.height / car.img.width;
      if (destW < 1 || !(scale > 0)) continue;
      if (car.isRival) {
        const bounce = car.speed > 0 ? Math.sin(performance.now() / 45 + car.dist) * destH * 0.006 : 0;
        const y = cy - destH + bounce + hitRock(car) * destH - scale * (car.y || 0) * H / 2; // (up in a jump)
        if (y + destH <= seg.clip + destH * 0.5) drawTuk(car.img, cx - destW / 2, y, destW, destH, car.rot, car.atk, car.hurt, car);
        car.scr = { x: cx, y: cy - destH * 1.1, w: destW, frame: frameNo };
      } else { drawSprite(car.img, cx - destW / 2, cy - destH, destW, destH, seg.clip); car.scr = { x: cx, y: cy - destH * 1.2, w: destW, frame: frameNo }; }
    }
    if (seg === playerSeg) drawPlayer(playerSeg, playerPct);
  }
  for (const s of touched) s.cars.length = 0;
}

function drawPlayer(seg, pct) {
  const scale = CAM_DEPTH / PLAYER_Z;
  const destW = TUK_NW * ROAD_W * scale * W / 2, destH = destW * player.img.height / player.img.width;
  const camY = lerp(seg.p1.camera.y, seg.p2.camera.y, pct);
  const sp = player.speed / MAX_SPEED;
  const bumpy = zoneOf(seg, player.x) === 'grass' ? 4 : 1.2; // the footpath rides as smoothly as the road
  const bounce = player.crash > 0 || player.y > 0 ? 0 : (Math.random() - 0.5) * bumpy * sp * 2;
  const lift = scale * player.y * H / 2, ground = H / 2 - (scale * camY * H / 2); // in a jump the auto rises above its shadow
  const y = ground - destH + bounce + hitRock(player) * destH - lift;
  if (player.inv > 0 && Math.floor(player.inv * 10) % 2) return;
  if (lift > 2) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(W / 2, ground - 4, destW * 0.42, destW * 0.08, 0, 0, Math.PI * 2); ctx.fill(); }
  drawTuk(player.img, W / 2 - destW / 2, y, destW, destH, player.rot, player.atk, player.hurt, player);
}
