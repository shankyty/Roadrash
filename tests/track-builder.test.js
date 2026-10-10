'use strict';
const test = require('node:test'), assert = require('node:assert');
const { RRR, buildRoad, testDef } = require('./build-world.js');

test('the road is at least as long as asked and comes back down to the starting height', () => {
  const { segments, trackLength } = buildRoad(testDef());
  assert.ok(segments.length >= 2600);
  assert.strictEqual(trackLength, segments.length * 200);
  assert.ok(Math.abs(segments[segments.length - 1].p2.world.y) < 10); // a few units off at most: the lap joins up
  assert.ok(segments.every((s, i) => s.index === i && (i === 0 || s.p1.world.y === segments[i - 1].p2.world.y)));
});
test('the start line sits just past the grid, under the arch', () => {
  const { segments, startZ } = buildRoad(testDef()), fs = Math.floor(startZ / 200);
  assert.strictEqual(segments[fs].finish, true);
  assert.strictEqual(segments[fs + 1].finish, 2);
  assert.ok(segments[fs].sprites.some(q => q.kind === 'arch'));
  assert.ok(buildRoad(testDef(), { in3D: false }).startZ < startZ); // the 2D grid is shorter
});
test('the same definition and tour always build the same road; a later tour builds another', () => {
  const curves = road => road.segments.map(s => s.curve).join();
  assert.strictEqual(curves(buildRoad(testDef())), curves(buildRoad(testDef())));
  assert.notStrictEqual(curves(buildRoad(testDef())), curves(buildRoad(testDef(), { round: 1 })));
});
test('lanes "alternate" narrows to two lanes in places and signs it', () => {
  const { segments } = buildRoad(testDef());
  assert.ok(segments.some(s => s.lanes === 2) && segments.some(s => s.lanes === 3));
  assert.ok(segments.some(s => s.sprites.some(q => q.img === 'sign:narrow')));
});
test('lanes "wide" keeps three lanes each way for the whole road', () => {
  const { segments } = buildRoad(testDef({ road: { lanes: 'wide' } }));
  assert.ok(segments.every(s => s.lanes === 3 && s.hw1 === s.hw2 && s.half === 3 * RRR.road.LANE_W));
  assert.ok(!segments.some(s => s.sprites.some(q => q.img === 'sign:narrow')));
});
test('junctions sit on flat, straight road and keep their stretch clear of scenery', () => {
  const { segments, junctions } = buildRoad(testDef());
  assert.ok(junctions.length > 0);
  for (const j of junctions) {
    for (let i = j.s0; i <= j.s1; i++) assert.ok(segments[i].junction === j && Math.abs(segments[i].curve) <= 0.5);
    assert.ok(segments.slice(j.s0, j.s1 + 1).every(s => s.sprites.every(q => !['building', 'temple', 'palm', 'tree', 'billboard', 'chai'].includes(q.kind))));
  }
});
test('junctions off builds a road with no junctions, signals or cops', () => {
  const { segments, junctions } = buildRoad(testDef({ road: { junctions: false } }));
  assert.strictEqual(junctions.length, 0);
  assert.ok(!segments.some(s => s.junction || s.clear || s.sprites.some(q => ['signal', 'cop'].includes(q.kind))));
});
test('a recipe of one piece kind lays only that piece between the start and the closing bend', () => {
  const { segments } = buildRoad(testDef({ road: { pieces: [{ kind: 'straight', weight: 1 }] } }));
  assert.ok(segments.slice(80, 2600).every(s => s.curve === 0 && s.p2.world.y === 0));
});
test('bends are no sharper than the recipe allows', () => {
  const gentle = { pieces: [{ kind: 'curve', weight: 1, curves: [1, 2, 3], hills: [0] }] };
  const { segments } = buildRoad(testDef({ road: gentle }));
  assert.ok(segments.slice(80, 2600).every(s => Math.abs(s.curve) <= 3));
  assert.ok(segments.some(s => Math.abs(s.curve) === 3));
});
test('solid roadside things block every segment they span', () => {
  const { segments } = buildRoad(testDef());
  const n = segments.findIndex(s => s.sprites.some(q => q.kind === 'building')), b = segments[n].sprites.find(q => q.kind === 'building');
  for (let k = 0; k < Math.ceil(b.len / 200); k++) assert.ok(segments[n + k].solids.includes(b));
  assert.ok(Math.abs(b.offset) > segments[n].half); // moved out past the road edge
});

