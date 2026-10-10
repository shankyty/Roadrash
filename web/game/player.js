'use strict';
// The frame update and the player's auto: driving, drifting, jumps and close passes.
// ------------------------------------------------------------------ update
let lastBeep = 4;
function update(dt) {
  worldT += dt;
  for (const m of messages) m.t -= dt; messages = messages.filter(m => m.t > 0);
  for (const p of popups) { p.t -= dt; p.y -= 30 * dt; } popups = popups.filter(p => p.t > 0);
  for (const b of bubbles) b.t -= dt; bubbles = bubbles.filter(b => b.t > 0);
  for (const p of particles) { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; } particles = particles.filter(p => p.t > 0);
  shake = Math.max(0, shake - dt);
  guard('audio', () => VehicleAudio.updateVehicles(dt));
  guard('voices', () => VoiceClips.updateClips());
  guard('audio', () => Animals.updateAnimals(dt));

  if (state === 'title' || state === 'champion') { guard('race-rules', () => updateAttract(dt)); return; }
  if (state === 'countdown') {
    countdown -= dt;
    const c = Math.ceil(countdown);
    if (c < lastBeep) { lastBeep = c; if (c > 0) Sfx.beep(false); }
    if (countdown <= 0) { state = 'race'; Sfx.beep(true); msg('CHALO!', '#ffeb3b', 1.2); }
    guard('traffic', () => updateTraffic(dt)); guard('audio', updateEngine);
    return;
  }
  if (state === 'race' || state === 'finished' || state === 'results') {
    if (state === 'race') raceTime += dt;
    guard('player-physics', () => updatePlayer(dt, state === 'race'));
    guard('rivals-combat', () => updateRivals(dt));
    guard('traffic', () => updateTraffic(dt));
    guard('traffic', () => updateCross(dt));
    guard('rivals-combat', separateRivals);
    if (state === 'race') guard('player-physics', checkCollisions);
    guard('player-physics', settleLanding);
    if (state === 'race') guard('player-physics', () => updateClosePasses(dt));
    guard('hawkers', () => updateHawkers(dt));
    guard('race-rules', () => {
      checkFinish();
      if (state === 'finished') { finishTimer -= dt; if (finishTimer <= 0) buildResults(); }
    });
    guard('audio', updateEngine);
  }
}

function updateEngine() {
  const racing = state === 'race' || state === 'countdown';
  const throttle = racing && player.crash <= 0 ? (I.up() ? 1 : 0) : (state === 'finished' ? 0.3 : 0.15);
  Sfx.setEngine(player.speed / MAX_SPEED, state !== 'title' && state !== 'champion', throttle);
  const sliding = state === 'race' && player.crash <= 0 && !player.air && player.speed > DRIFT_END * 0.8;
  Sfx.squeal(sliding ? clamp(Math.abs(player.slip || 0) / DRIFT_SLIP, 0, 1) : 0);
  DriftMusic.update(state === 'race' && player.crash <= 0 && !!player.drift);
}

