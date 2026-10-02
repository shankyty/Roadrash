'use strict';
// Chennai · Marina Beach Road: blazing midday on the Marina
RRR.tracks.register({
  id: 'marina-beach',
  name: 'CHENNAI · MARINA BEACH ROAD',
  city: 'chennai',
  style: 'speed',
  seed: 73, length: 3400, laps: 1,
  rivals: { count: 7, skill: 0.96 },
  traffic: { count: 44, cows: 16, dogs: 20 },
  look: {
    sky: ['#0f6fd6', '#5fb8f5', '#fff4d6'], sun: '#fffbe6', fog: '#cfe8f0', sea: '#1f7fb0',
    far: '#86a9bf', near: '#4f6f86', lights: 0, density: 0.42,
    light: { road: '#5a5a5e', grass: '#e6d3a3', rumble: '#ffffff', lane: '#f5f5f5', shoulder: '#d6c291' },
    dark: { road: '#555559', grass: '#dfcb99', rumble: '#1a1a1a', shoulder: '#cfba88' },
    buildings: ['#ffe066', '#f28482', '#84dcc6', '#ffffff', '#ffb4a2', '#cdb4db'],
    scenery: { palm: 5, building: 2, chai: 2, billboard: 1, temple: 1 },
  },
});