test('the tables the validator reads match the builder: every piece and scenery kind builds from exactly the listed parameters', () => {
  assert.deepStrictEqual(Object.keys(RRR.PIECE_PARAMS).sort(), Object.keys(RRR.PIECES).sort());
  for (const [kind, params] of Object.entries(RRR.PIECE_PARAMS)) {
    const piece = { kind, weight: 1 };
    for (const [name, type] of Object.entries(params)) piece[name] = type === 'numbers' ? [2] : 2;
    assert.doesNotThrow(() => buildRoad(testDef({ road: { pieces: [piece] } })), kind);
  }
  for (const kind of RRR.SCENERY_KINDS) {
    const road = buildRoad({ ...testDef(), look: { ...testDef().look, density: 1, scenery: { [kind]: 1 } } });
    assert.ok(road.segments.some(s => s.sprites.some(q => q.kind === kind)), kind);
  }
});

// ---- the footpath: stalls, cart ramps and where the street furniture goes
const FP = { width: 0.6, climbLoss: 0.25, dropLoss: 0.12, stallEvery: [150, 300] };
const F = RRR.footpath;
const onPath = (road, kind) => road.segments.flatMap((s, n) => s.sprites.filter(q => q.onPath && q.kind === kind).map(q => ({ n, q })));
const stallCarts = road => onPath(road, 'cart').filter(c => !c.q.junction), signalCarts = road => onPath(road, 'cart').filter(c => c.q.junction);

