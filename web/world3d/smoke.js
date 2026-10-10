'use strict';
// Exhaust smoke.
// ---------------------------------------------------------------- exhaust smoke
// Two-stroke smoke puffs from the tail pipe, in the world (so the auto hides the ones behind it and they
// stay where they were puffed out). Standing: faint, almost white, hanging by the pipe and spreading.
// Steady speed: whitish grey, left behind on the road as a trail. Accelerating: thicker and a bit darker.
const SMOKE_N = 90, smoke = [];
let smokeTex = null, smokeT = null, smokeGap = 0, lastSpeed = 0, accel = 0;
function smokeTexture() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return (smokeTex = new T.CanvasTexture(c));
}
function updateSmoke(player, t) {
  const dt = smokeT == null ? 0 : Math.min(0.1, Math.max(0, t - smokeT)); smokeT = t;
  if (!smoke.length) for (let i = 0; i < SMOKE_N; i++) {
    const sp = new T.Sprite(new T.SpriteMaterial({ map: smokeTexture(), transparent: true, depthWrite: false, opacity: 0 }));
    sp.visible = false; sp.userData.p = { life: 0, age: 1 }; scene.add(sp); smoke.push(sp);
  }
  const sp = player.speed / cfg.MAX_SPEED;
  if (dt > 0) accel += (Math.max(0, (player.speed - lastSpeed) / dt / cfg.MAX_SPEED) - accel) * Math.min(1, dt * 6);
  lastSpeed = player.speed;
  const hard = Math.min(1, accel * 2.5);                     // 0 cruising / idling .. 1 flooring it
  // emit from the pipe under the right rear of the tub
  smokeGap -= dt;
  if (dt > 0 && player.crash <= 0 && smokeGap <= 0) {
    smokeGap = sp < 0.05 ? 0.16 : 0.035 + (1 - sp) * 0.04 - hard * 0.015;
    const puff = smoke.find(m => m.userData.p.age >= m.userData.p.life);
    if (puff) {
      const idle = sp < 0.05, q = puff.userData.p;
      // shade: white at idle, whitish grey cruising, darker grey accelerating
      const shade = idle ? 0.97 : 0.86 - hard * 0.3;
      Object.assign(q, {
        d: player.dist - 575, x: player.x + 190 / ROAD_W_3D, h: 95, age: 0,
        life: idle ? 1.6 : 0.9 + hard * 0.4,
        s0: idle ? 50 : 70, s1: idle ? 260 : 300 + hard * 160,
        op: idle ? 0.3 : 0.3 + hard * 0.25, shade,
        rise: idle ? 35 : 20, drift: (Math.random() - 0.5) * (idle ? 70 : 90), back: idle ? 40 : 0,
      });
      puff.visible = true;
    }
  }
  // tyre smoke off the rear wheels while drifting
  if (dt > 0 && Math.abs(player.slip || 0) > 0.2 && player.speed > 2400 && Math.random() < 0.7) {
    const puff = smoke.find(m => m.userData.p.age >= m.userData.p.life);
    if (puff) {
      const ang = (player.heading || 0) + player.slip, k = Math.random() < 0.5 ? -1 : 1;
      Object.assign(puff.userData.p, { d: player.dist - 340 * Math.cos(ang) - k * 240 * Math.sin(ang), x: player.x + (-340 * Math.sin(ang) + k * 240 * Math.cos(ang)) / ROAD_W_3D,
        h: 50, age: 0, life: 1.1, s0: 90, s1: 420, op: 0.32, shade: 0.94, rise: 30, drift: (Math.random() - 0.5) * 120, back: 0 });
      puff.visible = true;
    }
  }
  const lit = hemi.intensity / 0.95;
  for (const m of smoke) {
    const q = m.userData.p;
    if (q.age >= q.life) { m.visible = false; continue; }
    q.age += dt; const k = Math.min(1, q.age / q.life);
    q.h += q.rise * dt * (1 - k * 0.5); q.x += q.drift / ROAD_W_3D * dt; q.d -= q.back * dt;
    const dd = wrapD(q.d - camAbs);
    if (dd < 50) { m.visible = false; q.age = q.life; continue; }
    const p = placeAt(dd, q.x);
    m.position.set(p.x, p.y + q.h, p.z);
    const size = q.s0 + (q.s1 - q.s0) * Math.sqrt(k); m.scale.set(size, size, 1);
    m.material.opacity = q.op * Math.min(1, q.age * 8) * (1 - k) * (1 - k * 0.3);
    const c = q.shade * lit; m.material.color.setRGB(c, c, c * 1.02);
    m.visible = true;
  }
}

// nearest street lamps and headlights to your auto -> the night shader's uniforms
const lampCand = [], headCand = [];
function feedNightLights(pp, visible) {
  lampCand.length = 0; headCand.length = 0;
  for (const m of visible) {
    const u = m.userData;
    if (u.glow) {                                                  // street lamp: its head, out on the arm
      const a = m.rotation.y, lx = u.glow.position.x;
      lampCand.push({ x: m.position.x + lx * Math.cos(a), y: m.position.y + u.glow.position.y, z: m.position.z - lx * Math.sin(a) });
    } else if (u.headY && u.size) {                                // vehicle: beam from the front, dipped a little
      const b = m.rotation.y, fx = -Math.sin(b), fz = -Math.cos(b), h = u.size.l / 2;
      headCand.push({ x: m.position.x + fx * h, y: m.position.y + u.headY, z: m.position.z + fz * h, fx, fz });
    }
  }
  const d2 = c => (c.x - pp.x) ** 2 + (c.z - pp.z) ** 2;
  lampCand.sort((a, b) => d2(a) - d2(b)); headCand.sort((a, b) => d2(a) - d2(b));
  const L = nightU.uLamps.value, HP = nightU.uHeadP.value, HD = nightU.uHeadD.value;
  for (let i = 0; i < NL; i++) {
    const l = lampCand[i]; L[i].set(l ? l.x : 0, l ? l.y : 0, l ? l.z : 0, l ? 1.35 : 0);
    const h = headCand[i];
    if (h) { const n = Math.hypot(h.fx, 0.1, h.fz); HP[i].set(h.x, h.y, h.z, 1.3); HD[i].set(h.fx / n, -0.1 / n, h.fz / n, 4200); } else HP[i].w = 0;
  }
}
