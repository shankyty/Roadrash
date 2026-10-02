'use strict';
const test = require('node:test'), assert = require('node:assert');
const path = require('path');

// a fresh RRR for every test, with the shipped packs replaced by small ones the test controls
function fresh() {
  delete globalThis.RRR;
  for (const f of ['util', 'registry']) {
    const file = path.join(__dirname, '..', 'web', 'engine', `${f}.js`);
    delete require.cache[require.resolve(file)]; require(file);
  }
  const RRR = globalThis.RRR;
  RRR.PIECES = { straight() {} }; RRR.VEHICLES = { car() {} }; // stand-ins for engine/track-builder.js and traffic-spawner.js
  RRR.styles.register(style());
  RRR.cities.register(city());
  RRR.skylines.register({ id: 'pune', far() {}, near() {} });
  RRR.tracks.register(track());
  RRR.load({ styles: ['plain'], cities: ['pune'], tracks: ['fc-road'] });
  return RRR;
}
const style = () => ({ id: 'plain', label: 'PLAIN',
  road: { lengths: [25], pieces: [{ kind: 'straight', weight: 1 }], lanes: 'alternate', junctions: true },
  traffic: { countScale: 1, oncoming: 0.8, mix: { car: 1 } },
  handling: { topSpeed: 1, driftScrub: 0.22, driftExitBoost: 0, slipstream: 0 },
  scoring: { driftCashPer100: 0, passCash: 0 } });
const city = () => ({ id: 'pune', hawkerCalls: ['MISAL!'], curses: ['ARE!'], song: { bpm: 100 }, ads: [['A', 'B']], busLooks: [{ op: 'PMT' }] });
const track = () => ({ id: 'fc-road', name: 'PUNE · FC ROAD', city: 'pune', style: 'plain', seed: 5, length: 400, laps: 1,
  rivals: { count: 3, skill: 0.9 }, traffic: { count: 10, cows: 1, dogs: 2 },
  look: { sky: ['#000', '#111', '#222'], sun: '#fff', fog: '#ccc', sea: '#00f', far: '#777', near: '#333', lights: 0, density: 0.4,
    light: { road: '#555', grass: '#060', rumble: '#fff', lane: '#eee', shoulder: '#888' },
    dark: { road: '#444', grass: '#050', rumble: '#c00', shoulder: '#777' },
    buildings: ['#abc'], scenery: { tree: 1 } } });
// registers a changed copy of the track under a new id and puts it in the manifest
function withTrack(RRR, change) {
  const t = track(); t.id = 'changed'; change(t);
  RRR.tracks.register(t); RRR.manifest.tracks.push('changed');
  return RRR.validate();
}

test('registering the same id twice throws', () => {
  const RRR = fresh();
  assert.throws(() => RRR.tracks.register(track()), /track "fc-road" is registered twice/);
});
test('a pack without an id throws', () => {
  assert.throws(() => fresh().styles.register({ label: 'X' }), /style pack has no id/);
});
test('sound packs validate with no problems', () => {
  assert.deepStrictEqual(fresh().validate(), []);
});
test('order() is the manifest order and a copy', () => {
  const RRR = fresh(), order = RRR.order();
  order.push('x');
  assert.deepStrictEqual(RRR.order(), ['fc-road']);
});
test('packFiles lists styles, then each city and its skyline, then tracks', () => {
  assert.deepStrictEqual(fresh().packFiles({ styles: ['a'], cities: ['c'], tracks: ['t'] }),
    ['styles/a.js', 'cities/c/city.js', 'cities/c/skyline.js', 'tracks/t/track.js']);
});

