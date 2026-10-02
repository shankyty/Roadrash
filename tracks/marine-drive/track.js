'use strict';
// Mumbai · Marine Drive: sunset over the Queen's Necklace
RRR.tracks.register({
  id: 'marine-drive',
  name: 'MUMBAI · MARINE DRIVE',
  city: 'mumbai',
  style: 'classic',
  seed: 11, length: 2600, laps: 1,
  rivals: { count: 5, skill: 0.86 },
  traffic: { count: 34, cows: 8, dogs: 14 },
  look: {
    sky: ['#2b1e5a', '#c2477a', '#ffae5a'], sun: '#ffe2a0', fog: '#c96a7a', sea: '#5a4f8a',
    far: '#7a4a7e', near: '#3b2350', lights: 0.35, density: 0.4,
    light: { road: '#5b5860', grass: '#6b6158', rumble: '#f2f2f2', lane: '#eeeeee', shoulder: '#8a8078' },
    dark: { road: '#56535b', grass: '#655b52', rumble: '#c62828', shoulder: '#837a72' },
    buildings: ['#f4d35e', '#ee964b', '#8ecae6', '#f28482', '#cdb4db', '#e9edc9'],
    scenery: { palm: 4, building: 5, billboard: 2, tree: 1, chai: 1 },
  },
});
