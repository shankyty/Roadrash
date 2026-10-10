'use strict';
// Stand-ins for the game's sprite canvases: plain string tokens, so tests need no DOM.
const many = (name, n) => Array.from({ length: n }, (_, i) => `${name}:${i}`);
function stubSprites({ dogs = 3, bikes = 9, tractors = 4, carLooks = 21 } = {}) {
  const SP = { signs: {} };
  for (const k of ['palm', 'palmF', 'temple', 'lampL', 'lampR', 'chai', 'milestone', 'arch', 'signal', 'cop', 'bus', 'truck', 'cart', 'pothole', 'potholeWet']) SP[k] = k;
  for (const k of ['signal', 'junction', 'narrow', 'nohorn', 'keepleft', 'limit40', 'limit50', 'limit60']) SP.signs[k] = `sign:${k}`;
  SP.trees = many('tree', 3); SP.dogs = many('dog', dogs); SP.bikes = many('bike', bikes); SP.tractors = many('tractor', tractors); SP.carLooks = many('car', carLooks);
  return SP;
}
const stubThemeSprites = (buildings, billboards) => ({ buildings: many('building', buildings), billboards: many('billboard', billboards) });
module.exports = { stubSprites, stubThemeSprites };