function updatePlayer(dt, controlled) {
  const seg = findSegment(player.dist), x0 = player.x;
  const sp = player.speed / MAX_SPEED;
  const dx = dt * 2 * sp;
  let steer = 0, acc = false, brk = false, hand = false;
  if (controlled) { steer = (I.right() ? 1 : 0) - (I.left() ? 1 : 0); acc = I.up(); brk = I.down(); hand = I.hand(); }
  else { acc = player.speed < MAX_SPEED * 0.45; steer = clamp((clamp((laneX(1, 0) - player.x) * 0.8, -0.3, 0.3) - player.heading) * 4, -1, 1); }
  player.steer = lerp(player.steer, steer, Math.min(1, dt * 10));
  player.hornCd -= dt; player.inv -= dt; player.hurt -= dt;

  if (player.atk) { player.atk.t += dt; if (!player.atk.done && player.atk.t > player.atk.at) { player.atk.done = true; resolveAttack(player, player.atk.side); } if (player.atk.t > player.atk.dur) player.atk = null; }

  const flying = !!player.air, wrecked = player.crash > 0; // as the frame began: no kerb is charged on the frame a jump lands or a wreck is put back on the road
  if (player.air) {
    // in the air: no steering, throttle or grip. The auto keeps the sideways speed it left the ground with
    // (see takeOff), so it flies on along the line it was driving
    const a = player.air; a.t += dt;
    player.x += a.vx * dt;
    player.y = FP.heightAt(a, a.t);
    if (!a.over) a.over = traffic.some(c => c.type !== 'cow' && c.type !== 'dog' && Math.abs(wrapDelta(c.z - player.dist)) < ((c.len || 0) + TUK_LEN) / 2 && overlap(player.x, TUK_NW, c.x, c.nw));
    // over a cross-road vehicle at a junction: a flyover wherever the auto comes down
    if (!a.overCross) a.overCross = crossTraffic.some(c => Math.abs(wrapDelta(c.z - player.dist)) < (c.nw * ROAD_W + TUK_LEN) / 2 && Math.abs(player.x - c.x) < (c.lenX + TUK_NW) / 2);
    if (a.t >= a.airTime) landPlayer();
  } else if (player.crash > 0) {
    player.crash -= dt;
    player.speed = Math.max(0, player.speed - player.speed * 2.5 * dt - 1500 * dt);
    player.rot = lerp(player.rot, player.crashDir * 1.45, Math.min(1, dt * 7));
    player.x += player.crashDir * dt * 0.35 * sp;
    if (player.crash <= 0) {
      player.rot = 0; player.lean = 0; player.tip = 0; player.speed = 0; player.heading = 0; player.slip = 0; player.drift = 0; player.x = clamp(player.x, -halfAt(player.dist) + 0.3, -0.3);
      if (player.health <= 0) player.health = 60;
      player.inv = 1.5; msg('BACK ON THE ROAD!', '#8bc34a', 1.2);
    }
  } else {
    // heading: pivot almost on the spot when slow, gentle at speed; straightens up as you drive off
    const slow = player.speed < PIVOT_SPEED;
    const maxH = MAX_PIVOT + (MAX_RACE_HEADING - MAX_PIVOT) * clamp((player.speed - PIVOT_SPEED) / (MAX_SPEED * 0.25), 0, 1);
    if (steer) {
      const rate = slow ? (player.speed < 60 ? 2.2 : 3.2) : 2.0;   // ~90 degrees in half a second when creeping
      player.heading = clamp(player.heading + steer * rate * dt, -maxH, maxH);
    } else if (acc || player.speed > PIVOT_SPEED) player.heading *= Math.exp(-(0.8 + 3 * sp) * dt);
    if (Math.abs(player.heading) > maxH) player.heading += (Math.sign(player.heading) * maxH - player.heading) * Math.min(1, dt * 4);
    player.x += player.speed * Math.sin(player.heading) * dt / ROAD_W;  // the sideways part of where you're heading
    // a drift into the bend carries the auto round it: on drift tracks less of the bend's outward push gets through
    const grip = player.drift && player.drift === Math.sign(seg.curve) ? def.handling.driftGrip : 1;
    player.x -= dx * sp * seg.curve * CENTRIFUGAL * grip;
    if (acc) player.speed += ACCEL * dt; else if (brk) player.speed += BRAKE * dt; else player.speed += DECEL * dt;
    if (hand) player.speed += BRAKE * 0.5 * dt; // handbrake: rear wheels locked
    // drift: steer + brake tap at speed kicks the back out; the body slides at an angle while you keep going
    const tap = brk && !player.brkWas; player.brkWas = brk;
    // a brake tap or the handbrake (Space) kicks the back out
    if (!player.drift && steer && (tap || hand) && player.speed > DRIFT_MIN) { player.drift = Math.sign(steer); Sfx.noise(0.25, 0.25, 2500); }
    if (player.drift && (!steer || Math.sign(steer) !== player.drift || player.speed < DRIFT_END)) endDrift();
    player.slip += (player.drift * DRIFT_SLIP - player.slip) * Math.min(1, dt * (player.drift ? 3.5 : 6));
    if (player.drift) {
      player.speed -= player.speed * def.handling.driftScrub * dt;   // tyres scrubbing
      // only a slide into a bend counts: weaving on a straight earns no points and no exit boost
      if (player.drift === Math.sign(seg.curve) && Math.abs(seg.curve) >= DRIFT_BEND) {
        player.driftT += dt;
        if (controlled && player.speed > DRIFT_END) player.driftPts += stats.drift(dt, player.speed / MAX_SPEED, Math.abs(player.slip) / DRIFT_SLIP);
      }
    }
    if (Math.abs(player.slip) > 0.12 && player.speed > DRIFT_END * 0.8) layTyreMarks();
    else player.markAt = null;
    if (zoneOf(seg, player.x) === 'grass') {
      if (player.speed > OFFROAD_LIMIT) player.speed += OFFROAD_DECEL * dt;
      if (Math.random() < sp * 0.8) particles.push({ x: (playerScr ? playerScr.x : W / 2) + rand(-100, 100), y: playerScr ? playerScr.y - 6 : H - 30, vx: rand(-60, 60), vy: rand(-80, -20), t: 0.6, size: rand(6, 12), color: 'rgba(160,120,70,.6)' });
    }
    // three wheels are tippy: lateral load from curves + steering
    const lat = sp * sp * (seg.curve / 6 * 0.85 + player.steer * 0.38) * (player.drift ? 0.15 : 1); // a slide unloads the wheels
    player.lean = lerp(player.lean, -lat, Math.min(1, dt * 5));
    if (Math.abs(player.lean) > 0.95) {
      player.tip += dt;
      if (player.tip > 0.7) crashPlayer('TIPPED OVER!', 15, Math.sign(player.lean));
    } else player.tip = Math.max(0, player.tip - dt * 1.5);
    const wobble = player.tip > 0 ? Math.sin(performance.now() / 40) * 0.05 : 0;
    player.rot = player.lean * 0.2 + wobble + (player.atk ? player.atk.side * 0.04 : 0) + hitLean(player);
  }
  hitReact(player, dt);
  const edge = seg.half + 1.8 + FP.furnitureShift(footpath()); // the building line, as far out as you can go: a footpath moves it out
  player.x = clamp(player.x, -edge, edge);
  // the kerb: climbing onto the footpath or dropping off it costs speed (not in the air, and not at a junction,
  // where the footpath is at road level)
  if (!flying && !wrecked && player.crash <= 0) { const k = FP.kerbCrossing(seg.half, footpath(), x0, player.x, !!seg.junction); if (k) hitKerb(k); }
  // top speed is the style's, raised for a moment by a boost (a drift exit or a slipstream); above it, speed bleeds off
  player.boostT -= dt;
  const cap = MAX_SPEED * def.handling.topSpeed * (1 + (player.boostT > 0 ? player.boost : 0));
  player.speed = clamp(player.speed, 0, Math.max(cap, player.speed - MAX_SPEED * 0.5 * dt));
  const move = player.speed * Math.cos(player.crash > 0 ? 0 : player.heading) * dt; // the down-the-road part
  player.dist += move;
  position = ((player.dist - PLAYER_Z) % trackLength + trackLength) % trackLength;
  const segDelta = move / SEG_LEN;
  skyOffset = (skyOffset + 0.0006 * seg.curve * segDelta + 1) % 1;
  farOffset = (farOffset + 0.0012 * seg.curve * segDelta + 1) % 1;
  nearOffset = (nearOffset + 0.0022 * seg.curve * segDelta + 1) % 1;
  // exhaust (2D only: in 3D the smoke is in the world, see world3d/smoke.js)
  player.puff -= dt;
  if (!use3D && player.puff <= 0 && player.crash <= 0) { player.puff = 0.07 + (1 - sp) * 0.08; particles.push({ x: playerScr ? playerScr.x + (playerScr.y - playerScr.top) * 0.3 : W / 2 + 75, y: playerScr ? playerScr.y - 18 : H - 50, vx: rand(10, 40), vy: rand(-50, -20), t: 0.7, size: rand(4, 8), color: 'rgba(200,200,200,.35)', grow: 16 }); }
}

