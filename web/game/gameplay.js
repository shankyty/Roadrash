'use strict';
// Messages, hawkers, attacks, hits and crashes.
// ------------------------------------------------------------------ gameplay helpers
function msg(text, color = '#fff', dur = 1.6) { messages.push({ text, color, t: dur, dur }); if (messages.length > 3) messages.shift(); }
function popup(text, x, y, color = '#ffeb3b', size = 34) { popups.push({ text, x, y, color, size, t: 0.9 }); }
function updateHawkers(dt) {
  hawkerT -= dt; if (hawkerT > 0) return;
  hawkerT = rand(1.6, 3.2);
  const seen = [];
  for (let n = 3; n < 60; n++) {
    const seg = segments[(findSegment(position).index + n) % segments.length];
    for (const sp of seg.sprites)
      if (sp.scr && sp.scr.frame === frameNo && sp.scr.w > 60 && sp.scr.x > 40 && sp.scr.x < W - 40 && !bubbles.some(b => b.who === sp)) seen.push({ sp, z: seg.index * SEG_LEN });
  }
  if (!seen.length) return;
  const line = pick(def.city.hawkerCalls), { sp, z } = pick(seen);
  const sx = sp.offset + Math.sign(sp.offset) * sp.nw / 2; // centre of the stall
  bubbles.push({ who: sp, text: line, t: 2.2, hawker: true });
  // sing-song street call from the stall itself (it stands still, so you hear Doppler as you drive past)
  Voice.sayLine(line, { kind: 'hawker', clipRate: rand(0.95, 1.15), owner: sp,
    where: () => ({ dz: wrapDelta(z - player.dist), x: sx, vz: 0 }) });
}
function curse(who) {
  bubbles = bubbles.filter(b => b.who !== who);
  // every driver curses in their own language and their own voice (clip "<id>|<line>"), wherever the race is;
  // a driver without lines of their own uses the city's
  const own = who.driver && who.driver.curses.length ? pick(who.driver.curses).text : null;
  const line = own || pick(def.city.curses);
  bubbles.push({ who, text: line, t: 1.7 });
  setTimeout(() => Sfx.grunt(), 120);
  Voice.sayLine(own ? `${who.driver.id}|${line}` : line, { kind: 'curse',
    owner: who, clipRate: own ? who.driver.voice.rate : who.isPlayer ? 1 : rand(0.85, 1.2),
    where: who.isPlayer ? null : () => ({ dz: who.dist - player.dist, x: who.x, vz: who.speed }) });
}
function startAttack(who, side) {
  if (who.air) return; // nobody swings in a jump
  const w = who.weapon || LATHI, dur = who.isPlayer ? 0.34 * w.cooldown : 0.34;
  who.atk = { t: 0, side, dur, at: dur * moveOf(w).at, done: false, sleeve: who.driver ? who.driver.look.shirt : null };
}

function honk() {
  if (player.hornCd > 0) return;
  player.hornCd = 0.45; Sfx.horn();
  popup('POM POM!', W / 2 + rand(-30, 30), H - 250, '#fff', 22);
  for (const c of traffic) {
    const dz = wrapDelta(c.z - player.dist);
    if (dz < 0 || dz > 3000) continue;
    if (c.type === 'cow') { c.vx = (c.x >= player.x ? 1 : -1) * 0.7; c.scared = 2.5; }
    else if (c.type === 'dog') { if (dz < 2000) setTimeout(() => Animals.barkFrom(c, 3), rand(150, 500)); if (c.mode === 'sleep' || c.mode === 'sit') { c.mode = 'cross'; c.vx = (c.x >= player.x ? 1 : -1) * 0.9; } }
    else if (c.dir === 1 && Math.abs(c.x - player.x) < 0.5) c.yieldT = 1.5; // they move over when there's room
  }
}

