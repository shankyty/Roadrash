'use strict';
// Builds a track's road from its resolved definition: the road pieces from the style's recipe, then lanes,
// junctions, the start line, roadside scenery and signs. No DOM access and no state between builds.
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});
const { easeIn, easeInOut, pick, mulberry32, weightedPick } = RRR.util;

// The road is two-way and we keep left: our carriageway is x < 0, oncoming traffic uses x > 0. x is in fixed
// units (1 = 2000 world units, one lane is LANE_W); stretches alternate between 4 lanes (2 each way) and
// 6 lanes (3 each way), with a tapered transition. Every segment carries its half-width at both ends
// (hw1, hw2), the wider of the two (half) and the lanes each way that are usable along all of it (lanes).
const LANE_W = 0.6, TAPER = 30, JUNCTION_LEN = 12;
const laneX = (dir, i) => -dir * (i + 0.5) * LANE_W;  // lane i counted from the centre line; dir +1 = our way

// The pieces a style's road recipe can ask for. Each lays itself with b.addRoad(enter, hold, leave, curve, hill);
// b.R is the track's seeded generator, b.sgn() a seeded -1 or 1, L the length drawn for this piece.
const PIECES = {
  straight: (b, p, L) => b.addRoad(L, L, L, 0, 0),
  curve: (b, p, L) => b.addRoad(L, L, L, b.sgn() * pick(p.curves, b.R), pick(p.hills, b.R)),
  sCurve: (b, p) => { const s = b.sgn(); b.addRoad(50, 50, 50, s * p.curve, 0); b.addRoad(50, 50, 50, -s * p.curve * 2, pick(p.hills, b.R)); b.addRoad(50, 50, 50, s * p.curve, 0); },
  hill: (b, p, L) => b.addRoad(L, L, L, 0, b.sgn() * pick(p.hills, b.R)),
  rollers: b => { for (let i = 0; i < 4; i++) b.addRoad(25, 25, 25, 0, (i % 2 ? -1 : 1) * 10); },
  bumps: b => { for (let i = 0; i < 8; i++) b.addRoad(10, 10, 10, 0, (i % 2 ? -1 : 1) * 3); },
  curveHill: (b, p, L) => b.addRoad(L, L, L, b.sgn() * p.curve, b.sgn() * p.hill),
};

class TrackBuilder {
  // def: resolved track definition · round: tour number (later tours reshuffle the road)
  // constants: { SEG_LEN, RUMBLE_LEN, PLAYER_Z, GRID_GAP } · sprites: the shared sprite table (SP)
  // themeSprites: { buildings, billboards } painted for this track · random: source for cosmetic offsets
  constructor({ def, round, constants, sprites, themeSprites, random = Math.random }) {
    Object.assign(this, { def, constants, SP: sprites, themeSprites });
    this.rand = (a, b) => a + random() * (b - a);
    this.R = mulberry32(def.seed + round * 1000);
    this.sgn = () => (this.R() < 0.5 ? -1 : 1);
    this.segments = []; this.junctions = [];
  }
  build() {
    const { SEG_LEN, PLAYER_Z, GRID_GAP } = this.constants, { segments } = this;
    this.layPieces();
    const trackLength = segments.length * SEG_LEN;
    this.layoutLanes();
    // start / finish
    const startZ = PLAYER_Z + 3 * GRID_GAP + 400, fs = Math.floor(startZ / SEG_LEN);
    segments[fs].finish = true; segments[fs + 1].finish = 2;
    segments[fs].sprites.push({ img: this.SP.arch, offset: 0, nw: segments[fs].half * 2 + 0.6, center: true, kind: 'arch' });
    if (this.def.road.junctions) this.layoutJunctions(fs);
    this.placeScenery();
    this.placeSigns(fs);
    this.settleRoadside();
    return { segments, trackLength, startZ, junctions: this.junctions };
  }

