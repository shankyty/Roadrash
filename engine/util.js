'use strict';
// Small helpers shared by the engine files and game.js. No DOM access, so it also runs under Node for tests.
(() => {
const RRR = (globalThis.RRR = globalThis.RRR || {});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, p) => a + (b - a) * p;
const easeIn = (a, b, p) => a + (b - a) * p * p;
const easeInOut = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
// seeded random numbers: the same seed always gives the same road
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function weightedPick(weights, r) {
  const entries = Object.entries(weights); let total = 0; for (const [, w] of entries) total += w;
  let x = r() * total; for (const [k, w] of entries) { if ((x -= w) < 0) return k; } return entries[0][0];
}
RRR.util = { clamp, lerp, easeIn, easeInOut, rand, pick, mulberry32, weightedPick };
})();
