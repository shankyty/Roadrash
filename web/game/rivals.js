'use strict';
// How rival autos race and fight.
const WRONG_SIDE_X = laneX(-1, 0), PASS_TIME = 2.2; // the oncoming lane by the centre line; seconds a pass takes
// is anything standing on our side's footpath (a cart ramp or a stall) within n segments ahead of segment i?
const pathBlocked = (i, n) => { for (let k = 0; k <= n; k++) if (segments[(i + k) % segments.length].solids.some(q => q.onPath && q.offset < 0)) return true; return false; };
function updateRivals(dt) {
  for (const r of rivals) {
    const seg = findSegment(r.dist);
    const st = r.style, wp = r.weapon;
    r.hurt -= dt; r.grudgeT -= dt;
    if (state === 'race' || state === 'finished' || state === 'results') { if (r.delay > 0) { r.delay -= dt; continue; } }
    if (r.atk) { r.atk.t += dt; if (!r.atk.done && r.atk.t > r.atk.at) { r.atk.done = true; resolveAttack(r, r.atk.side); } if (r.atk.t > r.atk.dur) r.atk = null; }
    if (r.ko > 0) {
      r.path = false; r.ko -= dt; r.speed = Math.max(0, r.speed - r.speed * 3 * dt - 2000 * dt);
      r.rot = lerp(r.rot, (r.koDir || 1) * 1.45, Math.min(1, dt * 7));
      if (r.x > -0.2) r.x = lerp(r.x, -0.2, Math.min(1, dt * 2)); // a wreck on the wrong side skids back towards its own
      if (r.ko <= 0) { r.health = 55; r.rot = 0; r.x = clamp(r.x, -halfAt(r.dist) + 0.3, -0.3); }
      r.dist += r.speed * dt; continue;
    }
    hitReact(r, dt);
    r.rot = lerp(r.rot, hitLean(r), Math.min(1, dt * 8));
    if (r.air) { // off a cart: straight along the footpath until it comes down
      r.air.t += dt; r.y = FP.heightAt(r.air, r.air.t); r.dist += r.speed * dt;
      if (r.air.t >= r.air.airTime) { r.air = null; r.y = 0; r.speed *= 1 - FP.JUMP.landLoss; }
      continue;
    }
    const dz = r.dist - player.dist;
    let target = r.top * (1 - st.bends * Math.abs(seg.curve) / 6);
    if (dz < -2500) target *= 1.1; else if (dz > 6000) target *= 0.92;
    const engaged = !r.finished && !player.finished && player.crash <= 0 && Math.abs(dz) < st.chase;
    if (engaged) target = clamp(player.speed + (dz < 0 ? 700 : -250), MAX_SPEED * 0.3, r.top * 1.03);
    if (r.out) target = Math.max(target, r.top * 1.03); // out on the wrong side: flat out, to get it over with
    if (r.path) target = Math.max(target, r.top);       // up on the footpath: nothing in the way
    if (r.finished) target = MAX_SPEED * 0.35;
    r.speed += clamp(target - r.speed, -MAX_SPEED * 0.6 * dt, MAX_SPEED / 5 * dt);

    // steering: avoid traffic, otherwise chase player or keep lane
    let tx = r.laneX;
    r.laneT -= dt; if (r.laneT <= 0) { r.laneT = rand(st.weave[0], st.weave[1]); r.laneX = laneX(1, Math.floor(Math.random() * seg.lanes)); }
    let rMin = -seg.half + 0.2, rMax = -0.15; // rivals keep to our side of the centre line (the daring: see below)
    if (engaged) tx = player.x + (r.x >= player.x ? 1 : -1) * 0.4;
    let nearest = null, nd = 1800, meet = 1e9, roomBack = true, roomOuter = true;
    for (const c of [...traffic, ...laneCarts]) {
      const reach = use3D ? (c.len || 0) / 2 + TUK_LEN / 2 : 0, gapZ = wrapDelta(c.z - r.dist) - reach; // bumper-to-bumper gap
      if (c.dir === -1) { // oncoming: seconds until the nearest one in the lane by the centre line reaches us
        if (gapZ > -2 * reach - 200 && Math.abs(c.x - WRONG_SIDE_X) < (r.nw + c.nw) / 2 + 0.12) meet = Math.min(meet, Math.max(0, gapZ) / (r.speed + c.speed + 1));
        continue;
      }
      if (gapZ > -2 * reach && gapZ < nd && Math.abs(c.x - r.x) < (r.nw + c.nw) / 2 + 0.1) { nearest = c; nd = gapZ; }
      // anything alongside or just ahead in our inner lane: no room to pull back in yet
      if (gapZ > -2 * reach - 300 && gapZ < 500 && c.x + (r.nw + c.nw) / 2 + 0.05 > laneX(1, 0)) roomBack = false;
      // ... or in the outer lane: no room to come down off the footpath yet
      if (gapZ > -2 * reach - 300 && gapZ < 500 && Math.abs(c.x - laneX(1, seg.lanes - 1)) < (r.nw + c.nw) / 2 + 0.05) roomOuter = false;
    }
    // A daring driver held up by traffic pulls out onto the oncoming side to get past, if the gap in what's coming
    // looks big enough to them (the more daring, the smaller the gap they'll take). They dive back once there's
    // room, or when something is nearly on them. They don't always make it.
    const daring = st.daring || 0;
    r.outCd -= dt;
    if (r.out) {
      r.outT += dt;
      const coming = meet < lerp(1.0, 0.4, daring); // the more daring leave it later
      if (roomBack && (r.outT > 0.6 || coming) || r.outT > 7 || r.finished) { r.out = false; r.outCd = rand(1.5, 4); r.laneX = laneX(1, 0); }
      else if (coming) r.speed = Math.max(0, r.speed - MAX_SPEED * 0.9 * dt); // boxed in with something coming: stand on the brakes and hope
    } else if (r.path) {
      // up on the footpath: back to the road once there's room in the outer lane, or when it has gone on long
      // enough; a cart coming up that it is too slow to jump from sends it back down early
      r.pathT += dt;
      const tooSlow = r.speed / MAX_SPEED < FP.JUMP.minSpeed + 0.05 && pathBlocked(seg.index, 14);
      const clear = !pathBlocked(seg.index, 30); // not just before a cart: it could not get off the footpath in time
      if ((roomOuter && r.pathT > 1.5 || r.pathT > 8 || r.finished) && clear || tooSlow) { r.path = false; r.outCd = rand(1.5, 4); r.laneX = laneX(1, seg.lanes - 1); }
    } else if (daring > 0 && nearest && nd < 800 && r.outCd <= 0 && !r.finished && r.speed > MAX_SPEED * 0.25) {
      // the footpath, if the track has one and it is clear for as far as getting across to it (1.3 a second) and
      // lined up takes (the more daring, the more often); else the oncoming side
      const reachPath = () => 25 + Math.ceil(Math.abs(r.x + FP.centre(seg.half, footpath())) / 1.3 * r.speed / SEG_LEN);
      if (footpath() && Math.random() < 0.5 * daring && !pathBlocked(seg.index, reachPath())) { r.path = true; r.pathT = 0; }
      else if (meet > PASS_TIME * lerp(1.5, 0.6, daring)) { r.out = true; r.outT = 0; } else r.outCd = 0.5; // not now: look again in a moment
    }
    if (r.path) { tx = -FP.centre(seg.half, footpath()); rMin = tx; }
    else if (r.out) { tx = WRONG_SIDE_X; rMax = WRONG_SIDE_X; }
    else if (nearest) {
      const gap = (r.nw + nearest.nw) / 2 + lerp(0.22, 0.1, st.nerve); // the nervier, the closer they shave it
      let side = r.x >= nearest.x ? 1 : -1;
      const nx = nearest.x + side * gap; if (nx < rMin || nx > rMax) side = -side;
      tx = nearest.x + side * gap;
      if (nd < lerp(450, 200, st.nerve) && nd > -150) r.speed = Math.min(r.speed, nearest.speed + 400);
    }
    tx = clamp(tx, rMin, rMax);
    const xWas = r.x;
    r.x += clamp(tx - r.x, -1.3 * dt, 1.3 * dt);
    r.dist += r.speed * dt;
    const kerb = FP.kerbCrossing(seg.half, footpath(), xWas, r.x, !!seg.junction);
    if (kerb) r.speed *= 1 - (kerb === 'climb' ? footpath().climbLoss : footpath().dropLoss);
    // what stands on the footpath is as solid for a rival as for you, and judged by where the rival is: a cart met
    // at its near end (two segments, as a fast auto can step over one), lined up and fast enough, is a jump
    // straight along the footpath; anything else it runs into wrecks it
    for (const q of seg.solids) {
      const qx = q.offset - q.nw / 2;
      if (!(q.onPath || q.inLane) || q.offset > 0 || !overlap(r.x, r.nw, qx, q.nw)) continue;
      if (q.kind === 'cart' && seg.index - q.seg0 <= 1 && FP.takesOff(qx, r.x, r.speed / MAX_SPEED)) { r.x = qx; r.air = { ...FP.jump(r.speed / MAX_SPEED), t: 0 }; }
      else { r.ko = 3; r.koBy = 'traffic'; r.koDir = 1; r.speed *= 0.1; r.outCd = rand(4, 8); }
      break;
    }
    if (r.x > -0.1) { // on or over the centre line, oncoming traffic is solid: a head-on knocks them out
      for (const c of traffic) {
        if (c.dir !== -1) continue;
        const reach = use3D ? ((c.len || 0) + TUK_LEN) / 2 : 230;
        if (Math.abs(wrapDelta(c.z - r.dist)) >= reach || Math.abs(c.x - r.x) >= (r.nw + c.nw) / 2 * 0.9) continue;
        r.ko = 3; r.koBy = 'traffic'; r.koDir = r.x >= c.x ? 1 : -1; r.speed *= 0.1; r.out = false; r.outCd = rand(4, 8); c.speed = 0; r.headOns = (r.headOns || 0) + 1;
        if (Math.abs(dz) < 3500) { Sfx.crash(); curse(r); }
        break;
      }
    }

    if (engaged && !r.atk) {
      r.cd -= dt;
      const dx = player.x - r.x;
      // how keen they are to hit you: their nature, or (for 10 s after you hit them) their grudge
      const aggr = r.grudgeT > 0 ? Math.max(st.aggression, 0.8) * st.grudge : st.aggression;
      if (aggr > 0 && r.cd <= 0 && Math.abs(dz) < 380 && Math.abs(dx) < 0.72 * wp.reach && Math.abs(dx) > 0.05) {
        startAttack(r, Math.sign(dx)); r.cd = rand(0.9, 2.0) * wp.cooldown / aggr / (1 + round * 0.1);
      }
    }
  }
}
