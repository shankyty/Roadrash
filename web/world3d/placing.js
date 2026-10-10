'use strict';
// Places vehicles, animals and scenery.
// ---------------------------------------------------------------- placing things
const v3 = new T.Vector3();
function toScreen(x, y, z) { v3.set(x, y, z).project(camera); return { x: (v3.x + 1) / 2 * W_3D, y: (1 - v3.y) / 2 * H_3D, z: v3.z }; }
function screenOf(obj, pos, h, w, frameNo) {
  const top = toScreen(pos.x, pos.y + h, pos.z), a = toScreen(pos.x - Math.cos(pos.th) * w / 2, pos.y, pos.z - Math.sin(pos.th) * w / 2),
    b = toScreen(pos.x + Math.cos(pos.th) * w / 2, pos.y, pos.z + Math.sin(pos.th) * w / 2);
  const ok = top.z < 1 && top.x > -200 && top.x < W_3D + 200;
  obj.scr = ok ? { x: top.x, y: top.y, w: Math.abs(b.x - a.x), frame: frameNo } : null;
}
function spinWheels(model, dist) { for (const c of model.children) if (c.userData.wheel) c.children.forEach(m => { if (m.userData.spin) m.rotation.x = -dist / 110; }); }
function walk(model, t, speed) {
  const legs = model.userData.legs; if (!legs) return;
  const a = speed > 0 ? Math.sin(t) * 0.3 : 0;
  legs[0].rotation.x = a; legs[3].rotation.x = a; legs[1].rotation.x = -a; legs[2].rotation.x = -a;
  if (model.userData.tail) model.userData.tail.rotation.z = Math.sin(t * 0.6) * 0.25;   // tail swish
}
// Every traffic look is built ahead of time, a little each frame while the title screen and countdown are
// up (detailed models with three levels of detail take a moment to build), so none is built mid-race.
let warmQueue = [];
function queueWarm() {
  warmQueue = [...(cfg.CAR_LOOKS || []).map(l => () => carModelFor(l)), ...(cfg.TRACTOR_LOOKS || []).map(l => () => tractorModel(l)), ...(cfg.BIKE_LOOKS || []).map(l => () => bikeModel(l)),
    ...((cfg.BUS_LOOKS || {})[cfg.city] || [BUS_DEFAULT]).flatMap(l => [() => busModel(l), () => busModel({ ...l, crowd: true })]), () => truckModel(SP3D.truck)];
}
function warmStep(budget) {
  const t0 = performance.now();
  while (warmQueue.length && performance.now() - t0 < budget) { lodSink.length = 0; warmQueue.shift()(); }
  lodSink.length = 0;
  return warmQueue.length;
}
// Traffic off screen (behind the camera or past the draw distance) is just game data: position, lane,
// speed, heading (kept on the object). Its model goes back to a pool by look, and the next vehicle that
// looks the same reuses it, so models aren't built or kept per vehicle. Rivals, the player and animals
// keep their own.
const pool = new Map();   // look -> spare models
function lookOf(obj) {
  if (obj.isRival || obj.isPlayer || obj.type === 'cow' || obj.type === 'dog') return null;
  if (obj.type === 'auto') return 'auto' + JSON.stringify(obj.palette) + SP3D.rivals.indexOf(obj.img);
  if (obj.look) return obj.type + JSON.stringify(obj.look);
  if (obj.type === 'car') return 'car' + (obj.color || cfg.CAR_COLORS[Math.max(0, SP3D.cars.indexOf(obj.img))]);
  if (obj.type === 'bike') return 'bike' + SP3D.bikes.indexOf(obj.img);
  return obj.type;
}
function release(obj) {
  const m = vehicles.get(obj); if (!m || !m.userData.look) return false;
  vehicles.delete(obj); m.visible = false;
  if (!pool.has(m.userData.look)) pool.set(m.userData.look, []);
  pool.get(m.userData.look).push(m);
  return true;
}
function modelFor(obj) {
  let m = vehicles.get(obj);
  if (m) return m;
  const look = lookOf(obj), spare = look && pool.get(look);
  if (spare && spare.length) {
    m = spare.pop(); m.scale.set(1, 1, 1);
    const ind = m.userData.ind; if (ind) for (const side of ['-1', '1']) for (const lamp of ind[side]) lamp.material = indOff;
    if (m.userData.arm) m.userData.arm.visible = false;
    vehicles.set(obj, m); return m;
  }
  lodSink.length = 0;
  if (obj.isRival || obj.type === 'auto') m = autoModel(obj.palette || { body: obj.color || '#ffcc00', trim: '#111', canopy: '#151515' }, obj.img, obj.driver);
  else if (obj.isPlayer) m = autoModel(obj.palette || { body: '#1e9e4a', trim: '#ffd21f', canopy: '#151515' }, obj.img || SP3D.player, obj.driver);
  else if (obj.type === 'bus') m = busModel(obj.look);
  else if (obj.type === 'truck') m = truckModel(SP3D.truck);
  else if (obj.type === 'car') m = obj.look ? carModelFor(obj.look) : carModel(obj.color || cfg.CAR_COLORS[Math.max(0, SP3D.cars.indexOf(obj.img))] || '#e9e9ea');
  else if (obj.type === 'tractor') m = tractorModel(obj.look || cfg.TRACTOR_LOOKS[0]);
  else if (obj.type === 'bike') { const i = Math.max(0, SP3D.bikes.indexOf(obj.img)); m = bikeModel(cfg.BIKE_LOOKS[i]); }
  else if (obj.type === 'cow') m = cowModel(COW_COATS[(obj.coat ??= Math.floor(Math.random() * COW_COATS.length))]);
  else if (obj.type === 'dog') { const i = Math.max(0, SP3D.dogs.indexOf(obj.look)); m = dogModel(cfg.DOG_COATS[i]); }
  else return null;
  m.userData.lods = lodSink.splice(0); m.userData.look = look; castShadows(m);
  scene.add(m); vehicles.set(obj, m);
  return m;
}
// the model viewer's 'rival:<driver id>' (their auto) and 'rival:<driver id>/hit' (with the attack held out)
function rivalPreview(arg) {
  const [id, hit] = (arg || '').split('/'), d = (cfg.DRIVERS || []).find(o => o.id === id);
  const m = d ? autoModel(d.look, SP3D.rivalOf[d.id], d) : autoModel({ body: '#1a1a1a', trim: '#f5c400', canopy: '#f5c400' }, SP3D.rivals[0]);
  if (hit) poseArm(m, cfg.attackPoseAt(d ? d.weapon : {}, cfg.moveOf(d ? d.weapon : {}).at), 1); // held at the moment it lands
  return m;
}
// heading relative to the road from how the object actually moved since the last frame: sideways
// movement against forward movement, so autos and lane-changing traffic point where they're going
function steerYaw(obj, dist, x) {
  const dd = dist - (obj._pd ?? dist), dx = (x - (obj._px ?? x)) * ROAD_W_3D;
  obj._pd = dist; obj._px = x;
  let yaw = obj._yaw || 0;
  if (Math.abs(dd) < 3000 && Math.abs(dx) < 600 && Math.abs(dd) + Math.abs(dx) > 0.5) { // (skip teleports: respawns, wraps)
    const target = Math.max(-0.55, Math.min(0.55, Math.atan2(dx, Math.max(Math.abs(dd), 30))));
    yaw += (target - yaw) * 0.25;
  } else yaw *= 0.9;
  return (obj._yaw = yaw);
}
// sit a body of length len on the road: pitch it to the slope between its ends and lift it where the road
// sags under it (bottom of a dip), so no end sinks into the road on hills
const endA = {}, endB = {};
function onGround(p, d, x, len) {
  const h = len / 2, a = placeAt(d + h, x, endA).y, b = placeAt(d - h, x, endB).y;
  p.pitch = Math.atan2(a - b, len); p.y += Math.max(0, (a + b) / 2 - p.y) + 4;
  return p;
}
// put the attacking arm (or leg) in a pose of its move: up or down (z), swept forward or back (y), thrust out (ext)
function poseArm(m, pose, side) {
  const arm = m.userData.arm, pivot = m.userData.armPivot;
  arm.visible = true; arm.rotation.y = side < 0 ? Math.PI - pose.y : pose.y;
  pivot.rotation.z = pose.z; pivot.position.x = m.userData.armX + pose.ext;
}
// which band something d ahead of the camera is in: 'road', 'footpath' or 'grass'
function zoneOf3D(d, x) {
  const seg = segments3D[(baseIdx + Math.max(0, Math.floor(d / SEG_LEN_3D + camFrac))) % segments3D.length];
  return window.RRR.footpath.zoneAt(seg.half, cfg.footpath, x, !!seg.junction);
}
// how high the ground it stands on is above the road: the footpath's height when it is on the footpath
function pathLift(d, x) { return cfg.footpath && zoneOf3D(d, x) === 'footpath' ? FP_H : 0; }
function placeAuto(obj, m, d, x, rot, atk, hurt, bounce) {
  const p = onGround(placeAt(d, x), d, x, m.userData.size.l);
  // on the footpath it rides at the footpath's height (eased, so the kerb is a quick step and not a snap);
  // in a jump it rises by its height and points along its flight: nose up on the way up, down on the way down
  obj.lift3d = (obj.lift3d || 0) + (pathLift(d, x) - (obj.lift3d || 0)) * 0.3;
  const a = obj.air, climb = a ? Math.atan2(4 * a.peak / a.airTime * (1 - 2 * a.t / a.airTime), Math.max(obj.speed, 1)) : 0;
  bounce += obj.lift3d + (obj.y || 0); p.pitch += climb;
  // your auto faces its real heading (sharp pivots); rivals point the way they're moving
  const yaw = obj.crash > 0 || obj.ko > 0 ? 0 : obj.isPlayer ? (obj.heading || 0) + (obj.slip || 0) : steerYaw(obj, obj.dist || 0, x);
  m.position.set(p.x + (hurt > 0 ? Math.sin(hurt * 90) * 18 : 0), p.y + bounce, p.z);
  m.rotation.set(p.pitch, -p.th - yaw, -rot, 'YXZ');
  // tipping over: roll about the wheel edge it falls onto (rolling about the middle sinks half the auto into
  // the road), and drop the contact shadow while it's up on its side
  const sh = m.userData.shadowMesh ??= m.children.find(ch => ch.userData.isShadow);
  if (sh) { sh.visible = Math.abs(rot) < 0.25; sh.userData.y0 ??= sh.position.y; sh.position.y = sh.userData.y0 - (obj.y || 0); } // (in a jump the shadow stays on the ground)
  if (rot) {
    const px = Math.sign(rot) * m.userData.size.w / 2, side = px * (1 - Math.cos(rot)), a = m.rotation.y;
    m.position.x += side * Math.cos(a); m.position.z -= side * Math.sin(a); m.position.y += Math.abs(px * Math.sin(rot));
  }
  if (m.userData.frontWheel) m.userData.frontWheel.rotation.y = (obj.isPlayer ? -(obj.steer || 0) * 0.7 : -yaw * 1.6) - (obj.wheelJerk || 0);
  const duck = obj.hitFx && obj.hitFx.kind === 'head' ? Math.sin(Math.PI * (1 - obj.hitFx.t / obj.hitFx.dur)) * 85 : 0;
  for (const part of m.userData.driver || []) part.position.y = part.userData.y0 - duck;
  const arm = m.userData.arm;
  if (atk) {
    poseArm(m, cfg.attackPose(atk, obj.weapon || m.userData.weapon || {}), atk.side);
  } else arm.visible = false;
  spinWheels(m, obj.dist || 0);
  return p;
}
