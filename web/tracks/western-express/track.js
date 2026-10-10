'use strict';
// Mumbai · Western Express Highway: monsoon traffic in a thunderstorm
RRR.tracks.register({
  id: 'western-express',
  name: 'MUMBAI · WESTERN EXPRESS HIGHWAY',
  city: 'mumbai',
  style: 'traffic',
  seed: 53, length: 3200, laps: 1,
  rivals: { count: 7, skill: 0.94 },
  traffic: { count: 52, cows: 14, dogs: 12 },
  look: {
    rain: true,                           // rain, storm clouds, lightning and thunder; every pothole full of water
    sky: ['#23282f', '#3d444d', '#5f6670'], sun: '#b9c0c8', fog: '#59616a', sea: '#4d5a60',
    far: '#48505a', near: '#353b43', lights: 0.25, density: 0.45,
    light: { road: '#3e4144', grass: '#4d5a33', rumble: '#d4ad12', lane: '#d9dcdf', shoulder: '#6b6a5f' },
    dark: { road: '#3a3d40', grass: '#48552f', rumble: '#141414', shoulder: '#66655a' },
    buildings: ['#b89a52', '#c0834d', '#a95a45', '#a8a194', '#7fa3a5', '#bfc4bb'],
    scenery: { tree: 3, building: 6, billboard: 3, temple: 1, chai: 1 },
  },
});
