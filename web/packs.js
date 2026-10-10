'use strict';
// The manifest: every style, city and track the game ships, with tracks in race order.
// To add a track: make web/tracks/<id>/track.js and add its id here.
RRR.load({
  styles: ['classic', 'speed', 'drift', 'traffic'],
  cities: ['mumbai', 'hyderabad', 'delhi', 'chennai'],
  tracks: ['marine-drive', 'charminar-road', 'sea-link', 'ring-road', 'india-gate', 'western-express', 'marina-beach', 'juhu-beach'],
});
