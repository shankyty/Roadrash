'use strict';
// Hyderabad · Charminar Road: golden hour over the old city and Hussain Sagar
RRR.tracks.register({
  id: 'charminar-road',
  name: 'HYDERABAD · CHARMINAR ROAD',
  city: 'hyderabad',
  style: 'classic',
  seed: 37, length: 2800, laps: 1,
  rivals: { count: 7, skill: 0.88 },
  traffic: { count: 40, cows: 12, dogs: 18 },
  look: {
    sky: ['#3d2a5c', '#e0785a', '#ffc46b'], sun: '#fff0c0', fog: '#d98a6a', sea: '#5a6f96',
    far: '#9a6474', near: '#4a2f45', lights: 0.25, density: 0.42,
    light: { road: '#5c5a5e', grass: '#8b7355', rumble: '#f5c400', lane: '#eeeeee', shoulder: '#a08a70' },
    dark: { road: '#57555a', grass: '#846c50', rumble: '#1a1a1a', shoulder: '#99836a' },
    buildings: ['#f2d7a7', '#e8b27a', '#d4a5a5', '#a3c4bc', '#f4e1c1', '#c9a0dc'],
    scenery: { building: 5, tree: 2, billboard: 2, chai: 2 },
  },
});
