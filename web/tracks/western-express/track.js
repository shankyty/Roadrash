'use strict';
// Mumbai · Western Express Highway: hazy afternoon traffic
RRR.tracks.register({
  id: 'western-express',
  name: 'MUMBAI · WESTERN EXPRESS HIGHWAY',
  city: 'mumbai',
  style: 'traffic',
  seed: 53, length: 3200, laps: 1,
  rivals: { count: 7, skill: 0.94 },
  traffic: { count: 52, cows: 14, dogs: 12 },
  look: {
    sky: ['#8e9aa3', '#d9c9a3', '#f3e0b0'], sun: '#fff6d0', fog: '#cfc3a3', sea: '#9aa7a8',
    far: '#b3ab96', near: '#8a8070', lights: 0, density: 0.45,
    light: { road: '#5e5e5e', grass: '#7d7a45', rumble: '#f5c400', lane: '#f2f2f2', shoulder: '#a39a7c' },
    dark: { road: '#595959', grass: '#76733f', rumble: '#141414', shoulder: '#9c9376' },
    buildings: ['#e9c46a', '#f4a261', '#e76f51', '#dcd3c0', '#a8dadc', '#f1faee'],
    scenery: { tree: 3, building: 6, billboard: 3, temple: 1, chai: 1 },
  },
});
