'use strict';
// Mumbai: what every race in the city shares. Bambaiya street talk and a filmi dholak groove.
RRR.cities.register({
  id: 'mumbai',
  // roadside hawkers call out to passing autos in the city's street lingo
  hawkerCalls: ['VADA PAAAV!', 'BHEL PURI LELO!', 'CHAI BOLE, CHAAAI!', 'PAV BHAJI GARAM!', 'NIMBU PAANI THANDA!'],
  // what a driver shouts after taking a lathi hit
  curses: ['ABE O HERO!', 'KYA RE, DIMAAG KHARAB?', 'AYE BHIDU, SAMBHAL KE!', 'APUN KO MAARA?!', 'CHAL NIKAL!', 'WAAT LAGA DUNGA!', 'GHANTA!'],
  // background music, generated live. Pitches are semitones above Sa (D3); the melody loops every 32
  // steps, drum patterns every 16
  song: { bpm: 104, swing: 0, lead: 'harmonium',
    drums: { dha: 'x.....x...x.....', na: '..x.x..x..x.x.x.', shaker: 'x.x.x.x.x.x.x.x.' },
    melody: [[0, 0, 2], [2, 2, 2], [4, 4, 2], [6, 7, 4], [10, 4, 2], [12, 2, 2], [14, 0, 2], [16, 4, 2], [18, 7, 2], [20, 9, 2], [22, 7, 4], [26, 4, 2], [28, 2, 2], [30, 0, 2]] },
  // billboard ads (two lines each), alongside the hoardings every city has
  ads: [['CUTTING CHAI', '₹10 ONLY'], ['VADA PAV', 'KING']],
  // 1990s city buses: the transport undertaking's livery and well-known routes of the time
  // (destination boards read "route  destination")
  busLooks: [
    { op: 'B.E.S.T.', body: '#c62828', band: '#f3e2b3', stripe: '#f3e2b3', roof: '#c62828', plate: 'MH 01 J 4517', deck: 2, route: '123', dest: 'TARDEO - COLABA' },
    { op: 'B.E.S.T.', body: '#c62828', band: '#f3e2b3', stripe: '#f3e2b3', roof: '#c62828', plate: 'MH 01 J 4517', deck: 2, route: '1', dest: 'COLABA - MAHIM' },
    { op: 'B.E.S.T.', body: '#c62828', band: '#f3e2b3', stripe: '#f3e2b3', roof: '#f3e2b3', plate: 'MH 01 J 4517', deck: 1, route: '83', dest: 'COLABA - KURLA' },
    { op: 'B.E.S.T.', body: '#c62828', band: '#f3e2b3', stripe: '#f3e2b3', roof: '#f3e2b3', plate: 'MH 01 J 4517', deck: 1, route: '138', dest: 'V.T. - BACKBAY' },
  ],
});
