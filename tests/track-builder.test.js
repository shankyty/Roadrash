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
