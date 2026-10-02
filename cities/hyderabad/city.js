'use strict';
// Hyderabad: what every race in the city shares. Dakhni street talk and a qawwali: tabla, claps, harmonium in Kafi.
RRR.cities.register({
  id: 'hyderabad',
  // roadside hawkers call out to passing autos in the city's street lingo
  hawkerCalls: ['IRANI CHAAAI!', 'HALEEM GARAM HAI!', 'BIRYANI LELO!', 'OSMANIA BISCUIT LELO!', 'MIRCHI BAJJI, GARAM!'],
  // what a driver shouts after taking a lathi hit
  curses: ['KYA RE MIYAN!', 'NAKKO RE!', 'HAU, AB DEKH!', 'EK DENGA NA!', 'KAIKU MAARA?!', 'CHUP BAITH!', 'BAIGAN!'],
  // background music, generated live. Pitches are semitones above Sa (D3); the melody loops every 32
  // steps, drum patterns every 16
  song: { bpm: 92, swing: 0.08, lead: 'harmonium',
    drums: { ghe: 'x.....x.x.......', na: '..x.x..x..x.x..x', clap: '....x.......x.x.' },
    melody: [[0, 7, 2], [2, 9, 2], [4, 10, 2], [6, 12, 6], [12, 10, 2], [14, 9, 2], [16, 7, 4], [20, 5, 2], [22, 7, 2], [24, 3, 2], [26, 2, 2], [28, 0, 4]] },
  // billboard ads (two lines each), alongside the hoardings every city has
  ads: [['HYDERABADI', 'BIRYANI'], ['IRANI CHAI', '& OSMANIA'], ['PEARL CITY', 'JEWELLERS']],
  // 1990s city buses: the transport undertaking's livery and well-known routes of the time
  // (destination boards read "route  destination")
  busLooks: [
    { op: 'A.P.S.R.T.C.', body: '#b71c1c', band: '#f3e2b3', stripe: '#f9a825', roof: '#f3e2b3', deck: 1, route: '8A', dest: 'SECUNDERABAD - CHARMINAR', plate: 'AP 09 Z 1182' },
    { op: 'A.P.S.R.T.C.', body: '#b71c1c', band: '#f3e2b3', stripe: '#f9a825', roof: '#f3e2b3', deck: 1, route: '5K', dest: 'SECUNDERABAD - MEHDIPATNAM', plate: 'AP 09 Z 2045' },
    { op: 'A.P.S.R.T.C.', body: '#b71c1c', band: '#f3e2b3', stripe: '#f9a825', roof: '#f3e2b3', deck: 1, route: '49M', dest: 'KOTI', plate: 'AP 09 Z 3310' },
  ],
});
