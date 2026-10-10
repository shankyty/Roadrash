'use strict';
// Delhi · India Gate: a foggy winter morning down the lawns to the Gate, and a hailstorm over a stretch of it
RRR.tracks.register({
  id: 'india-gate',
  name: 'DELHI · INDIA GATE',
  city: 'delhi',
  style: 'speed',
  seed: 73, length: 3200, laps: 1,
  rivals: { count: 7, skill: 0.93 },
  traffic: { count: 42, cows: 10, dogs: 14 },
  look: {
    haze: 0.75,                           // thick winter fog
    hail: { from: 0.42, to: 0.58 },       // hail over this stretch of the lap (shares of it)
    sky: ['#9aa3ab', '#c8cdd0', '#e3e4e0'], sun: '#f6f2e6', fog: '#d4d7d6', sea: '#7d8f6a',
    far: '#b9bdbd', near: '#9a9e9f', lights: 0, density: 0.35,
    light: { road: '#5c5d61', grass: '#7f9469', rumble: '#ffffff', lane: '#f0f0f0', shoulder: '#c4b49a' },
    dark: { road: '#58595d', grass: '#798e63', rumble: '#b23a2e', shoulder: '#bcac92' },
    buildings: ['#d9b38c', '#c4785a', '#e8dcc6', '#b56b52', '#efe6d4'],
    scenery: { tree: 5, building: 2, billboard: 1, temple: 1, chai: 2 },
  },
});