test('with a footpath, every stall has a cart ramp a fixed way before it, on the same side', () => {
  const road = buildRoad(testDef({ road: { footpath: FP } })), stalls = onPath(road, 'chai'), carts = stallCarts(road);
  assert.ok(stalls.length >= 6, `only ${stalls.length} stalls`);
  assert.strictEqual(carts.length, stalls.length);
  for (const { n, q } of stalls) {
    const cart = carts.find(c => c.n === n - F.CART.lead && Math.sign(c.q.offset) === Math.sign(q.offset));
    assert.ok(cart, `no cart before the stall at ${n}`);
    assert.strictEqual(cart.q.seg0, cart.n);
    assert.ok(q.solid && cart.q.solid);
  }
  assert.ok(stalls.some(s => s.q.offset < 0) && stalls.some(s => s.q.offset > 0)); // both sides
});
test('stalls and carts stand in the middle of the footpath and block the segments they cover', () => {
  const road = buildRoad(testDef({ road: { footpath: FP } }));
  for (const { n, q } of [...onPath(road, 'chai'), ...onPath(road, 'cart')]) {
    const half = road.segments[n].half, mid = Math.abs(q.offset) + q.nw / 2;
    assert.ok(Math.abs(mid - F.centre(half, FP)) < 1e-9, `${q.kind} at ${n} is off centre`);
    const span = q.kind === 'cart' ? F.CART.length : 1;
    for (let k = 0; k < span; k++) assert.ok(road.segments[n + k].solids.includes(q));
  }
});
test('from just before a cart to well past its stall the road is plain: no junction, no lane taper, no start line', () => {
  const road = buildRoad(testDef({ road: { footpath: FP } }));
  for (const { n } of stallCarts(road))
    for (let k = n - 4; k <= n + F.CART.runout; k++) { const s = road.segments[k]; assert.ok(!s.junction && !s.clear && !s.finish && s.hw1 === s.hw2); }
});
test('the longest straight jump lands inside that plain stretch', () => {
  // 100 km/h is 15000 track units a second; the run-out is counted in segments of 200
  const flown = 15000 * F.jump(1.25).airTime;
  assert.ok(flown < F.CART.runout * 200, `${Math.round(flown)} flown`);
});
test('nothing but stalls and carts stands on the footpath', () => {
  const road = buildRoad(testDef({ road: { footpath: FP } }));
  road.segments.forEach((s, n) => {
    for (const q of s.sprites) {
      if (q.center || q.onPath || q.inLane || !q.solid) continue;
      // buildings and temples have their front wall at the offset; everything else has its inner edge there
      assert.ok(Math.abs(q.offset) >= F.backEdge(s.half, FP), `${q.kind} at ${n} stands on the footpath`);
    }
  });
});
test('the footpath has its own seed: the same tour builds the same one, a later tour another, and the road itself never moves', () => {
  const spots = road => onPath(road, 'chai').map(s => `${s.n}${s.q.offset < 0 ? 'L' : 'R'}`).join();
  const def = testDef({ road: { footpath: FP } });
  assert.strictEqual(spots(buildRoad(def)), spots(buildRoad(def)));
  assert.notStrictEqual(spots(buildRoad(def)), spots(buildRoad(def, { round: 1 })));
  const shape = road => road.segments.map(s => `${s.curve}/${s.lanes}/${s.sprites.filter(q => !q.onPath && !q.inLane).map(q => q.kind).join('+')}`).join();
  assert.strictEqual(shape(buildRoad(def)), shape(buildRoad(testDef())));
});
test('without a footpath there are no stalls or carts and furniture stands where it always did', () => {
  const road = buildRoad(testDef());
  assert.strictEqual(onPath(road, 'chai').length + onPath(road, 'cart').length, 0);
  const lamp = road.segments.flatMap(s => s.sprites.filter(q => q.kind === 'lamp').map(q => Math.abs(q.offset) - s.half))[0];
  assert.ok(Math.abs(lamp - 0.12) < 1e-9);
});
test('however close the style asks, carts on one side are a cart, its stall and the landing apart', () => {
  const least = F.CART.runout + F.CART.lead + F.CART.length;
  const road = buildRoad(testDef({ road: { footpath: { ...FP, stallEvery: [20, 40] } } }));
  for (const side of [-1, 1]) {
    const at = stallCarts(road).filter(({ q }) => Math.sign(q.offset) === side).map(({ n }) => n);
    assert.ok(at.length > 1, `${at.length} carts`);
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= least, `${at[i - 1]} then ${at[i]}`);
  }
});
test('a cart stands on both footpaths before every traffic signal, ending two segments short of the junction', () => {
  const road = buildRoad(testDef({ road: { footpath: FP } })), carts = signalCarts(road);
  assert.ok(road.junctions.length > 0);
  assert.strictEqual(carts.length, 2 * road.junctions.length);
  for (const j of road.junctions) for (const side of [-1, 1]) {
    const k0 = j.s0 - F.CART.length - 2;
    const cart = carts.find(c => c.n === k0 && Math.sign(c.q.offset) === side);
    assert.ok(cart, `no cart on side ${side} before the signal at ${j.s0}`);
    assert.strictEqual(cart.q.seg0, k0); assert.strictEqual(cart.q.junction, j); assert.ok(cart.q.solid);
    for (let k = 0; k < F.CART.length; k++) assert.ok(!road.segments[k0 + k].junction && road.segments[k0 + k].solids.includes(cart.q));
  }
});
test('no stall or stall cart stands where a signal jump is taken, flown or landed', () => {
  const road = buildRoad(testDef({ road: { footpath: { ...FP, stallEvery: [20, 40] } } }));
  for (const { n: ks, q } of signalCarts(road)) {
    const j = q.junction, side = Math.sign(q.offset);
    for (const { n } of stallCarts(road).filter(c => Math.sign(c.q.offset) === side))
      assert.ok(n + F.CART.runout < ks - 4 || n - 4 > j.s1 + F.CART.runout, `stall cart at ${n} meets the signal cart at ${ks}`);
    for (const { n } of onPath(road, 'chai').filter(c => Math.sign(c.q.offset) === side))
      assert.ok(n < ks - 4 || n > j.s1 + F.CART.runout, `stall at ${n} stands in the signal jump from ${ks}`);
  }
});
test('no signal carts without junctions, or without a footpath', () => {
  assert.strictEqual(signalCarts(buildRoad(testDef({ road: { footpath: FP, junctions: false } }))).length, 0);
  assert.strictEqual(signalCarts(buildRoad(testDef())).length, 0);
});
test('closer stall spacing puts more stalls on the road', () => {
  const count = every => onPath(buildRoad(testDef({ road: { footpath: { ...FP, stallEvery: every } } })), 'chai').length;
  assert.ok(count([100, 200]) > count([250, 450]));
});