// A drift ends: its points pop up, and one held for DRIFT_HOLD seconds kicks the auto forward on tracks whose
// style gives a drift-exit boost.
const DRIFT_HOLD = 0.6, DRIFT_BEND = 1, BOOST_SECS = 1.2; // seconds · the least road curve that counts as a bend · seconds
function endDrift() {
  if (player.driftPts >= 10) popup(`DRIFT +${Math.round(player.driftPts)}`, W / 2, H - 250, '#ffd21f', 28);
  if (player.driftT >= DRIFT_HOLD && def.handling.driftExitBoost > 0) { player.boost = def.handling.driftExitBoost; player.boostT = BOOST_SECS; Sfx.whoosh(); }
  player.drift = 0; player.driftT = 0; player.driftPts = 0;
}

// The kerb: a jolt, and a share of your speed (more going up than coming down).
function hitKerb(way) {
  const fp = footpath();
  player.speed *= 1 - (way === 'climb' ? fp.climbLoss : fp.dropLoss);
  shake = Math.max(shake, 0.12); Sfx.bump();
}
// Off the end of a cart: the flight is set by the speed, and its direction by the way the auto was going.
function takeOff() {
  // the sideways speed it leaves the ground with, as on its last moment of driving: where it is pointing, less
  // the bend's push. Holding the footpath round a bend that is nothing, so the jump comes down on the footpath;
  // steering at the road it is the heading's, so the jump goes out over the lanes
  const seg = findSegment(player.dist), sp = player.speed / MAX_SPEED;
  const grip = player.drift && player.drift === Math.sign(seg.curve) ? def.handling.driftGrip : 1;
  const vx = player.speed * Math.sin(player.heading) / ROAD_W - 2 * sp * sp * seg.curve * CENTRIFUGAL * grip;
  if (player.drift) endDrift();
  player.air = { ...FP.jump(sp), t: 0, vx, over: false, fromPath: zoneOf(seg, player.x) === 'footpath' };
  player.lean = 0; player.tip = 0; player.rot = 0;
  Sfx.whoosh();
}
// Back down: on top of a vehicle or a cow it's a crash; otherwise the landing is noted for settleLanding. A jump
// that left the footpath, passed over a vehicle and came down in the road is a flyover, as is one over a junction's cross traffic.
function landPlayer() {
  const a = player.air, seg = findSegment(player.dist);
  player.air = null; player.y = 0; player.speed *= 1 - FP.JUMP.landLoss; shake = Math.max(shake, 0.2); Sfx.bump();
  for (const c of [...traffic, ...laneCarts]) {
    if (c.type === 'dog' || Math.abs(wrapDelta(c.z - player.dist)) >= ((c.len || 0) + TUK_LEN) / 2 || !overlap(player.x, playerW(), c.x, c.nw)) continue;
    crashPlayer(`LANDED ON A ${c.label}!`, 25); player.speed = 0; return;
  }
  player.landed = { flyover: a.fromPath && (a.overCross || a.over && zoneOf(seg, player.x) === 'road') };
}
// The jump counts once the landing has held: coming down on something at the roadside is a wreck in this same
// frame's collision check, and a jump that ends in a crash doesn't count.
function settleLanding() {
  const l = player.landed; if (!l) return;
  player.landed = null; if (player.crash > 0) return;
  stats.jump(l.flyover);
  popup(l.flyover ? 'FLYOVER!' : 'JUMP!', W / 2, H - 260, l.flyover ? '#80deea' : '#ffd21f', 30);
}

