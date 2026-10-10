'use strict';
// Collisions, finishing, results and the title-screen attract mode.
function checkCollisions() {
  if (player.crash > 0 || player.air) return;
  // in 3D every vehicle is a solid body centred on its position, so contact happens when the bodies' ends
  // meet (half of each length apart); the flat 2D sprites only touch just ahead of the auto
  const pw = playerW(), half = use3D ? playerL() / 2 : 0, seg = findSegment(player.dist + half * 0.8);
  if (Math.abs(player.x) > seg.half) {
    for (const s of seg.solids) {
      if (Math.sign(s.offset) !== Math.sign(player.x)) continue;
      // a cart ramp, met at its near end, lined up and fast enough: up and away (anything else about a cart is a wreck)
      if (s.kind === 'cart' && seg.index - s.seg0 <= 1 && FP.takesOff(s.offset + Math.sign(s.offset) * s.nw / 2, player.x, player.speed / MAX_SPEED)) { takeOff(); return; }
      // buildings and temples: their front wall is at the offset; other things are centred half their width out
      const wall = s.kind === 'building' || s.kind === 'temple';
      const hit = wall ? Math.abs(player.x) + pw * 0.45 > Math.abs(s.offset)
        : s.onPath ? overlap(player.x, pw, s.offset + Math.sign(s.offset) * s.nw / 2, s.nw) // a stall or a cart blocks the footpath at its full width
        : overlap(player.x, pw * 0.7, s.offset + Math.sign(s.offset) * s.nw / 2, s.nw * 0.55);
      if (hit) {
        crashPlayer('WRECKED!', 25, -Math.sign(s.offset)); player.speed = 0;
        player.x = s.offset - Math.sign(s.offset) * pw * 0.6; return;
      }
    }
  }
  for (const c of traffic) {
    const dz = wrapDelta(c.z - player.dist);
    const reach = use3D ? (c.len || 0) / 2 + half : 230;
    if (dz < (use3D ? -reach : -60) || dz > reach || !overlap(player.x, use3D ? pw : pw * 0.85, c.x, use3D ? c.nw : c.nw * 0.85)) continue;
    // oncoming, nose to nose: a head-on smash (alongside it's a scrape, below)
    if (c.dir === -1 && !(use3D && Math.abs(dz) < reach - 260)) {
      const rel = (player.speed + c.speed) / MAX_SPEED;
      crashPlayer(`HEAD-ON WITH A ${c.label}!`, 30 + rel * 25); player.speed = 0; c.speed = 0;
      if (dz > 0) player.dist -= reach - dz;
      return;
    }
    // alongside (3D): the auto scrapes the vehicle's side and is shoved back out into its own line
    if (use3D && dz < reach - 260 && c.type !== 'dog') {
      const dir = player.x >= c.x ? 1 : -1;
      player.x = c.x + dir * (pw + c.nw) / 2 + dir * 0.01;
      player.lean = dir * 0.5; player.speed *= 0.92; shake = 0.12; bumpPlayer(2, dir); c.passCd = PASS_AGAIN;  // (a touched vehicle isn't a close pass)
      if (c.type === 'cow') { Animals.mooFrom(c); c.vx = -dir * 0.8; c.scared = 2; }
      return;
    }
    if (player.speed <= c.speed) continue;
    if (c.type === 'dog') { // the dog always leaps clear; you lose speed swerving
      if (c.mode === 'chase') continue;
      Sfx.yelp(); c.mode = 'cross'; c.vx = (c.x >= player.x ? 1 : -1) * 1.1; c.x += Math.sign(c.vx) * 0.25; c.tried = true;
      player.speed *= 0.75; player.lean -= Math.sign(c.vx) * 0.4; shake = 0.12;
      popup('KAI KAI!', W / 2 + Math.sign(c.vx) * 120, H - 250, '#fff', 22);
      return;
    }
    const rel = (player.speed - c.speed) / MAX_SPEED;
    if (c.type === 'cow') { Animals.mooFrom(c); c.vx = (c.x >= player.x ? 1 : -1) * 0.8; c.scared = 2; }
    if (rel > 0.3) { crashPlayer(`SMASHED INTO A ${c.label}!`, 20 + rel * 25); player.speed = c.speed * 0.3; }
    else { player.speed = c.speed * 0.8; if (rel > 0.02) { shake = 0.15; bumpPlayer(3); c.passCd = PASS_AGAIN; } }  // (leaning on its bumper isn't a bump)
    player.dist -= reach - dz;
    return;
  }
  const reachR = use3D ? TUK_LEN / 2 + half : 200;
  for (const r of rivals) {
    const dz = r.dist - player.dist;
    if (r.air || Math.abs(dz) > reachR || !overlap(player.x, pw, r.x, r.nw)) continue; // a rival in a jump is over your head
    if (r.ko > 0) {
      if (dz > 0 && player.speed / MAX_SPEED > 0.3) { crashPlayer(`TRIPPED OVER ${r.name}!`, 15); player.speed *= 0.3; player.dist -= reachR - dz; return; }
      continue;
    }
    const dx = player.x - r.x, ov = (pw + r.nw) / 2 - Math.abs(dx), dir = dx >= 0 ? 1 : -1;
    const nose = use3D ? Math.abs(dz) > reachR - 260 : Math.abs(dx) < (pw + r.nw) / 2 * 0.55;
    if (nose) {
      if (dz > 0 && player.speed > r.speed) { player.speed = r.speed * 0.95; player.dist -= reachR - dz; Sfx.bump(); }
      else if (dz < 0 && r.speed > player.speed) { r.speed = player.speed * 0.95; r.dist = player.dist - reachR; }
    } else { player.x += dir * ov * 0.5; r.x -= dir * ov * 0.5; }
  }
}