const inLane = (road, kind) => road.segments.flatMap((s, n) => s.sprites.filter(q => q.inLane && q.kind === kind).map(q => ({ n, s, q })));
test('carts parked in our lanes: centred in a lane on our side, on a plain stretch with room to land, solid for their length', () => {
  const road = buildRoad(testDef({ road: { footpath: FP } })), carts = inLane(road, 'cart'), lanes = new Set();
  assert.ok(carts.length >= 2, `${carts.length} lane carts`);
  for (const { n, s, q } of carts) {
    const centre = q.offset - q.nw / 2, lane = -centre / RRR.road.LANE_W - 0.5;
    assert.ok(Math.abs(lane - Math.round(lane)) < 1e-9 && lane >= 0 && lane < s.lanes, `cart at ${n} is not in a lane`);
    lanes.add(Math.round(lane));
    assert.strictEqual(q.seg0, n); assert.ok(q.solid);
    for (let k = 0; k < F.CART.length; k++) assert.ok(road.segments[n + k].solids.includes(q));
    for (let k = n; k <= n + F.CART.runout; k++) assert.ok(!road.segments[k].junction && road.segments[k].hw1 === road.segments[k].hw2, `no room to land after ${n}`);
    for (let k = n - 15; k <= n + 70; k++) assert.ok(Math.abs(road.segments[k].curve) <= F.CART.laneBend, `a hard bend at ${k}, by the cart at ${n}`);
  }
  assert.ok(lanes.size > 1, 'every lane cart is in the same lane');
});
test('potholes: in a lane on our side, never in a junction or under a lane cart, and they slow you without stopping you', () => {
  const road = buildRoad(testDef({ road: { footpath: FP } })), holes = inLane(road, 'pothole');
  assert.ok(holes.length > 10, `${holes.length} potholes`);
  const carts = inLane(road, 'cart');
  for (const { n, s, q } of holes) {
    assert.ok(q.offset < 0 && !q.solid && !s.junction, `pothole at ${n}`);
    assert.ok(!carts.some(c => n >= c.n - 2 && n < c.n + F.CART.length + 2), `pothole under the cart near ${n}`);
  }
  assert.ok(F.POTHOLE.loss > 0 && F.POTHOLE.loss < 0.5);
  const wet = holes.filter(h => h.q.wet).length; // some full of dirty water, drawn as such
  assert.ok(wet > holes.length * 0.2 && wet < holes.length * 0.6, `${wet} of ${holes.length} wet`);
  for (const { q } of holes) assert.strictEqual(q.img, q.wet ? 'potholeWet' : 'pothole');
  assert.strictEqual(inLane(buildRoad(testDef()), 'pothole').length, 0); // (the classic roads without a footpath stay as they were)
});
test('in the rain every pothole is full of water, and the rest of the road is laid out the same', () => {
  const dry = testDef({ road: { footpath: FP } }), wet = { ...dry, look: { ...dry.look, rain: true } };
  const holes = inLane(buildRoad(wet), 'pothole');
  assert.ok(holes.length > 10 && holes.every(h => h.q.wet));
  const at = road => inLane(road, 'pothole').map(h => `${h.n}:${h.q.offset}`).join();
  assert.strictEqual(at(buildRoad(wet)), at(buildRoad(dry)));
});
