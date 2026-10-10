'use strict';
// Shared geometry and materials.
// ---------------------------------------------------------------- shared resources
const unitBox = new T.BoxGeometry(1, 1, 1);
const unitCyl = new T.CylinderGeometry(0.5, 0.5, 1, 20);
const unitCone = new T.ConeGeometry(0.5, 1, 12);
const unitSphere = new T.SphereGeometry(0.5, 20, 14);
// Levels of detail: every vehicle is built three times, detailed (0) for close up, medium (1) and low-poly
// (2) for far down the road; the farther it is, the fewer polygons. LO is the level being built, and
// every vehicle primitive below picks its geometry for it with q(detailed, medium, low).
// How far detail goes depends on the device's quality tier (set in init): 'smooth' keeps phones, tablets
// and weak laptops fluid; 'high' for desktop browsers; 'ultra' for the Mac app (finer curves, detail
// kept much farther down the road).
const TIERS = {
  // shadow: sun shadow map size and how far around you it reaches; post: filmic glow pass (else the
  // renderer's own tone mapping)
  smooth: { lod: [3500, 9000], det: 0.7, clearcoat: false, maxK: 3, shadow: null, post: false },
  high: { lod: [7000, 18000], det: 1, clearcoat: true, maxK: 5, shadow: { size: 2048, reach: 7000 }, post: false },
  ultra: { lod: [14000, 32000], det: 1.6, clearcoat: true, maxK: 7, shadow: { size: 4096, reach: 10000 }, post: true },
};
let TIER = TIERS.high, quality = 'high';
let LO = 0;
const q = (a, b, c) => LO === 0 ? a : LO === 1 ? b : c;
const segs = (a, b, c) => Math.max(3, Math.round(q(a, b, c) * (LO === 2 ? 1 : TIER.det)));   // segment counts, scaled by tier
let cyls, sphs;
function buildPrims() {
  LO = 0; cyls = []; sphs = [];
  for (LO = 0; LO < 3; LO++) { cyls.push(new T.CylinderGeometry(0.5, 0.5, 1, segs(32, 14, 8))); sphs.push(new T.SphereGeometry(0.5, segs(32, 14, 8), segs(20, 10, 6))); }
  LO = 0;
}
buildPrims();
const sphGeo = () => sphs[LO];
const unitPlane = new T.PlaneGeometry(1, 1);
const halfTube = new T.CylinderGeometry(0.5, 0.5, 1, 20, 1, true, Math.PI / 2, Math.PI); // top half of a tube (open ends)
const blob = new T.CircleGeometry(0.5, 20);
