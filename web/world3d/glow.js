'use strict';
// The filmic glow pass (ultra quality) and the garage turntable.
// ---------------------------------------------------------------- glow pass (ultra)
// The scene renders off screen in HDR; bright parts (headlights, street lamps, signals, sun glints) are
// picked out, blurred at half and quarter size and added back as glow; then filmic (ACES) tone mapping
// and a soft vignette. Keeps the canvas transparent where nothing is drawn (the 2D sky shows through).
const SUN_DIR = new T.Vector3(0.6, 1, 0.4).normalize();
function makePost() {
  const size = renderer.getDrawingBufferSize(new T.Vector2()), w = size.x, h = size.y, HF = T.HalfFloatType;
  const rt = (a, b, ms) => new T.WebGLRenderTarget(a, b, { type: HF, samples: ms || 0 });
  const scene0 = rt(w, h, 4), half = [rt(w >> 1, h >> 1), rt(w >> 1, h >> 1)], quart = [rt(w >> 2, h >> 2), rt(w >> 2, h >> 2)];
  const quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadScene = new T.Scene(), quad = new T.Mesh(new T.PlaneGeometry(2, 2));
  quad.frustumCulled = false; quadScene.add(quad);
  const vert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const mat = (frag, uniforms) => new T.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, transparent: false });
  const bright = mat(`uniform sampler2D t; varying vec2 vUv;
      void main(){ vec4 c = texture2D(t, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); gl_FragColor = vec4(c.rgb * smoothstep(0.85, 1.6, l), 1.0); }`, { t: { value: null } });
  const blur = mat(`uniform sampler2D t; uniform vec2 d; varying vec2 vUv;
      void main(){ vec3 c = texture2D(t, vUv).rgb * 0.227;
        c += (texture2D(t, vUv + d * 1.385).rgb + texture2D(t, vUv - d * 1.385).rgb) * 0.316;
        c += (texture2D(t, vUv + d * 3.231).rgb + texture2D(t, vUv - d * 3.231).rgb) * 0.070;
        gl_FragColor = vec4(c, 1.0); }`, { t: { value: null }, d: { value: new T.Vector2() } });
  // tone: the painted colours pass through unchanged up to 0.8, brighter values (glows, glints) roll off
  // smoothly instead of clipping; then a touch of contrast and saturation
  const comp = mat(`uniform sampler2D s, b1, b2; uniform float glow; varying vec2 vUv;
      vec3 shoulder(vec3 c){ return mix(c, 0.8 + 0.2 * (1.0 - exp(-(c - 0.8) / 0.2)), step(0.8, c)); }
      void main(){ vec4 sc = texture2D(s, vUv); vec3 g = (texture2D(b1, vUv).rgb + texture2D(b2, vUv).rgb) * glow;
        vec3 c = shoulder(sc.rgb + g);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, 1.08); c = clamp((c - 0.5) * 1.05 + 0.5, 0.0, 1.0); float v = smoothstep(1.25, 0.35, length(vUv - 0.5) * 1.6); c *= mix(0.82, 1.0, v);
        float a = max(sc.a, clamp(dot(g, vec3(0.33)), 0.0, 1.0)); gl_FragColor = vec4(c * (sc.a > 0.0 ? 1.0 : a), a); }`,
    { s: { value: scene0.texture }, b1: { value: half[0].texture }, b2: { value: quart[0].texture }, glow: { value: 0.8 } });
  const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); };
  const blurInto = ([a, b2], src, pw, ph) => {
    bright.uniforms.t.value = src; pass(bright, a);
    blur.uniforms.t.value = a.texture; blur.uniforms.d.value.set(1 / pw, 0); pass(blur, b2);
    blur.uniforms.t.value = b2.texture; blur.uniforms.d.value.set(0, 1 / ph); pass(blur, a);
  };
  return {
    render() {
      renderer.setRenderTarget(scene0); renderer.clear(); renderer.render(scene, camera);
      blurInto(half, scene0.texture, w >> 1, h >> 1);
      blurInto(quart, half[0].texture, w >> 2, h >> 2);
      comp.uniforms.glow.value = nightU.uNight.value ? 1.1 : 0.6;
      pass(comp, null);
    },
  };
}

// drop models for objects that no longer exist (new race)
function forget(objs) { for (const o of objs) { const m = vehicles.get(o); if (m && !release(o)) { scene.remove(m); vehicles.delete(o); } } }

// debug: render one model from four angles into a canvas (used to check models without driving)
function turntable(kind, size = 360) {
  // drawn by the game's own renderer (so materials share its sky reflections) into a render target, then
  // copied onto a 2D canvas: four views, front three-quarters both sides, the back and the side
  const cv = document.createElement('canvas'); cv.width = size * 2; cv.height = size * 2; const ctx = cv.getContext('2d');
  const sc = new T.Scene(); sc.background = new T.Color('#8a8f99');
  sc.add(new T.HemisphereLight(0xffffff, 0x666666, 1)); const d = new T.DirectionalLight(0xffffff, 0.6); d.position.set(1, 2, 1); sc.add(d);
  const [k0, arg] = kind.split(':');
  const m = k0 === 'player' ? autoModel({ body: '#1e9e4a', trim: '#ffd21f', canopy: '#151515' }, SP3D.player)
    : k0 === 'rival' ? rivalPreview(arg)
    : k0 === 'bus' ? busModel({ ...((cfg.BUS_LOOKS || {})[(arg || '').split('/')[0] || cfg.city] || [BUS_DEFAULT])[+(arg || '').split('/')[1] || 0], ...((arg || '').split('/')[2] ? { crowd: true } : {}) }) : k0 === 'truck' ? truckModel(SP3D.truck) : k0 === 'car' ? carModel(arg || '#c62828')
    : k0 === 'bike' ? bikeModel(cfg.BIKE_LOOKS[+arg || 0])
    : k0 === 'building' ? buildingModel({ img: TS.buildings[+arg || 0], offset: -1, len: 1400 })
    : k0 === 'look' ? carModelFor(cfg.CAR_LOOKS[+arg || 0]) : k0 === 'tractor' ? tractorModel(cfg.TRACTOR_LOOKS[+arg || 0])
    : k0 === 'cow' ? cowModel(COW_COATS[+arg || 0]) : k0 === 'dog' ? dogModel({ body: '#b07a45', belly: '#e8c9a0', dark: '#6d4a2a' }) : null;
  const k = Math.max(m.userData.size.l, m.userData.size.h) / 1000; m.scale.setScalar(1 / Math.max(1, k * 0.9));
  sc.add(m);
  const cam = new T.PerspectiveCamera(35, 1, 10, 20000), rt = new T.WebGLRenderTarget(size, size), px = new Uint8Array(size * size * 4), img = ctx.createImageData(size, size);
  [[-0.8, 0], [0.8, 0], [Math.PI, 0], [Math.PI / 2, 0]].forEach(([a], i) => {
    cam.position.set(Math.sin(a) * 2600, 1100, -Math.cos(a) * 2600); cam.lookAt(0, 420, 0);
    renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, (i % 2) * size, Math.floor(i / 2) * size);
  });
  renderer.setRenderTarget(null); rt.dispose();
  return cv;
}
