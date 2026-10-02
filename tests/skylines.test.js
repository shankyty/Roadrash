'use strict';
// Every city's skyline painters run with nothing but the paint kit game.js passes in. The kit here is a
// stand-in that draws nothing; a painter reaching for anything outside the kit throws a ReferenceError.
const test = require('node:test'), assert = require('node:assert');
const RRR = require('./load-game.js');

// a 2D context where every method does nothing and every property can be set
const blankContext = () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => ({ addColorStop() {} })), set: (o, k, v) => { o[k] = v; return true; } });
const kit = () => {
  const noop = () => {};
  return { mk: (w, h) => ({ width: w, height: h, getContext: blankContext }), ell: noop, rr: noop, shade: c => c, lerp: (a, b, p) => a + (b - a) * p,
    mulberry32: RRR.util.mulberry32, LAYER_W: 1920, litWindows: noop, fillerBlocks: noop, trees: noop, waterBand: noop, cutOut: (g, fn) => fn(), archPath: noop, onion: noop };
};

for (const id of RRR.manifest.cities) for (const layer of ['far', 'near']) {
  test(`${id} ${layer} skyline paints a full-width layer from the kit alone`, () => {
    const look = RRR.resolve(RRR.order().find(t => RRR.tracks.get(t).city === id)).look;
    const canvas = RRR.skylines.get(id)[layer](kit(), look, 11);
    assert.strictEqual(canvas.width, 1920);
    assert.ok(canvas.height > 0);
  });
}
