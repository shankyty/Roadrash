'use strict';
// The shipped packs: they validate, and they carry exactly the data the game had before track packs
// (tests/golden/legacy-data.json, captured by tests/golden/capture.js).
const test = require('node:test'), assert = require('node:assert');
const RRR = require('./load-game.js');
const legacy = require('./golden/legacy-data.json');

test('every shipped pack validates', () => {
  assert.deepStrictEqual(RRR.validate(), []);
});
test('race order is unchanged', () => {
  assert.deepStrictEqual(RRR.order(), legacy.TRACKS.map(t => legacy.IDS[t.theme]));
});
for (const old of legacy.TRACKS) {
  const id = legacy.IDS[old.theme];
  test(`${id} carries its old numbers and look`, () => {
    const t = RRR.tracks.get(id), { city, ads, ambience, ...look } = legacy.THEMES[old.theme];
    assert.strictEqual(t.name, old.name);
    assert.strictEqual(t.city, city);
    assert.deepStrictEqual([t.seed, t.length, t.laps, t.rivals.count, t.rivals.skill, t.traffic.count, t.traffic.cows, t.traffic.dogs],
      [old.seed, old.length, old.laps, old.rivals, old.skill, old.traffic, old.cows, old.dogs]);
    assert.deepStrictEqual(t.look, look);
    assert.strictEqual(t.ambience, ambience);
    assert.deepStrictEqual(RRR.cities.get(city).ads, ads);
  });
}
for (const id of Object.keys(legacy.SONGS)) {
  test(`${id} carries its old calls, curses, song and bus liveries`, () => {
    const c = RRR.cities.get(id);
    assert.deepStrictEqual(c.hawkerCalls, legacy.HAWKER_CALLS[id]);
    assert.deepStrictEqual(c.curses, legacy.CURSES[id]);
    assert.deepStrictEqual(c.song, legacy.SONGS[id]);
    assert.deepStrictEqual(c.busLooks, legacy.BUS_LOOKS[id]);
  });
}