// Lane surfing: overtaking same-way traffic with little room to spare is a close pass. Each one counts in the
// race's stats; on tracks whose style has a slipstream it also raises your top speed for a moment, more for
// each pass in a quick chain.
const CLOSE_GAP = 0.15, PASS_AGAIN = 5, PASS_MIN_SPEED = MAX_SPEED * 0.1; // road units between the two bodies · seconds before the same vehicle counts again · slower vehicles (a queue) don't count
function updateClosePasses(dt) {
  stats.advance(dt);
  for (const c of traffic) {
    if (c.dir !== 1) continue; // cows, dogs and oncoming traffic don't count
    const dz = wrapDelta(c.z - player.dist), was = c.passDz;
    c.passDz = dz; if (c.passCd > 0) c.passCd -= dt;
    // it was just ahead and now it isn't (a jump from far ahead is the lap wrapping round, not a pass)
    if (!(was > 0 && was < 2000 && dz <= 0) || c.passCd > 0 || player.crash > 0 || player.air || player.speed <= c.speed || c.speed < PASS_MIN_SPEED) continue;
    const gap = Math.abs(c.x - player.x) - (c.nw + playerW()) / 2;
    if (gap < 0 || gap > CLOSE_GAP) continue;
    c.passCd = PASS_AGAIN;
    const chain = stats.closePass();
    if (def.handling.slipstream > 0) { player.boost = def.handling.slipstream * chain; player.boostT = RRR.RaceStats.CHAIN_SECS; }
    popup(chain > 1 ? `CLOSE! \u00d7${chain}` : 'CLOSE!', W / 2 + Math.sign(c.x - player.x) * 150, H - 230, '#80deea', 26);
    Sfx.whoosh();
  }
}
