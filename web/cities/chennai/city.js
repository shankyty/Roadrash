'use strict';
// Chennai: what every race in the city shares. Tamil street talk and a kuthu beat with a reed tune in Mohanam.
RRR.cities.register({
  id: 'chennai',
  // roadside hawkers call out to passing autos in the city's street lingo
  hawkerCalls: ['KAAPI, KAAPIII!', 'SUNDAL, SUNDAAAL!', 'IDLI VADAI!', 'MURUKKU, MURUKKU!', 'ELANEER, ELANEEER!'],
  // what a driver shouts after taking a lathi hit
  curses: ['DEI!', 'ENNA DA?!', 'PODA!', 'AIYYO!', 'ENNA MACHAAN?!', 'SUMMA IRU DA!', 'ITHU TOO MUCH DA!'],
  // background music, generated live. Pitches are semitones above Sa (D3); the melody loops every 32
  // steps, drum patterns every 16
  song: { bpm: 124, swing: 0, lead: 'nadaswaram',
    drums: { dha: 'x..x..x.x..x..x.', na: '.x.x.xx..x.x.xx.', shaker: 'xxxxxxxxxxxxxxxx' },
    melody: [[0, 7, 2], [2, 9, 2], [4, 12, 4], [8, 9, 2], [10, 7, 2], [12, 4, 4], [16, 2, 2], [18, 4, 2], [20, 7, 2], [22, 4, 2], [24, 2, 2], [26, 0, 6]] },
  // billboard ads (two lines each), alongside the hoardings every city has
  ads: [['FILTER', 'KAAPI'], ['IDLI · DOSA', 'VADA'], ['SUPERSTAR', 'FILM TODAY!']],
  // 1990s city buses: the transport undertaking's livery and well-known routes of the time
  // (destination boards read "route  destination")
  busLooks: [
    { op: 'PALLAVAN', body: '#e8b923', band: '#7b1e2b', stripe: '#7b1e2b', roof: '#f3e2b3', deck: 1, route: '21G', dest: 'BROADWAY - TAMBARAM', plate: 'TN 01 N 0921' },
    { op: 'PALLAVAN', body: '#e8b923', band: '#7b1e2b', stripe: '#7b1e2b', roof: '#f3e2b3', deck: 1, route: '29C', dest: 'PERAMBUR - BESANT NAGAR', plate: 'TN 01 N 2290' },
    { op: 'PALLAVAN', body: '#e8b923', band: '#7b1e2b', stripe: '#7b1e2b', roof: '#f3e2b3', deck: 1, route: '23C', dest: 'BESANT NAGAR', plate: 'TN 01 N 1723' },
    { op: 'PALLAVAN', body: '#e8b923', band: '#7b1e2b', stripe: '#7b1e2b', roof: '#f3e2b3', deck: 1, route: '12B', dest: 'MYLAPORE', plate: 'TN 01 N 1202' },
  ],
});
