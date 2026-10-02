'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const RRR = require('./load-game.js');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'web', 'drivers.js'), 'utf8');
const drivers = JSON.parse(src.slice(src.indexOf('['), src.lastIndexOf(']') + 1));

test('the cast passes its checker, and every curse has a voice clip', () => {
  // tools/drivers/check.mjs prints one line per problem and exits 1
  execFileSync('node', [path.join(root, 'tools', 'drivers', 'check.mjs'), '--clips'], { stdio: 'pipe' });
});

test('every city in the game has a driver of its own for you to race as', () => {
  for (const city of RRR.manifest.cities) assert.ok(drivers.some(d => d.city === city), `no driver from ${city}`);
});

test('there are enough other drivers to fill the biggest grid', () => {
  const biggest = Math.max(...RRR.order().map(id => RRR.resolve(id).rivals.count));
  for (const city of RRR.manifest.cities) assert.ok(drivers.filter(d => d.city !== city).length >= biggest, `too few rivals for a race in ${city}`);
});
