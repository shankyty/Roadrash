'use strict';
// Loads the engine and every pack named in web/packs.js into this Node process, the way index.html does
// in a browser. Returns the shared RRR namespace.
const path = require('path');
const web = f => path.join(__dirname, '..', 'web', f);
for (const f of ['engine/util.js', 'engine/registry.js', 'engine/track-builder.js', 'engine/traffic-spawner.js', 'engine/records.js', 'engine/race-stats.js', 'packs.js']) require(web(f));
for (const f of globalThis.RRR.packFiles(globalThis.RRR.manifest)) require(web(f));
module.exports = globalThis.RRR;
