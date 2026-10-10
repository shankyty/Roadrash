'use strict';
// Creates the renderer and scene (init) and loads a track (setTrack).
// ---------------------------------------------------------------- setup
function init(glCanvas, opts) {
  W_3D = opts.W; H_3D = opts.H; ROAD_W_3D = opts.ROAD_W; SEG_LEN_3D = opts.SEG_LEN;
  quality = TIERS[opts.quality] ? opts.quality : 'high'; TIER = TIERS[quality]; buildPrims();
  if (!TIER.clearcoat) glass.clearcoat = 0;
  try {
    renderer = new T.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  } catch (e) { return false; }
  if (!renderer || !renderer.getContext()) return false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio || 1.75));
  renderer.setSize(W_3D, H_3D, false);
  renderer.setClearColor(0x000000, 0);
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(cam.fov, W_3D / H_3D, 30, 90000);
  camera.rotation.order = 'YXZ';
  hemi = new T.HemisphereLight(0xffffff, 0x555555, 0.95); scene.add(hemi);
  sun = new T.DirectionalLight(0xffffff, 0.55); sun.position.set(0.6, 1, 0.4); scene.add(sun);
  const geo = new T.BufferGeometry();
  roadPos = new Float32Array(DRAW * QUADS * 6 * 3);
  roadCol = new Float32Array(DRAW * QUADS * 6 * 3);
  roadUV = new Float32Array(DRAW * QUADS * 6 * 2); roadDet = new Float32Array(DRAW * QUADS * 6);
  geo.setAttribute('position', new T.BufferAttribute(roadPos, 3).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('color', new T.BufferAttribute(roadCol, 3).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('uv', new T.BufferAttribute(roadUV, 2).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('detail', new T.BufferAttribute(roadDet, 1).setUsage(T.DynamicDrawUsage));
  road = new T.Mesh(geo, roadMaterial());
  road.frustumCulled = false; scene.add(road);
  // Sun shadows. The road stays unlit (its colours are painted), so shadows land on it through a second,
  // see-through copy of the road surface that only darkens where the sun is blocked.
  if (TIER.shadow) {
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    sun.castShadow = true; sun.shadow.mapSize.set(TIER.shadow.size, TIER.shadow.size);
    const sc = sun.shadow.camera, e = TIER.shadow.reach; sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.near = 100; sc.far = 30000; sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 6; scene.add(sun.target);
    roadShade = new T.Mesh(geo, new T.ShadowMaterial({ opacity: 0.42, depthWrite: false }));
    roadShade.receiveShadow = true; roadShade.frustumCulled = false; roadShade.position.y = 3; roadShade.renderOrder = 1; scene.add(roadShade);
  }
  renderer.toneMapping = T.NoToneMapping;
  if (TIER.post) post = makePost();
  ready = true;
  return true;
}

// horizon height on screen (the 2D sky layer lines its skyline up with it)
const horizonY = () => H_3D / 2 + Math.tan(PITCH_RAD()) / Math.tan(cam.fov * Math.PI / 360) * H_3D / 2;
function setCamera(mode) {
  camMode = CAMS[mode] ? mode : 'heli'; cam = CAMS[camMode];
  if (camera) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  return camMode;
}

const vehicles = new Map(); // game object -> model
const sceneryMeshes = new Map(); // sprite -> model
let colors = null;
function setTrack(opts) {
  segments3D = opts.segments; trackLength3D = opts.trackLength; theme3D = opts.theme; SP3D = opts.SP; TS = opts.themeSprites; cfg = opts;
  TILE = (opts.LANE_W || 0.6) * ROAD_W_3D;
  for (const m of sceneryMeshes.values()) scene.remove(m);
  for (const m of vehicles.values()) scene.remove(m);
  for (const spare of pool.values()) for (const m of spare) scene.remove(m);
  pool.clear(); queueWarm();
  sceneryMeshes.clear(); vehicles.clear(); buildingMats.clear();
  const c = h => new T.Color(h);
  colors = {
    light: { road: c(theme3D.light.road), grass: c(theme3D.light.grass), rumble: c(theme3D.light.rumble), lane: c(theme3D.light.lane), shoulder: c(theme3D.light.shoulder) },
    dark: { road: c(theme3D.dark.road), grass: c(theme3D.dark.grass), rumble: c(theme3D.dark.rumble), shoulder: c(theme3D.dark.shoulder) },
    white: c('#f5f5f5'), yellow: c('#f2c200'), kerb: c('#6f6a63'),
  };
  scene.fog = new T.Fog(theme3D.fog, 20000, DRAW * SEG_LEN_3D * 0.97);
  const night = !!theme3D.night;
  hemi.color.set(night ? '#5a6aa0' : theme3D.sky[2]); hemi.groundColor.set(night ? '#101020' : theme3D.light.grass);
  hemi.intensity = night ? 0.3 : 0.95; sun.intensity = night ? 0.05 : 0.55;
  nightU.uNight.value = night ? 1 : 0; headGlow.emissiveIntensity = night ? 1.6 : 0.25; tailGlow.emissiveIntensity = night ? 1.4 : 0.6;
  lampGlow.emissiveIntensity = night ? 1.4 : 0.3;
  buildEnv(night);
}