test('resolve attaches the city pack, its skyline and the style label', () => {
  const RRR = fresh(), def = RRR.resolve('fc-road');
  assert.strictEqual(def.city, RRR.cities.get('pune'));
  assert.strictEqual(def.skyline, RRR.skylines.get('pune'));
  assert.strictEqual(def.styleLabel, 'PLAIN');
  assert.strictEqual(def.style, 'plain');
  assert.strictEqual(def.ambience, true);
});
test('resolve merges style values with the track\'s overrides, per key', () => {
  const RRR = fresh();
  const t = track(); t.id = 'fast'; t.traffic.oncoming = 0.2; t.handling = { topSpeed: 1.25 }; t.road = { junctions: false }; t.ambience = false;
  RRR.tracks.register(t);
  const def = RRR.resolve('fast');
  assert.deepStrictEqual(def.traffic, { countScale: 1, oncoming: 0.2, mix: { car: 1 }, count: 10, cows: 1, dogs: 2 });
  assert.deepStrictEqual(def.handling, { topSpeed: 1.25, driftScrub: 0.22, driftExitBoost: 0, slipstream: 0 });
  assert.strictEqual(def.road.junctions, false);
  assert.strictEqual(def.road.lanes, 'alternate');
  assert.strictEqual(def.ambience, false);
});
test('a resolved definition is frozen all the way down', () => {
  const def = fresh().resolve('fc-road');
  assert.ok(Object.isFrozen(def) && Object.isFrozen(def.look) && Object.isFrozen(def.look.light) && Object.isFrozen(def.road.pieces[0]) && Object.isFrozen(def.city.busLooks[0]));
});
test('resolve of an unknown track throws', () => {
  assert.throws(() => fresh().resolve('nope'), /unknown track "nope"/);
});

test('validate reports a track the manifest names but nothing registered', () => {
  const RRR = fresh(); RRR.manifest.tracks.push('ghost');
  assert.deepStrictEqual(RRR.validate(), ['track "ghost": not registered (tracks/ghost/track.js is missing or failed to load)']);
});
test('validate reports an unknown city', () => {
  assert.deepStrictEqual(withTrack(fresh(), t => { t.city = 'goa'; }), ['track "changed".city: unknown city "goa"']);
});
test('validate reports an unknown style', () => {
  assert.deepStrictEqual(withTrack(fresh(), t => { t.style = 'rally'; }), ['track "changed".style: unknown style "rally"']);
});
test('validate reports a missing field', () => {
  assert.deepStrictEqual(withTrack(fresh(), t => { delete t.rivals.skill; }), ['track "changed".rivals.skill: missing']);
});
test('validate reports a wrong type', () => {
  assert.deepStrictEqual(withTrack(fresh(), t => { t.seed = '5'; }), ['track "changed".seed: expected number, got string']);
});
test('validate reports an unknown key, at the top level and nested', () => {
  assert.deepStrictEqual(withTrack(fresh(), t => { t.lapz = 2; t.look.fogg = '#fff'; }),
    ['track "changed".look.fogg: unknown key', 'track "changed".lapz: unknown key']);
});
test('validate reports an unknown road piece, lane pattern and vehicle', () => {
  assert.deepStrictEqual(withTrack(fresh(), t => { t.road = { pieces: [{ kind: 'loop', weight: 1 }], lanes: 'narrow' }; t.traffic.mix = { rickshaw: 1 }; }), [
    'track "changed".road.lanes: must be \'alternate\' or \'wide\'',
    'track "changed".road.pieces[0].kind: unknown piece "loop"',
    'track "changed".traffic.mix.rickshaw: unknown vehicle',
  ]);
});
test('validate reports a city without a skyline', () => {
  const RRR = fresh();
  RRR.cities.register({ ...city(), id: 'goa' }); RRR.manifest.cities.push('goa');
  assert.deepStrictEqual(RRR.validate(), ['skyline "goa": not registered (cities/goa/skyline.js is missing or failed to load)']);
});
test('validate without a manifest says packs.js did not load', () => {
  const RRR = fresh(); RRR.manifest = null;
  assert.deepStrictEqual(RRR.validate(), ['packs.js did not load: there is no manifest']);
});
