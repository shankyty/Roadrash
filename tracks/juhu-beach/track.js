'use strict';
// Mumbai · Juhu Beach Road: bright morning by the beach
RRR.tracks.register({
  id: 'juhu-beach',
  name: 'MUMBAI · JUHU BEACH ROAD',
  city: 'mumbai',
  style: 'drift',
  seed: 91, length: 3600, laps: 1,
  rivals: { count: 7, skill: 0.97 },
  traffic: { count: 44, cows: 18, dogs: 18 },
  look: {
    sky: ['#1e78e0', '#87cefa', '#e0f7ff'], sun: '#ffffff', fog: '#bfe3f0', sea: '#3f8fc4',
    far: '#8fb0c8', near: '#5d7d96', lights: 0, density: 0.4,
    light: { road: '#5a5a5e', grass: '#e2cf9e', rumble: '#ffffff', lane: '#f5f5f5', shoulder: '#cdb98c' },
    dark: { road: '#555559', grass: '#dcc896', rumble: '#e53935', shoulder: '#c6b284' },
    buildings: ['#ffe066', '#70c1b3', '#f25f5c', '#ffffff', '#b8f2e6', '#ffa69e'],
    scenery: { palm: 6, tree: 1, chai: 2, billboard: 1, building: 1 },
  },
});
