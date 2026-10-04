'use strict';
// Mumbai · Bandra-Worli Sea Link: night on the bridge, the sea either side
RRR.tracks.register({
  id: 'sea-link',
  name: 'MUMBAI · BANDRA-WORLI SEA LINK',
  city: 'mumbai',
  style: 'speed',
  seed: 27, length: 3000, laps: 1,
  rivals: { count: 7, skill: 0.9 },
  traffic: { count: 46, cows: 0, dogs: 0 },
  ambience: false,                        // no street recording out here
  look: {
    night: true,
    sky: ['#050816', '#141c3d', '#2c3a6b'], sun: '#f4f1de', fog: '#1d2748', sea: '#0e1a33',
    far: '#26325a', near: '#141b36', lights: 0.6, density: 0.06,
    light: { road: '#3c3d44', grass: '#10223f', rumble: '#e0e0e0', lane: '#d8d8d8', shoulder: '#6b6f78' },
    dark: { road: '#393a41', grass: '#0e1f3a', rumble: '#c62828', shoulder: '#666a73' },
    buildings: ['#455a64'],
    scenery: { billboard: 1 },
  },
});