  lastY() { const s = this.segments; return s.length ? s[s.length - 1].p2.world.y : 0; }
  addSegment(curve, y) {
    const { SEG_LEN, RUMBLE_LEN } = this.constants, n = this.segments.length;
    this.segments.push({ index: n, curve, sprites: [], solids: [], cars: [], dark: Math.floor(n / RUMBLE_LEN) % 2 === 1,
      p1: { world: { x: 0, y: this.lastY(), z: n * SEG_LEN }, camera: {}, screen: {} },
      p2: { world: { x: 0, y, z: (n + 1) * SEG_LEN }, camera: {}, screen: {} } });
  }
  addRoad(enter, hold, leave, curve, y = 0) {
    const { SEG_LEN } = this.constants, startY = this.lastY(), endY = startY + Math.round(y) * SEG_LEN, total = enter + hold + leave;
    for (let n = 0; n < enter; n++) this.addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
    for (let n = 0; n < hold; n++) this.addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
    for (let n = 0; n < leave; n++) this.addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
  }
  // a straight off the line, pieces drawn by weight until the road is long enough, then a long bend back
  // down to the starting height so the lap joins up
  layPieces() {
    const { road, length } = this.def, { R, segments } = this;
    let total = 0; for (const p of road.pieces) total += p.weight;
    this.addRoad(20, 40, 20, 0, 0);
    while (segments.length < length) {
      const t = R() * total, L = pick(road.lengths, R);
      let piece = road.pieces[road.pieces.length - 1], upTo = 0;
      for (const p of road.pieces) { upTo += p.weight; if (t < upTo) { piece = p; break; } }
      PIECES[piece.kind](this, piece, L);
    }
    this.addRoad(150, 150, 150, this.sgn() * 2, -this.lastY() / this.constants.SEG_LEN);
    this.addRoad(30, 30, 30, 0, 0);
  }
  layoutLanes() {
    const { R, segments } = this, N = segments.length, blocks = [];
    if (this.def.road.lanes === 'wide') blocks.push({ s: 0, per: 3 });
    else {
      let at = 0, per = 3;
      while (at < N - 120) { blocks.push({ s: at, per }); at += at === 0 ? 300 : 160 + Math.floor(R() * 220); per = per === 3 ? 2 : 3; }
      if (blocks[blocks.length - 1].per !== 3) blocks.pop(); // wrap back into the start stretch without a jump
    }
    const blockAt = k => { let b = 0; while (b + 1 < blocks.length && blocks[b + 1].s <= k) b++; return b; };
    const halfAtK = k => {
      const b = blockAt(k), cur = blocks[b], prev = blocks[b - 1];
      if (!prev || k - cur.s >= TAPER) return cur.per * LANE_W;
      return easeInOut(prev.per, cur.per, (k - cur.s) / TAPER) * LANE_W;
    };
    segments.forEach((seg, k) => {
      seg.hw1 = halfAtK(k); seg.hw2 = halfAtK(k + 1); seg.half = Math.max(seg.hw1, seg.hw2);
      const b = blockAt(k), cur = blocks[b], prev = blocks[b - 1];
      seg.lanes = prev && k - cur.s < TAPER ? Math.min(prev.per, cur.per) : cur.per;
    });
    segments.blocks = blocks;
  }
  layoutJunctions(fs) {
    const { R, segments, junctions } = this, { SEG_LEN } = this.constants;
    const N = segments.length, flat = (a, b) => Math.abs(segments[b].p1.world.y - segments[a].p1.world.y) < 300;
    let n = fs + 200;
    while (n < N - 200) {
      let found = -1;
      for (let k = n; k < Math.min(N - 200, n + 260) && found < 0; k++) {
        let ok = flat(k, k + JUNCTION_LEN);
        for (let i = k - 25; ok && i < k + JUNCTION_LEN + 25; i++) { const q = segments[i]; if (Math.abs(q.curve) > 0.5 || q.hw1 !== q.hw2 || q.finish) ok = false; }
        if (ok) found = k;
      }
      if (found < 0) { n += 260; continue; }
      const j = { i: junctions.length, s0: found, s1: found + JUNCTION_LEN - 1, z0: found * SEG_LEN, z1: (found + JUNCTION_LEN) * SEG_LEN,
        phase: R() * 22, cop: junctions.length % 2 === 0, busy: false, spawn: [0, 0], fined: false };
      j.zc = (j.z0 + j.z1) / 2; j.half = segments[found].half;
      for (let i = found; i <= j.s1; i++) segments[i].junction = j;
      for (let i = found - 5; i <= j.s1 + 5; i++) segments[i].clear = true;
      junctions.push(j);
      n = found + JUNCTION_LEN + 260 + Math.floor(R() * 200);
    }
  }
  // buildings and temples stand in a row along each side and never overlap (they're solid 3D boxes);
  // trees, palms, hoardings and chai stalls go in front of them, nearer the road
  placeScenery() {
    const { R, SP, rand, segments, themeSprites } = this, { SEG_LEN } = this.constants, { density, scenery } = this.def.look;
    const busyUntil = { '-1': 0, '1': 0 };
    for (let n = 30; n < segments.length; n++) {
      const seg = segments[n];
      if (seg.clear) continue; // junction: the cross road runs through here
      if (n % 18 === 0) { const side = (n / 18) % 2 ? 1 : -1; seg.sprites.push({ img: side < 0 ? SP.lampL : SP.lampR, offset: side * 1.12, nw: 0.13, solid: true, kind: 'lamp' }); }
      if (n % 150 === 0) seg.sprites.push({ img: SP.milestone, offset: pick([-1, 1], R) * 1.1, nw: 0.08, solid: true, kind: 'milestone' });
      if (R() < density) {
        const side = R() < 0.5 ? -1 : 1;
        let kind = weightedPick(scenery, R);
        if ((kind === 'building' || kind === 'temple') && (n < busyUntil[side] || segments.slice(n, n + 9).some(q => q.clear))) kind = scenery.palm ? 'palm' : 'tree';
        let s;
        if (kind === 'palm') s = { img: side < 0 ? SP.palm : SP.palmF, offset: side * rand(1.25, 1.5), nw: 0.45, solid: true };
        else if (kind === 'tree') s = { img: pick(SP.trees, R), offset: side * rand(1.25, 1.4), nw: 0.8, solid: true };
        else if (kind === 'building') { s = { img: pick(themeSprites.buildings, R), offset: side * rand(2.05, 2.35), nw: 1.1, solid: true, len: 1200 + Math.floor(R() * 400) }; busyUntil[side] = n + Math.ceil(s.len / SEG_LEN) + 1; }
        else if (kind === 'billboard') s = { img: pick(themeSprites.billboards, R), offset: side * rand(1.2, 1.4), nw: 0.95, solid: true };
        else if (kind === 'temple') { s = { img: SP.temple, offset: side * rand(2.1, 2.4), nw: 1.1, solid: true }; busyUntil[side] = n + 12; }
        else s = { img: SP.chai, offset: side * rand(1.2, 1.35), nw: 0.6, solid: true };
        s.kind = kind;
        seg.sprites.push(s);
      }
    }
  }
  // signals, the cop's post and the roadside signs (offsets are for a road edge at 1; moved out later)
  placeSigns(fs) {
    const { R, SP, segments } = this, N = segments.length;
    const put = (n, s) => { n = ((n % N) + N) % N; if (!segments[n].clear || s.kind !== 'sign') segments[n].sprites.push(s); };
    const sign = (n, name, side = -1) => put(n, { img: SP.signs[name], offset: side * 1.3, nw: 0.3, solid: true, kind: 'sign', facing: side < 0 ? 1 : -1 });
    for (const j of this.junctions) {
      put(j.s0 - 1, { img: SP.signal, offset: -1.22, nw: 0.2, solid: true, kind: 'signal', junction: j, facing: 1 });
      put(j.s1 + 1, { img: SP.signal, offset: 1.22, nw: 0.2, solid: true, kind: 'signal', junction: j, facing: -1 });
      if (j.cop) put(j.s0 - 2, { img: SP.cop, offset: -1.55, nw: 0.22, solid: false, kind: 'cop', junction: j });
      sign(j.s0 - 70, 'signal'); sign(j.s1 + 70, 'signal', 1);
    }
    for (const b of segments.blocks) if (b.s > 0 && b.per === 2) { sign(b.s - 60, 'narrow'); sign(b.s + TAPER + 60, 'narrow', 1); }
    for (let n = fs + 60; n < N - 60; n += 90 + Math.floor(R() * 160)) {
      if (segments[n].clear) continue;
      sign(n, pick(['limit40', 'limit50', 'limit60', 'limit50', 'keepleft', 'nohorn'], R), R() < 0.75 ? -1 : 1);
    }
  }
  settleRoadside() {
    const { segments } = this, { SEG_LEN } = this.constants;
    // everything by the roadside was placed for a road edge at 1: move it out to this stretch's edge
    segments.forEach((seg, n) => {
      for (const s of seg.sprites) {
        if (s.center || s.edgeDone) continue;
        const span = s.kind === 'building' ? Math.ceil((s.len || 1400) / SEG_LEN) : 1;
        let h = 0; for (let k = 0; k <= span; k++) h = Math.max(h, segments[(n + k) % segments.length].half);
        s.offset += Math.sign(s.offset) * (h - 1); s.edgeDone = true;
      }
    });
    // solid things block every segment they span (a building is several segments long)
    segments.forEach((seg, n) => {
      for (const s of seg.sprites) if (s.solid) {
        const span = s.kind === 'building' ? Math.ceil(s.len / SEG_LEN) : 1;
        for (let k = 0; k < span; k++) segments[(n + k) % segments.length].solids.push(s);
      }
    });
  }
}

RRR.road = { LANE_W, TAPER, JUNCTION_LEN, laneX };
RRR.PIECES = PIECES;
RRR.buildTrack = opts => new TrackBuilder(opts).build();
})();
