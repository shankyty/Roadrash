'use strict';
// Delhi: what every race in the city shares. Dilli street talk and bhangra: dhol chaal and a tumbi riff.
RRR.cities.register({
  id: 'delhi',
  // roadside hawkers call out to passing autos in the city's street lingo
  hawkerCalls: ['CHOLE BHATURE LELO!', 'GOLGAPPE, GOLGAPPE!', 'GARMA GARAM JALEBI!', 'MOMOS LELO, MOMOS!', 'CHAI BOLO, CHAAAI!'],
  // what a driver shouts after taking a lathi hit
  curses: ['OYE! JAANTA HAI MERA BAAP KAUN HAI?', 'ABEY OYE!', 'KYA KAR RAHA HAI YAAR!', 'TERI TOH...!', 'BADTAMEEZ!', 'OYE HOYE!', 'BHAI SAHAB, DHANG SE!'],
  // background music, generated live. Pitches are semitones above Sa (D3); the melody loops every 32
  // steps, drum patterns every 16
  song: { bpm: 100, swing: 0.14, lead: 'tumbi',
    drums: { dha: 'x.....x...x.....', na: '..x.x..xx.x.x.xx', clap: '....x.......x...' },
    melody: [[0, 12, 1], [2, 12, 1], [3, 14, 1], [4, 12, 1], [6, 10, 1], [8, 12, 1], [10, 7, 1], [11, 9, 1], [12, 10, 1], [14, 12, 1], [16, 12, 1], [18, 12, 1], [19, 14, 1], [20, 16, 1], [22, 14, 1], [24, 12, 1], [26, 10, 1], [28, 9, 1], [30, 7, 1], [31, 9, 1]] },
  // billboard ads (two lines each), alongside the hoardings every city has
  ads: [['CHOLE', 'BHATURE'], ['DILLI', 'DARSHAN'], ['PARANTHE', 'WALI GALI']],
  // 1990s city buses: the transport undertaking's livery and well-known routes of the time
  // (destination boards read "route  destination")
  busLooks: [
    { op: 'D.T.C.', body: '#2e7d32', band: '#f3e2b3', stripe: '#f9a825', roof: '#f3e2b3', deck: 1, route: 'MUDRIKA', dest: 'RING ROAD', plate: 'DL 1P 2231' },
    { op: 'D.T.C.', body: '#2e7d32', band: '#f3e2b3', stripe: '#f9a825', roof: '#f3e2b3', deck: 1, route: 'BAHRI', dest: 'MUDRIKA', plate: 'DL 1P 4120' },
    { op: 'BLUELINE', body: '#1565c0', band: '#f5f5f5', stripe: '#f5f5f5', roof: '#f5f5f5', deck: 1, route: '429', dest: 'ISBT - NEHRU PLACE', plate: 'DL 1P 7788' },
    { op: 'D.T.C.', body: '#2e7d32', band: '#f3e2b3', stripe: '#f9a825', roof: '#f3e2b3', deck: 1, route: '620', dest: 'SHIVAJI STADIUM', plate: 'DL 1P 3065' },
  ],
});