// where an auto is on screen: its centre, roof and wheels, and its width
function screenBoxOf(who) {
  if (who.isPlayer) return playerScr ? { x: playerScr.x, top: playerScr.top ?? playerScr.y - 190, bottom: playerScr.y, w: 170 } : { x: W / 2, top: H - 250, bottom: H - 40, w: 240 };
  return who.scr ? { x: who.scr.x, top: who.scr.y, bottom: who.scr.y + who.scr.w * (use3D ? 1.5 : 1.05), w: who.scr.w } : null;
}
// How an auto takes a blow, by where it landed: on the roof it rocks on its springs and the driver ducks; on the
// body it's knocked sideways and leans away; by the wheels the front wheel jerks and it swerves and skids, with
// smoke off the tyre. `side` is the way the blow was travelling.
function takeHit(who, kind, side) {
  who.hitFx = { kind, side, t: 0.55, dur: 0.55 };
  if (kind === 'body') who.kx = side * 1.1;
  if (kind === 'low') { who.wheelJerk = side * 0.9; who.kx = side * 0.4; }
}
function hitReact(who, dt) {
  const f = who.hitFx; if (!f) return;
  f.t -= dt; if (f.t <= 0) { who.hitFx = null; who.wheelJerk = 0; who.kx = 0; return; }
  if (who.kx) { who.x += who.kx * dt; who.kx -= who.kx * Math.min(1, dt * 7); }
  if (who.wheelJerk) who.wheelJerk *= Math.max(0, 1 - dt * 5);
  if (f.kind === 'low' && f.t > f.dur - 0.3 && Math.random() < 0.7) { // tyre smoke off the skidding wheel
    const s = screenBoxOf(who);
    if (s) particles.push({ x: s.x - f.side * s.w * 0.35 + rand(-6, 6), y: s.bottom - 2, vx: rand(-40, 40) - f.side * 30, vy: rand(-70, -20), t: rand(0.4, 0.7), size: rand(5, 9), grow: 12, color: 'rgba(205,205,210,.55)' });
  }
}
// the lean away from a blow to the body, the rocking after one to the roof (radians, and a fraction of the auto's height)
const hitLean = who => who.hitFx && who.hitFx.kind === 'body' ? who.hitFx.side * 0.3 * (who.hitFx.t / who.hitFx.dur) : 0;
const hitRock = who => who.hitFx && who.hitFx.kind === 'head' ? Math.sin(performance.now() / 18) * 0.035 * (who.hitFx.t / who.hitFx.dur) : 0;
// What flies off where a blow lands: a burst of sparks, and from a wet weapon (Bhola's gamchha) a spray of water
function impact(x, y, w, side) {
  for (let i = 0; i < 7; i++) particles.push({ x, y, vx: rand(-160, 160) + side * 90, vy: rand(-190, 40), g: 420, t: rand(0.2, 0.4), size: rand(2, 4), color: pick(['#fff3b0', '#ffd54f', '#ffffff']) });
  if (w.wet) for (let i = 0; i < 30; i++) particles.push({ x: x + rand(-14, 14), y: y + rand(-12, 12), vx: rand(-260, 260) + side * 170, vy: rand(-380, -20), g: 760, t: rand(0.5, 1), size: rand(2.4, 5.4), color: pick(['#bfe6ff', '#8fd0ff', '#e3f4ff']) });
}
// Through a wet pothole: muddy water flies up round the auto and over any auto close alongside, which loses a
// little speed and curses whoever did it.
const mud = (x, y, n, spread) => { for (let i = 0; i < n; i++) particles.push({ x: x + rand(-spread, spread), y: y + rand(-10, 10), vx: rand(-220, 220), vy: rand(-420, -60), g: 900, t: rand(0.5, 1), size: rand(2.5, 6), color: pick(['#6d4c2f', '#8d6e46', '#5b4128', '#a1887f']) }); };
function splash(who) {
  const S = FP.POTHOLE.splash, box = screenBoxOf(who);
  if (box) mud(box.x, box.bottom - 10, 36, box.w / 2);
  Sfx.splash();
  let soaked = 0;
  for (const r of rivals) {
    if (r === who || r.air || r.ko > 0 || Math.abs(r.dist - who.dist) > S.z || Math.abs(r.x - who.x) > S.x) continue;
    r.speed *= 1 - S.loss; soaked++;
    const b = screenBoxOf(r); if (b) mud(b.x, (b.top + b.bottom) / 2, 30, b.w / 2);
    if (!bubbles.some(q => q.who === r)) curse(r);
  }
  popup(soaked ? 'CHHAPAAK!' : 'SPLASH!', W / 2, H - 260, '#bcaaa4', soaked ? 32 : 24);
  return soaked;
}
function resolveAttack(att, side) {
  if (att.air) return; // (or hit from it)
  const attIsPlayer = !!att.isPlayer, w = att.weapon || LATHI;
  const targets = attIsPlayer ? rivals.filter(r => !r.ko) : [player];
  let best = null, bestDz = 1e9;
  for (const t of targets) {
    if (t === att || t.air) continue; // (no one can be hit in the air)
    if (t.isPlayer && (t.crash > 0 || t.inv > 0)) continue;
    const dz = t.dist - att.dist, dx = t.x - att.x;
    if (Math.abs(dz) < 440 && dx * side > 0.02 && Math.abs(dx) < 0.8 * w.reach && Math.abs(dz) < bestDz) { best = t; bestDz = Math.abs(dz); }
  }
  if (!best) { if (attIsPlayer) Sfx.whoosh(); return; }
  Sfx.hit(w.sound);
  const dmg = attIsPlayer ? rand(14, 22) * w.power : rand(7, 12) * w.power * (1 + round * 0.1) * (0.8 + def.rivals.skill * 0.3);
  const c = CONTACTS[w.contact] || CONTACTS.body; // a blow to the head, the body or down by the wheels
  best.health -= dmg; best.hurt = 0.3; best.x += side * c.shove; best.speed *= c.keep;
  if (attIsPlayer) best.grudgeT = 10; // some of them don't forget it
  const word = pick(w.hitWords);
  if (best.health <= 0 || Math.random() < 0.75) curse(best);
  takeHit(best, w.contact || 'body', side);
  // the spot on screen where it landed: on the side facing the attacker, at the height the weapon strikes
  const s = screenBoxOf(best);
  const hitX = s ? s.x - side * s.w * 0.42 : W / 2 + side * 200, hitY = s ? lerp(s.bottom, s.top, c.up) : H - 300;
  impact(hitX, hitY, w, side);
  if (best.isPlayer) { popup(word, hitX + side * 40, hitY - 26, '#ff5252', 38); shake = Math.max(shake, 0.25);
    if (best.health <= 0) crashPlayer('KNOCKED OUT!', 0, side); }
  else {
    popup(word, hitX, hitY - 26, '#ffeb3b', 40);
    if (best.health <= 0) {
      best.ko = 4.5; best.koBy = 'player'; best.koDir = side; player.kos++;
      Sfx.ko(); msg(`${best.name} KNOCKED OUT!  +${fmtCash(100)}`, '#ffeb3b');
    }
  }
}

