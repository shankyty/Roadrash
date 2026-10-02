'use strict';
const test = require('node:test'), assert = require('node:assert');
const { buildWorld, testDef } = require('./build-world.js');

const count = (traffic, f) => traffic.filter(f).length;
const vehicle = c => c.type !== 'cow' && c.type !== 'dog';

test('same-way vehicles, oncoming vehicles, cows and dogs come in the configured numbers', () => {
  const { traffic } = buildWorld(testDef());
  assert.strictEqual(count(traffic, c => vehicle(c) && c.dir === 1), 30);
  assert.strictEqual(count(traffic, c => vehicle(c) && c.dir === -1), 24); // 30 × 0.8
  assert.strictEqual(count(traffic, c => c.type === 'cow'), 4);
  assert.strictEqual(count(traffic, c => c.type === 'dog'), 6);
});
test('countScale scales same-way traffic, and oncoming follows it', () => {
  const { traffic } = buildWorld(testDef({ traffic: { countScale: 1.6, oncoming: 0.5 } }));
  assert.strictEqual(count(traffic, c => vehicle(c) && c.dir === 1), 48);
  assert.strictEqual(count(traffic, c => vehicle(c) && c.dir === -1), 24);
});
test('vehicle types come in exactly the mix\'s proportions', () => {
  const { traffic } = buildWorld(testDef({ traffic: { count: 24, mix: { car: 3, bus: 1 } } }));
  const sameWay = traffic.filter(c => vehicle(c) && c.dir === 1);
  assert.strictEqual(count(sameWay, c => c.type === 'car'), 18);
  assert.strictEqual(count(sameWay, c => c.type === 'bus'), 6);
});
test('vehicles sit in a lane on their own side, clear of the starting grid', () => {
  const { road, traffic } = buildWorld(testDef());
  for (const c of traffic.filter(vehicle)) {
    assert.ok(c.dir === 1 ? c.x < 0 : c.x > 0);
    assert.ok(c.lane >= 0 && c.lane < 3);
    assert.ok(c.z >= road.startZ + 7000 && c.z <= road.trackLength - 6000 + road.startZ);
    assert.ok(c.speed > 0);
  }
});
test('buses wear one of the city\'s liveries', () => {
  const { traffic } = buildWorld(testDef());
  const buses = traffic.filter(c => c.type === 'bus');
  assert.ok(buses.length > 0 && buses.every(b => b.look.op === 'B.E.S.T.' && ['1', '83'].includes(b.look.route)));
});
test('the same definition and tour always spawn the same traffic', () => {
  const spots = w => w.traffic.map(c => `${c.type}@${c.z}`).join();
  assert.strictEqual(spots(buildWorld(testDef())), spots(buildWorld(testDef())));
  assert.notStrictEqual(spots(buildWorld(testDef())), spots(buildWorld(testDef(), { round: 1 })));
});
