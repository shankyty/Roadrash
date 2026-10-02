'use strict';
// Each shipped style builds the kind of road and traffic it promises, on the tracks that use it.
const test = require('node:test'), assert = require('node:assert');
const RRR = require('./load-game.js');
const { buildWorld } = require('./build-world.js');

const STYLE_OF = { 'marine-drive': 'drift', 'charminar-road': 'classic', 'sea-link': 'speed', 'ring-road': 'traffic',
  'western-express': 'traffic', 'marina-beach': 'speed', 'juhu-beach': 'drift' };
const sharpest = road => Math.max(...road.segments.map(s => Math.abs(s.curve)));
const vehicles = (traffic, dir) => traffic.filter(c => c.type !== 'cow' && c.type !== 'dog' && c.dir === dir);
const world = id => { const def = RRR.resolve(id); return { def, ...buildWorld(def) }; };

test('every track has the style the design assigns it', () => {
  assert.deepStrictEqual(Object.fromEntries(RRR.order().map(id => [id, RRR.tracks.get(id).style])), STYLE_OF);
});
for (const id of RRR.order()) {
  test(`${id} spawns traffic in its style's numbers`, () => {
    const { def, traffic } = world(id), sameWay = Math.round(def.traffic.count * def.traffic.countScale);
    assert.strictEqual(vehicles(traffic, 1).length, sameWay);
    assert.strictEqual(vehicles(traffic, -1).length, Math.round(sameWay * def.traffic.oncoming));
    assert.ok(traffic.every(c => c.type === 'cow' || c.type === 'dog' || c.type in def.traffic.mix));
  });
}
for (const id of ['sea-link', 'marina-beach']) {
  test(`${id} (speed) is wide, gentle and has no junctions or tractors`, () => {
    const { def, road, traffic } = world(id);
    assert.strictEqual(def.handling.topSpeed, 1.25);
    assert.ok(sharpest(road) <= 3);
    assert.ok(road.segments.every(s => s.lanes === 3));
    assert.strictEqual(road.junctions.length, 0);
    assert.ok(!traffic.some(c => c.type === 'tractor'));
  });
}
for (const id of ['marine-drive', 'juhu-beach']) {
  test(`${id} (drift) has bends up to sharpness 8 and mostly bends`, () => {
    const { def, road } = world(id);
    assert.strictEqual(sharpest(road), 8);
    const bends = road.segments.filter(s => Math.abs(s.curve) >= 2).length;
    assert.ok(bends / road.segments.length > 0.5, `only ${Math.round(100 * bends / road.segments.length)}% bends`);
    assert.ok(def.handling.driftScrub < 0.22 && def.handling.driftGrip < 1 && def.handling.driftExitBoost > 0);
  });
}
for (const id of ['western-express', 'ring-road']) {
  test(`${id} (traffic) is wide and gentle, with junctions and more same-way than oncoming traffic`, () => {
    const { def, road, traffic } = world(id);
    assert.ok(sharpest(road) <= 3);
    assert.ok(road.segments.every(s => s.lanes === 3));
    assert.ok(road.junctions.length > 0);
    assert.ok(vehicles(traffic, 1).length > 2 * vehicles(traffic, -1).length);
    assert.ok(def.handling.slipstream > 0);
  });
}
test('charminar-road (classic) keeps the classic road, traffic and handling', () => {
  const { def, road } = world('charminar-road');
  assert.strictEqual(sharpest(road), 6);
  assert.deepStrictEqual([def.handling.topSpeed, def.handling.driftScrub, def.handling.driftGrip, def.handling.driftExitBoost, def.handling.slipstream], [1, 0.22, 1, 0, 0]);
  assert.deepStrictEqual([def.traffic.countScale, def.traffic.oncoming], [1, 0.8]);
});
