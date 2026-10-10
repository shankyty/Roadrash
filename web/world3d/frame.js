'use strict';
// Draws one frame.
// ---------------------------------------------------------------- frame
let lastVisible = new Set();
function frame(state) {
  if (!ready || !segments3D.length) return null;
  const { player, rivals, traffic, frameNo, shake, t, cross = [], lightOf = null, marks = [], now = 0 } = state;
  if (warmQueue.length) warmStep(6);
  buildFrame(player);
  buildRoad();

  // camera: slight shake when hit/crashed
  camera.position.set(shake ? (Math.random() - 0.5) * shake * 60 : 0, shake ? (Math.random() - 0.5) * shake * 40 : 0, 0);
  camera.rotation.set(PITCH_RAD(), 0, 0);
  camera.updateMatrixWorld();

  const visible = new Set();
  // scenery on the visible segments
  const L = segments3D.length, maxSeg = Math.min(DRAW - 1, Math.floor(OBJ_FAR / SEG_LEN_3D), aroundIdx);
  for (let n = 0; n < maxSeg; n++) {
    const seg = segments3D[(baseIdx + n) % L];
    for (const s of seg.sprites) {
      let m = sceneryMeshes.get(s);
      if (!m) { m = sceneryModel(s); castShadows(m); sceneryMeshes.set(s, m); scene.add(m); }
      const side = s.offset < 0 ? -1 : 1, d = (n - camFrac) * SEG_LEN_3D;
      let p;
      if (s.kind === 'building') { const len = s.len || 1400; p = placeAt(d + len / 2, s.offset + side * 450 / ROAD_W_3D); }
      else if (s.kind === 'arch') p = placeAt(d, 0);
      else if (s.kind === 'lamp') p = placeAt(d, s.offset + side * 0.1);
      else if (s.kind === 'sign' || s.kind === 'signal' || s.kind === 'cop') p = placeAt(d, s.offset);
      else p = placeAt(d, s.offset + side * s.nw / 2);
      m.position.set(p.x, p.y + (s.onPath ? FP_H : 0), p.z); // (a stall or a cart stands on the footpath)
      m.rotation.y = -p.th + (s.kind === 'billboard' ? -side * 0.45 : s.kind === 'chai' ? -side * Math.PI / 2 : 0) + (s.facing === -1 ? Math.PI : 0); // (a stall faces the road)
      if (s.kind === 'signal' && lightOf) { const L = lightOf(s.junction); for (const k of ['R', 'A', 'G']) for (const lm of m.userData.lamps[k]) lm.material = sigMat[k][k === L ? 1 : 0]; }
      if (s.kind === 'cop') m.userData.wave.rotation.z = -1.2 - Math.sin(t * 5) * 0.5;
      m.visible = true; visible.add(m);
      if (s.kind === 'building' || s.kind === 'chai') {
        const sz = m.userData.size;
        const facade = placeAt(d + (s.kind === 'building' ? (s.len || 1400) / 2 : 0), s.offset);
        const q = { x: facade.x, y: facade.y, z: facade.z, th: facade.th };
        screenOf(s, q, s.kind === 'chai' ? sz.h * 0.7 : Math.min(sz.h, 900), s.kind === 'chai' ? sz.w : sz.l, frameNo);
      }
    }
  }
  // vehicles and animals
  const place = (obj, d, x) => {
    if (d < -800 || d > OBJ_FAR || d > aroundIdx * SEG_LEN_3D) { release(obj); return null; }
    const m = modelFor(obj); if (!m) return null;
    setLod(m, d > TIER.lod[1] ? 2 : d > TIER.lod[0] ? 1 : 0);
    m.visible = true; visible.add(m); return m;
  };
  for (const r of rivals) {
    const dd = wrapD(r.dist - (camAbs));
    const m = place(r, dd, r.x); if (!m) continue;
    const bounce = (r.speed > 0 ? Math.sin(t * 22 + r.dist) * 6 : 0) + cfg.hitRock(r) * 900;
    const p = placeAuto(r, m, dd, r.x, r.rot || 0, r.atk, r.hurt, bounce);
    screenOf(r, p, 900, 560, frameNo);
  }
  for (const c of traffic) {
    const dd = wrapD(c.z - camAbs);
    const m = place(c, dd, c.x); if (!m) continue;
    const animal = c.type === 'cow' || c.type === 'dog';
    const p = onGround(placeAt(dd, c.x), dd, c.x, animal ? m.userData.size.w : m.userData.size.l);
    const back = c.dir === -1, sy = animal ? 0 : steerYaw(c, c.z, c.x);
    let yaw = back ? -p.th + Math.PI + sy : -p.th - sy; // oncoming vehicles face us
    if (c.type === 'cow') yaw += (c.vx || 0) > 0 ? -Math.PI / 2 : Math.PI / 2;
    if (c.type === 'dog') {
      if (c.mode === 'cross') yaw += (c.vx || 0) > 0 ? -Math.PI / 2 : Math.PI / 2;
      else if (c.mode === 'sit' || c.mode === 'sleep') yaw += c.x > 0 ? Math.PI / 2 : -Math.PI / 2;
      m.scale.y = c.mode === 'sleep' ? 0.45 : 1;
      for (const leg of m.userData.legs) leg.visible = c.mode !== 'sleep';
    }
    const lean = c.type === 'bike' ? (back ? 1 : -1) * sy * (c.rash ? 2.4 : 1.4) : 0;   // bikes lean into lane changes
    // rash bikers pop the odd wheelie (front up about the rear wheel)
    const wp = c.rash && c.speed > 0 ? (t * 0.22 + (c.z % 997) / 997) % 1 : 1, wh = wp < 0.14 ? Math.sin(wp / 0.14 * Math.PI) * 0.32 : 0;
    m.position.set(p.x, p.y + Math.sin(wh) * 268 + (animal ? pathLift(dd, c.x) : 0), p.z); m.rotation.set((animal ? 0 : back ? -p.pitch : p.pitch) + wh, yaw, lean, 'YXZ');
    if (c.type === 'cow' || c.type === 'dog') walk(m, t * (c.type === 'dog' ? 14 : 6), c.type === 'dog' ? (c.mode === 'chase' || c.mode === 'cross' ? 1 : 0) : (c.pause > 0 ? 0 : Math.abs(c.vx || 0)));
    else {
      spinWheels(m, c.z);
      const ind = m.userData.ind, sx = (c.signalX || 0) * (back ? -1 : 1), on = sx && (t * 2.6) % 1 < 0.55; // model's own left/right
      if (ind) for (const side of ['-1', '1']) for (const lamp of ind[side]) lamp.material = on && +side === sx ? indOn : indOff;
    }
    const sz = m.userData.size; screenOf(c, p, sz.h * 1.05, sz.w, frameNo);
  }
  // cross traffic at junctions: driving across the road (along x)
  for (const c of cross) {
    const dd = wrapD(c.z - camAbs);
    const m = place(c, dd, c.x); if (!m) continue;
    const p = placeAt(dd, c.x);
    m.position.set(p.x, p.y + 4, p.z); m.rotation.set(0, -p.th - c.dirX * Math.PI / 2, 0, 'YXZ');
    spinWheels(m, c.x * ROAD_W_3D);
    if (m.userData.arm) m.userData.arm.visible = false;
  }
  // the player's auto
  const pm = modelFor(player);
  // the ride: rough on the grass, smooth on the road and the footpath, still in a jump (a track without a
  // footpath keeps the shake it always had)
  const bump = player.crash > 0 || player.y > 0 ? 0 : (Math.random() - 0.5) * ((cfg.footpath ? zoneOf3D(cam.back, player.x) === 'grass' : Math.abs(player.x) > 1) ? 18 : 5) * (player.speed / cfg.MAX_SPEED);
  const pp = placeAuto(player, pm, cam.back, player.x, player.rot || 0, player.atk, player.hurt, bump + cfg.hitRock(player) * 900);
  pm.visible = !(player.inv > 0 && Math.floor(player.inv * 10) % 2); visible.add(pm);
  for (const m of lastVisible) if (!visible.has(m)) m.visible = false;
  lastVisible = visible;
  updateSmoke(player, t);
  updateMarks(marks, now);
  if (nightU.uNight.value) feedNightLights(pp, visible);
  if (TIER.shadow) {                                           // the shadow box follows you, reaching mostly ahead
    const day = !nightU.uNight.value, e = TIER.shadow.reach;
    sun.castShadow = day; if (roadShade) roadShade.visible = day;
    sun.target.position.set(pp.x * 0.5, pp.y, pp.z - e * 0.6);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 12000);
  }

  if (post) post.render(); else renderer.render(scene, camera);
  const top = toScreen(pp.x, pp.y + 880, pp.z), bot = toScreen(pp.x, pp.y, pp.z);
  return { player: { x: bot.x, y: bot.y, top: top.y } };
}
