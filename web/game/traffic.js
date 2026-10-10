'use strict';
// Dogs, cows and road traffic (the driving rules are in engine/traffic-ai.js).
// Stray dogs sleep on the road, trot across it, or sit by the roadside and chase passing autos.
function startChase(c, side) { c.mode = 'chase'; c.chaseT = rand(5, 8); c.side = side; c.speed = Math.min(player.speed * 0.8, MAX_SPEED * 0.55); }
function updateDog(c, dt) {
  c.t += dt; c.barkT -= dt;
  const dz = wrapDelta(c.z - player.dist), sp = player.speed / MAX_SPEED;
  if (Math.abs(dz) > 2500) c.tried = false;
  if (c.mode === 'sleep' && dz > 0 && dz < 700 && sp > 0.2 && !c.tried) {
    c.tried = true;
    if (Math.random() < 0.6) { c.mode = 'cross'; c.vx = (c.x >= player.x ? 1 : -1) * 0.9; }
  }
  if (c.mode === 'sit' && !c.tried && dz > -150 && dz < 450 && Math.abs(c.x - player.x) < 1.6 && sp > 0.25 && state === 'race') {
    c.tried = true;
    if (Math.random() < 0.85) {
      startChase(c, Math.sign(c.x - player.x) || 1);
      // sometimes a second dog joins in on the other side
      const buddy = traffic.find(o => o !== c && o.type === 'dog' && o.mode !== 'chase' && Math.abs(wrapDelta(o.z - c.z)) < 900);
      if (buddy && Math.random() < 0.45) { buddy.tried = true; startChase(buddy, -c.side); buddy.z = (player.dist + 150 + trackLength) % trackLength; buddy.x = player.x - c.side * 0.3; }
    }
  }
  if (c.mode === 'cross') {
    c.x += c.vx * dt;
    const h = halfAt(c.z) + 0.5; if (Math.abs(c.x) > h) { c.x = Math.sign(c.x) * h; c.vx = 0; c.mode = 'sit'; }
  } else if (c.mode === 'chase') {
    c.chaseT -= dt;
    // run alongside the front wheel (a little ahead of the auto) until it outpaces the dog
    const top = MAX_SPEED * (c.chaseT > 2 ? 0.7 : 0.4); // strong sprint, then it tires
    c.speed += clamp(clamp(player.speed + (220 - dz) * 2, 0, top) - c.speed, -MAX_SPEED * dt, MAX_SPEED * 0.6 * dt);
    const hh = halfAt(c.z) + 0.6, tx = clamp(player.x + c.side * 0.32, -hh, hh);
    c.x += clamp(tx - c.x, -1.2 * dt, 1.2 * dt);
    if (c.barkT <= 0 && Math.abs(dz) < 900) {
      c.barkT = rand(0.35, 0.7); Animals.barkFrom(c);
      const s = c.scr && c.scr.frame === frameNo ? c.scr : null;
      popup(pick(['BHOW!', 'BHOW BHOW!', 'WOOF!', 'GRRR!']), s ? s.x : W / 2 + c.side * 190, s ? s.y : H - 210, '#fff', 20);
    }
    if (c.chaseT <= 0 || dz < -700) { c.mode = 'sit'; c.tx = Math.sign(c.x || 1) * (halfAt(c.z) + 0.3); }
  } else {
    c.speed = Math.max(0, c.speed - MAX_SPEED * dt);
    if (c.mode === 'sit' && c.tx !== undefined) c.x += clamp(c.tx - c.x, -0.6 * dt, 0.6 * dt);
  }
  c.z = (c.z + c.speed * dt + trackLength) % trackLength;
  const frame = Math.floor(c.t * (c.mode === 'chase' ? 12 : 7)) % 2;
  if (c.mode === 'sleep') { c.img = c.look.sleep; c.nw = 0.2; }
  else if (c.mode === 'chase') { c.img = c.look.rear[frame]; c.nw = 0.1; }
  else if (c.mode === 'cross') { c.img = (c.vx > 0 ? c.look.right : c.look.left)[frame]; c.nw = 0.2; }
  else { c.img = (c.x > 0 ? c.look.left : c.look.right)[0]; c.nw = 0.2; }
}
function updateTraffic(dt) {
  const obs = trafficObstacles();
  const w = { findSegment, wrapDelta, trackLength, segLen: SEG_LEN, solid: use3D, lightOf, random: Math.random,
    stopLineAhead: (z, dir, front, range) => RRR.junction.stopLineAhead(junctions, wrapDelta, z, dir, front, range) };
  for (const c of traffic) {
    if (c.type === 'dog') { updateDog(c, dt); continue; }
    if (c.type === 'cow') {
      c.scared -= dt;
      if (c.pause > 0) c.pause -= dt;
      else { c.x += c.vx * dt; if (Math.random() < dt * 0.1 && c.scared <= 0) c.pause = rand(1, 4); }
      const h = halfAt(c.z) + 0.4; if (Math.abs(c.x) > h) { c.vx = -Math.sign(c.x) * rand(0.05, 0.12); c.x = Math.sign(c.x) * h; }
      c.img = c.vx > 0 ? SP.cowR : SP.cowL;
    } else {
      RRR.driveTraffic(c, obs, dt, w);
      if (c.stuckT > 8 && offScreen(c.z)) respawnTraffic(c, obs);
    }
  }
}

// Traffic is solid and drives by the rules: engine/traffic-ai.js.
function trafficObstacles() {
  const obs = [{ z: player.dist, x: player.x, vz: player.speed * Math.cos(player.heading), nw: playerW(), len: playerL(), who: player }];
  for (const r of rivals) obs.push({ z: r.dist, x: r.x, vz: r.ko > 0 ? 0 : r.speed, nw: TUK_NW, len: TUK_LEN, who: r });
  for (const c of traffic) if (c.type !== 'dog') obs.push({ z: c.z, x: c.x, vz: (c.dir || 0) * c.speed, nw: c.nw, len: c.type === 'cow' ? 900 : c.len, who: c });
  return obs;
}
// Jams clear themselves out of sight: traffic stuck for a while (not at a red light) behind the camera or
// past the draw distance is moved to a free spot in a lane far ahead, clear of junctions and of other
// vehicles, beyond what you can see, and drives on from there.
const offScreen = z => { const dz = wrapDelta(z - player.dist); return dz < -3500 || dz > 44000; };
function respawnTraffic(c, obs) {
  for (let tries = 0; tries < 12; tries++) {
    const z = ((player.dist + rand(48000, 80000)) % trackLength + trackLength) % trackLength;
    if (junctions.some(j => { const d = wrapDelta(z - j.zc); return d > -3500 && d < 2000; })) continue;
    const lanes = findSegment(z).lanes, lane = c.type === 'car' || c.type === 'bike' ? Math.floor(Math.random() * lanes) : lanes - 1, x = laneX(c.dir, lane);
    if (obs.some(o => o.who !== c && Math.abs(o.x - x) < (c.nw + o.nw) / 2 + 0.05 && Math.abs(wrapDelta(o.z - z)) < (c.len + (o.len || 0)) / 2 + 1500)) continue;
    Object.assign(c, { z, lane, x, speed: c.cruise * 0.8, stuckT: 0, stuck: 0, signal: 0, signalT: 0 });
    return true;
  }
  return false;
}
