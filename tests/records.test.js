'use strict';
const test = require('node:test'), assert = require('node:assert');
require('../web/engine/records.js');
const { Records, selectedTrackIndex } = globalThis.RRR;

// the game's store, backed by a plain object
const memoryStore = (data = {}) => ({ data, get: (k, d) => (k in data ? data[k] : d), set(k, v) { data[k] = v; } });
const ORDER = ['marine-drive', 'charminar-road', 'sea-link'];

test('a track with no races has empty records', () => {
  assert.deepStrictEqual(new Records(memoryStore()).get('sea-link'), { bestTime: null, bestDrift: 0, bestPasses: 0, wins: 0 });
});
test('the first finish sets every best and says which were beaten', () => {
  const rec = new Records(memoryStore());
  assert.deepStrictEqual(rec.submit('sea-link', { time: 95.5, rank: 2, driftScore: 120, passes: 7 }), { time: true, drift: true, passes: true });
  assert.deepStrictEqual(rec.get('sea-link'), { bestTime: 95.5, bestDrift: 120, bestPasses: 7, wins: 0 });
});
test('only better results replace a best; a slower time does not', () => {
  const rec = new Records(memoryStore());
  rec.submit('sea-link', { time: 95.5, rank: 2, driftScore: 120, passes: 7 });
  assert.deepStrictEqual(rec.submit('sea-link', { time: 99, rank: 3, driftScore: 300, passes: 7 }), { time: false, drift: true, passes: false });
  assert.deepStrictEqual(rec.get('sea-link'), { bestTime: 95.5, bestDrift: 300, bestPasses: 7, wins: 0 });
});
test('finishing first counts a win', () => {
  const rec = new Records(memoryStore());
  rec.submit('sea-link', { time: 90, rank: 1, driftScore: 0, passes: 0 });
  rec.submit('sea-link', { time: 91, rank: 1, driftScore: 0, passes: 0 });
  assert.strictEqual(rec.get('sea-link').wins, 2);
});
test('a race you did not finish sets no best time', () => {
  const rec = new Records(memoryStore());
  assert.deepStrictEqual(rec.submit('sea-link', { time: null, rank: 6, driftScore: 40, passes: 2 }), { time: false, drift: true, passes: true });
  assert.strictEqual(rec.get('sea-link').bestTime, null);
});
test('tracks keep separate records', () => {
  const rec = new Records(memoryStore());
  rec.submit('sea-link', { time: 90, rank: 1, driftScore: 10, passes: 1 });
  assert.deepStrictEqual(rec.get('marine-drive'), { bestTime: null, bestDrift: 0, bestPasses: 0, wins: 0 });
});
test('corrupt saved records are treated as empty', () => {
  for (const bad of ['oops', 7, null, [1, 2], { 'sea-link': 'oops' }])
    assert.deepStrictEqual(new Records(memoryStore({ records: bad })).get('sea-link'), { bestTime: null, bestDrift: 0, bestPasses: 0, wins: 0 });
});

test('the selected race is read from the saved track id', () => {
  assert.strictEqual(selectedTrackIndex(memoryStore({ track: 'sea-link', level: 1 }), ORDER), 2);
});
test('an old save with a list index is used when no id is saved', () => {
  assert.strictEqual(selectedTrackIndex(memoryStore({ level: 1 }), ORDER), 1);
});
test('a fresh save, an unknown id or a bad index all select the first race', () => {
  assert.strictEqual(selectedTrackIndex(memoryStore(), ORDER), 0);
  assert.strictEqual(selectedTrackIndex(memoryStore({ track: 'gone' }), ORDER), 0);
  assert.strictEqual(selectedTrackIndex(memoryStore({ level: 9 }), ORDER), 0);
  assert.strictEqual(selectedTrackIndex(memoryStore({ level: 'x' }), ORDER), 0);
});