// lay a tyre mark under each rear wheel from where it was last frame to where it is now
function layTyreMarks() {
  const a = bodyAngle(), f = [Math.cos(a), Math.sin(a)], r = [-Math.sin(a), Math.cos(a)]; // forward / right, as (dist, world x)
  const now = [-1, 1].map(k => ({ d: player.dist - 340 * f[0] + k * 240 * r[0], x: (player.x * ROAD_W - 340 * f[1] + k * 240 * r[1]) / ROAD_W }));
  if (player.markAt) for (let k = 0; k < 2; k++) {
    const was = player.markAt[k];
    if (Math.abs(now[k].d - was.d) < 600) skidMarks.push({ d1: was.d, x1: was.x, d2: now[k].d, x2: now[k].x, t: worldT });
  }
  player.markAt = now;
  if (skidMarks.length > 700) skidMarks.splice(0, skidMarks.length - 700);
}
function crashPlayer(reason, dmg, dir) {
  if (player.crash > 0) return;
  player.crash = 2.4; player.crashDir = dir || (Math.random() < 0.5 ? -1 : 1);
  player.health = Math.max(0, player.health - dmg); player.atk = null;
  player.drift = 0; player.driftT = 0; player.driftPts = 0; player.boostT = 0; if (stats) stats.breakChain();
  player.air = null; player.y = 0;
  Sfx.crash(); shake = 0.6; msg(reason, '#ff5252', 2);
  for (let i = 0; i < 18; i++) particles.push({ x: W / 2 + rand(-60, 60), y: H - 80, vx: rand(-200, 200), vy: rand(-260, -60), t: rand(0.5, 1), size: rand(3, 7), color: pick(['#ffd54f', '#bdbdbd', '#795548', '#ff7043']), g: 500 });
}
// a knock from traffic: it costs a little health, and running out knocks you out (like a lathi hit)
function bumpPlayer(dmg, dir) {
  player.health = Math.max(0, player.health - dmg); Sfx.bump();
  if (player.health <= 0) crashPlayer('KNOCKED OUT!', 0, dir);
}
