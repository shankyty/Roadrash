'use strict';
// Traffic crossing at junctions, and the challan for jumping the red.
// ------------------------------------------------------------------ junction cross traffic
// When the cross road has green, traffic streams across the junction (keeping left: eastbound on the far
// side, westbound on the near side); on red it queues at the cross road's stop lines. Cross vehicles brake
// for anything in their path but can't stop instantly, so jumping the red is a real risk. A traffic cop at
// every other junction fines you for jumping it.
const CROSS_TYPES = [
  { type: 'car', nw: 0.38, len: 1500, label: 'CAR' }, { type: 'car', nw: 0.38, len: 1500, label: 'CAR' },
  { type: 'bike', nw: 0.17, len: 860, label: 'BIKE' }, { type: 'bike', nw: 0.17, len: 860, label: 'BIKE' },
  { type: 'auto', nw: TUK_NW, len: TUK_LEN, label: 'AUTO' }, { type: 'bus', nw: 0.56, len: 3200, label: 'BUS' },
];
// where a cross road's queue waits: back from the road's edge, and behind the footpath where there is one
const stopLine = j => j.half + 0.35 + (footpath() ? FP.KERB_W + footpath().width : 0);
function spawnCross(j, dirX, queued) {
  let d = pick(CROSS_TYPES);
  if (d.type === 'car') { const i = Math.floor(Math.random() * CAR_LOOKS.length); d = { ...d, ...CAR_LOOKS[i], look: CAR_LOOKS[i], img: SP.carLooks[i] }; }
  if (d.type === 'bus') d = { ...d, look: RRR.busLook(def.city.busLooks, Math.random) };
  const lenX = d.len / ROAD_W;
  const stopX = -dirX * stopLine(j);
  const lineUp = crossTraffic.filter(c => c.j === j && c.dirX === dirX && c.x * dirX < stopX * dirX + 0.1);
  if (lineUp.length >= 4) return;
  const back = lineUp.reduce((m, c) => Math.min(m, c.x * dirX - c.lenX / 2), stopX * dirX) - 0.3 - lenX / 2;
  const x = queued ? back * dirX : -dirX * (j.half + 13);
  if (!queued && x * dirX > back) return;
  crossTraffic.push({ j, dirX, x, z: j.zc + dirX * 600, type: d.type, nw: d.nw, len: d.len, lenX, label: d.label, cruise: rand(1.9, 2.4), speed: queued ? 0 : 2.1,
    img: d.img || (d.type === 'bus' ? SP.bus : d.type === 'auto' ? cityAuto().img : pick(SP.bikes)), look: d.look, palette: d.type === 'auto' ? cityAuto().palette : null });
}
// autos in traffic wear the livery of the city you're racing in (no slogan, driver or weapon of their own)
const cityAutos = {};
function cityAuto() {
  const city = def.city.id;
  if (!cityAutos[city]) {
    const l = (homeDriver(city) || DRIVERS[0]).look, palette = { body: l.body, trim: l.trim, canopy: l.canopy };
    cityAutos[city] = { palette, img: makeTuk(l.body, l.trim, l.canopy, l.plate.slice(0, 5) + ' AU') };
  }
  return cityAutos[city];
}
function dropCross(gone) {
  const out = crossTraffic.filter(gone); if (!out.length) return;
  crossTraffic = crossTraffic.filter(c => !gone(c));
  if (use3D) World3D.forget(out); // free their 3D models
}
function updateCross(dt) {
  if (!use3D) return; // (the 2D fallback has no cross traffic)
  for (const j of junctions) {
    const dz = wrapDelta(j.zc - player.dist), active = dz > -4000 && dz < 30000;
    if (!active) { if (j.live) { dropCross(c => c.j === j); j.live = false; } continue; }
    if (!j.live) { j.live = true; for (const dx of [-1, 1]) for (let k = 0; k < 2; k++) spawnCross(j, dx, true); }
    for (const [k, dx] of [[0, -1], [1, 1]]) {
      j.spawn[k] -= dt;
      if (j.spawn[k] <= 0) { const go = crossGo(j); j.spawn[k] = go ? rand(1.2, 2.4) : rand(2.5, 5); spawnCross(j, dx, !go); }
    }
  }
  const bodies = [{ x: player.x, z: player.dist, w: playerW(), l: playerL(), who: player }, ...rivals.map(r => ({ x: r.x, z: r.dist, w: TUK_NW, l: TUK_LEN, who: r })),
    ...traffic.filter(c => c.type !== 'dog').map(c => ({ x: c.x, z: c.z, w: c.nw, l: c.type === 'cow' ? 900 : c.len, who: c }))];
  for (const j of junctions) j.busy = false;
  for (const c of crossTraffic) {
    const inLane = b => Math.abs(wrapDelta(b.z - c.z)) < (c.nw * ROAD_W + b.l) / 2;
    // nearest thing ahead in my path: a body on the road, the car in front, or my stop line when it's red
    let gap = Infinity;
    for (const b of bodies) if (inLane(b)) { const g = (b.x - c.x) * c.dirX - c.lenX / 2 - b.w / 2; if (g > -0.1 && g < gap) gap = g; }
    for (const o of crossTraffic) if (o !== c && o.j === c.j && o.dirX === c.dirX) { const g = (o.x - c.x) * c.dirX - (c.lenX + o.lenX) / 2; if (g > -0.2 && g < gap) gap = g; }
    const stop = (-c.dirX * stopLine(c.j) - c.x) * c.dirX - c.lenX / 2;
    if (!crossGo(c.j) && stop > -0.05 && stop < gap) gap = stop;
    const target = gap === Infinity ? c.cruise : Math.min(c.cruise, Math.sqrt(2 * 3 * Math.max(0, gap - 0.12)));
    c.speed += clamp(target - c.speed, -3 * dt, 1.2 * dt);  // brakes hard, but not instantly
    c.stuckT = c.speed < 0.05 && crossGo(c.j) ? (c.stuckT || 0) + dt : 0;
    c.x += c.dirX * c.speed * dt;
    if (Math.abs(c.x) - c.lenX / 2 < c.j.half + 0.2) c.j.busy = true;
    // hits: you get T-boned; a rival is knocked out
    for (const b of bodies) {
      if (b.who === player ? player.crash > 0 || player.inv > 0 || player.air : b.who.ko > 0 || b.who.air) continue;
      if (!inLane(b) || Math.abs(b.x - c.x) > (c.lenX + b.w) / 2) continue;
      if (b.who === player) { crashPlayer(`T-BONED BY A ${c.label}!`, 25 + c.speed * 6); player.speed = 0; }
      else if (b.who.isRival) { b.who.ko = 2.5; b.who.koDir = c.dirX; b.who.speed *= 0.2; }
      else { b.who.speed = 0; }
      c.speed = 0;
    }
  }
  dropCross(c => Math.abs(c.x) >= c.j.half + 16 || (c.stuckT > 8 && offScreen(c.z)) || c.stuckT > 25);   // (stuck on its green: a jam)
  // jumping the red: the cop blows his whistle and writes a challan
  const front = player.dist + TUK_LEN / 2;
  for (const j of junctions) {
    const line = j.z0 - 150, was = wrapDelta(line - (player._front ?? front)), now = wrapDelta(line - front);
    if (was > 0 && now <= 0 && was - now < 1500 && state === 'race' && player.x < 0.1) { // (a real crossing, not a respawn jump)
      if (lightOf(j) === 'R') {
        if (j.cop) { const fine = 200; cash = Math.max(0, cash - fine); store.set('cash', cash); Sfx.whistle(); msg(`CHALLAN! -₹${fine}`, '#ff8a65', 2); popup('JUMPED THE RED!', W / 2, H - 300, '#ff5252', 24); }
        else popup('JUMPED THE RED!', W / 2, H - 300, '#ff5252', 22);
      }
    }
  }
  player._front = front;
}
