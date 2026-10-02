'use strict';
// Delhi · Ring Road: hazy winter morning
RRR.tracks.register({
  id: 'ring-road',
  name: 'DELHI · RING ROAD',
  city: 'delhi',
  style: 'traffic',
  seed: 61, length: 3100, laps: 1,
  rivals: { count: 7, skill: 0.92 },
  traffic: { count: 50, cows: 16, dogs: 18 },
  look: {
    sky: ['#6f8fb0', '#c9d6e0', '#f0ede4'], sun: '#fffdf2', fog: '#d8dcdc', sea: '#6f8a4a',
    far: '#a3acb4', near: '#6a6f78', lights: 0, density: 0.45,
    light: { road: '#5e5e62', grass: '#6f8a4a', rumble: '#ffffff', lane: '#f2f2f2', shoulder: '#b0a890' },
    dark: { road: '#59595d', grass: '#688345', rumble: '#c62828', shoulder: '#a8a088' },
    buildings: ['#e9c46a', '#f4a261', '#dcd3c0', '#c97b63', '#a8dadc', '#f1faee'],
    scenery: { tree: 4, building: 4, billboard: 2, temple: 1, chai: 1 },
  },
});
