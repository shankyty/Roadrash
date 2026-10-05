'use strict';
const test = require('node:test'), assert = require('node:assert');
require('../web/engine/race-stats.js');
const { RaceStats } = globalThis.RRR;

const stats = () => new RaceStats({ driftCashPer100: 40, passCash: 25, jumpCash: 15, flyoverCash: 40 });

test('a new race has no score, no passes and no time', () => {
  assert.deepStrictEqual(stats().summary(), { time: null, rank: null, driftScore: 0, passes: 0 });
});
test('a full-speed, full-angle slide earns 100 points a second', () => {
  const s = stats();
  for (let i = 0; i < 60; i++) s.drift(1 / 60, 1, 1);
  assert.strictEqual(s.summary().driftScore, 100);
});
test('slower or shallower slides earn in proportion, and drift() returns what it added', () => {
  const s = stats();
  assert.strictEqual(s.drift(1, 0.5, 0.5), 25);
  assert.strictEqual(s.drift(2, 1, 0.25), 50);
  assert.strictEqual(s.summary().driftScore, 75);
});
test('close passes count and build a chain', () => {
  const s = stats();
  assert.deepStrictEqual([s.closePass(), s.closePass(), s.closePass()], [1, 2, 3]);
  assert.deepStrictEqual([s.passes, s.chain, s.bestChain], [3, 3, 3]);
});
test('the chain stops growing at CHAIN_MAX but passes keep counting', () => {
  const s = stats();
  for (let i = 0; i < 8; i++) s.closePass();
  assert.deepStrictEqual([s.passes, s.chain, s.bestChain], [8, RaceStats.CHAIN_MAX, RaceStats.CHAIN_MAX]);
});
test('the chain lapses when no pass comes in time; a pass in time keeps it', () => {
  const s = stats();
  s.closePass(); s.advance(RaceStats.CHAIN_SECS - 0.1); s.closePass();
  assert.strictEqual(s.chain, 2);
  s.advance(RaceStats.CHAIN_SECS + 0.1);
  assert.deepStrictEqual([s.chain, s.bestChain, s.passes], [0, 2, 2]);
  assert.strictEqual(s.closePass(), 1);
});
test('a crash breaks the chain', () => {
  const s = stats();
  s.closePass(); s.closePass(); s.breakChain();
  assert.deepStrictEqual([s.chain, s.bestChain], [0, 2]);
});
test('bonuses pay per 100 drift points and per pass, at the style\'s rates', () => {
  const s = stats();
  s.drift(2.5, 1, 1); for (let i = 0; i < 3; i++) s.closePass();
  assert.deepStrictEqual(s.bonuses(), { drift: 100, passes: 75, jumps: 0 });
});
test('finish records the time and place', () => {
  const s = stats();
  s.finish(92.4, 2);
  assert.deepStrictEqual(s.summary(), { time: 92.4, rank: 2, driftScore: 0, passes: 0 });
});
test('jumps count, and a flyover pays its own rate in place of the plain jump\'s', () => {
  const s = stats();
  s.jump(false); s.jump(false); s.jump(true);
  assert.deepStrictEqual([s.jumps, s.flyovers], [3, 1]);
  assert.strictEqual(s.bonuses().jumps, 2 * 15 + 40);
});
test('jumps are not part of what the records keep', () => {
  const s = stats();
  s.jump(true);
  assert.deepStrictEqual(s.summary(), { time: null, rank: null, driftScore: 0, passes: 0 });
});