// rivals are solid too: they can't drive into each other or into traffic. Nose to tail the one behind is
// held back at the other's bumper; side by side they're pushed apart.
function separateRivals() {
  const reachR = use3D ? TUK_LEN : 200;
  const push = (a, b, dz, reach, bw, both) => { // a is behind b by dz (>= 0); both: b can be moved sideways too
    const dx = a.x - b.x, ov = (TUK_NW + bw) / 2 - Math.abs(dx), dir = dx >= 0 ? 1 : -1;
    if (ov <= 0) return;
    if (dz > reach - 260) { a.dist = Math.min(a.dist, b.dist - reach); a.speed = Math.min(a.speed, (b.speed || 0) * 0.98); }
    else if (both) { a.x += dir * ov * 0.5; b.x -= dir * ov * 0.5; } else a.x += dir * ov;
  };
  for (let i = 0; i < rivals.length; i++) {
    const a = rivals[i];
    for (let j = i + 1; j < rivals.length; j++) {
      const b = rivals[j], dz = b.dist - a.dist;
      if (a.air || b.air || Math.abs(dz) >= reachR) continue; // in a jump an auto touches nothing
      if (dz >= 0) push(a, b, dz, reachR, TUK_NW, true); else push(b, a, -dz, reachR, TUK_NW, true);
    }
    if (a.ko > 0 || a.air) continue;
    // alongside you: the rival gives way sideways (nose to tail is handled in checkCollisions)
    const pdz = player.dist - a.dist, pdx = a.x - player.x, pov = (TUK_NW + playerW()) / 2 - Math.abs(pdx);
    if (Math.abs(pdz) < (use3D ? (TUK_LEN + playerL()) / 2 : 200) - 260 && pov > 0) a.x += (pdx >= 0 ? 1 : -1) * pov;
    for (const c of traffic) {
      if (c.type === 'dog' || c.type === 'cow' || c.dir === -1) continue;
      const reach = use3D ? (c.len || 0) / 2 + TUK_LEN / 2 : 200, dz = wrapDelta(c.z - a.dist), cw = use3D ? c.nw : c.nw * 0.85;
      if (dz <= -reach || dz >= reach) continue;
      if (dz > 0) push(a, { dist: a.dist + dz, x: c.x, speed: c.speed }, dz, reach, cw, false);
      else { const dx = a.x - c.x, ov = (TUK_NW + cw) / 2 - Math.abs(dx); if (ov > 0) a.x += (dx >= 0 ? 1 : -1) * ov; }
    }
  }
}

function currentRank() {
  return RRR.standings.order(finishOrder, [player, ...rivals]).indexOf(player) + 1;
}

function checkFinish() {
  for (const a of [player, ...rivals]) {
    if (a.finished || a.dist < finishDist) continue;
    a.finished = true; a.time = raceTime; finishOrder.push(a);
    if (a === player) {
      const rank = finishOrder.length;
      state = 'finished'; finishTimer = 4; player.atk = null;
      msg(`FINISHED ${ordinal(rank)}!`, rank <= 3 ? '#ffeb3b' : '#ff8a65', 3.5);
      if (rank <= 3) Sfx.cash();
    }
  }
}

function buildResults() {
  const order = RRR.standings.order(finishOrder, [player, ...rivals]);
  const rank = order.indexOf(player) + 1;
  const prize = RRR.standings.prize(rank), bonus = player.kos * 100;
  stats.finish(player.finished ? player.time : null, rank);
  const skill = stats.bonuses(); // drift and lane-surf cash, at the style's rates
  cash += prize + bonus + skill.drift + skill.passes + skill.jumps;
  // beaten: which of the track's bests this race beat · best: the bests after it
  results = { order, rank, prize, bonus, skill, stats, qualified: rank <= 3, beaten: records.submit(def.id, stats.summary()), best: records.get(def.id) };
  trackEvent(`race-finish/${ordinal(rank)}`, `Finished ${ordinal(rank)}: ${def.name}`);
  store.set('cash', cash);
  state = 'results';
}

function advanceAfterResults() {
  if (results.qualified) {
    level++;
    if (level >= ORDER.length) { level = 0; round++; store.set('round', round); store.set('track', ORDER[level]); state = 'champion'; attractSetup(); return; }
    store.set('track', ORDER[level]);
  }
  setupRace();
}

function attractSetup() {
  loadTrack(level);
  titleBest = records.get(def.id);
  resetPlayer(); rivals = []; traffic = []; player.speed = MAX_SPEED * 0.5;
}
function updateAttract(dt) {
  const seg = findSegment(player.dist);
  player.x = lerp(player.x, -seg.curve * 0.08, Math.min(1, dt * 2));
  player.speed = MAX_SPEED * 0.5; player.rot = 0;
  player.dist += player.speed * dt;
  position = ((player.dist - PLAYER_Z) % trackLength + trackLength) % trackLength;
  const segDelta = player.speed * dt / SEG_LEN;
  farOffset = (farOffset + 0.0012 * seg.curve * segDelta + 1) % 1;
  nearOffset = (nearOffset + 0.0022 * seg.curve * segDelta + 1) % 1;
  updateEngine();
}
