'use strict';
// City street noise and animal sounds.
// ------------------------------------------------------------------ street ambience
// Real market/street recordings per city (web/cities/<city>/ambience.js, loaded on demand). The loop is
// played as overlapping copies with crossfades so there is no seam, and it swells near shops.
const Ambience = {
  city: null, bufs: {}, requested: {}, bus: null, next: 0, timer: null, sources: [],
  XF: 2,
  setCity(city) {
    if (city === this.city) return;
    this.city = city; this.stopAll();
    if (!this.requested[city]) {
      this.requested[city] = true;
      const tag = document.createElement('script'); tag.src = `cities/${city}/ambience.js`;
      tag.onerror = () => reportProblem('audio', `cities/${city}/ambience.js failed to load`);
      document.head.appendChild(tag);
    }
  },
  stopAll() { const a = Sfx.ctx; for (const s of this.sources) { try { s.g.gain.setTargetAtTime(0, a.currentTime, 0.3); s.n.stop(a.currentTime + 1.5); } catch (e) { /* not started */ } } this.sources = []; this.next = 0; },
  ensure() {
    const a = Sfx.ctx; if (!a || this.bus) return;
    this.bus = a.createGain(); this.bus.gain.value = 0; this.bus.connect(Sfx.cityBus);
    this.timer = setInterval(() => this.tick(), 200);
  },
  decode(city) {
    const url = (window.RRR_AMBIENCE || {})[city]; if (!url || this.bufs[city] !== undefined) return;
    this.bufs[city] = null;
    const bin = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    Sfx.ctx.decodeAudioData(bytes.buffer, b => { this.bufs[city] = b; }, e => { this.bufs[city] = false; reportProblem('audio', `${city} street sound decode failed`, e); });
  },
  shopsNearby() {
    if (!segments.length) return 0;
    let n = 0; const base = findSegment(position).index;
    for (let i = 0; i < 40; i++) for (const s of segments[(base + i) % segments.length].sprites) if (s.kind === 'chai' || s.kind === 'building') n++;
    return Math.min(1, n / 6);
  },
  tick() {
    const a = Sfx.ctx; if (!a || a.state !== 'running') return;
    this.decode(this.city);
    const buf = this.bufs[this.city];
    const quiet = !def || !def.ambience; // e.g. out on the Sea Link
    const base = paused ? 0.2 : state === 'title' || state === 'champion' ? 0.5 : 0.8;
    this.bus.gain.setTargetAtTime(quiet ? 0 : base * (0.7 + 0.3 * this.shopsNearby()), a.currentTime, 0.8);
    if (!buf) return;
    if (!this.next || this.next < a.currentTime) this.next = a.currentTime + 0.05;
    if (this.next - a.currentTime > this.XF + 0.5) return;
    // schedule the next overlapping copy: fade in over XF, fade out over the last XF
    const t = this.next, d = buf.duration, n = a.createBufferSource(), g = a.createGain();
    n.buffer = buf; n.connect(g); g.connect(this.bus);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + this.XF);
    g.gain.setValueAtTime(1, t + d - this.XF); g.gain.linearRampToValueAtTime(0, t + d);
    n.start(t); n.stop(t + d + 0.05);
    const entry = { n, g }; this.sources.push(entry); n.onended = () => { this.sources = this.sources.filter(s => s !== entry); };
    this.next = t + d - this.XF;
  },
};

// ------------------------------------------------------------------ animals
// Cows moo and dogs bark from where they stand on the road: distance gain, stereo pan and a
// Doppler-ish pitch nudge. Played on the City noise channel.
const Animals = {
  mooT: 2, lastMoo: 0,
  spot(c) {
    const dz = wrapDelta(c.z - player.dist), closeness = clamp(1 - Math.abs(dz) / 3200, 0, 1);
    const closing = clamp((player.speed - (c.speed || 0)) * Math.sign(dz || 1) / MAX_SPEED, -1, 1);
    return { dz, gain: closeness * closeness, pan: clamp((c.x - player.x) * 0.55, -0.9, 0.9), rate: 1 + 0.12 * closing };
  },
  outAt(gain, pan) {
    const a = Sfx.ctx; if (!a || !Sfx.cityBus || gain < 0.02) return null;
    const g = a.createGain(); g.gain.value = gain;
    if (a.createStereoPanner) { const pn = a.createStereoPanner(); pn.pan.value = pan; g.connect(pn); pn.connect(Sfx.cityBus); } else g.connect(Sfx.cityBus);
    return g;
  },
  // real recordings from web/animals.js (dog barks, a bark-and-growl, two cow moos)
  bufs: {}, loaded: false,
  loadAnimals() {
    if (this.loaded || !Sfx.ctx) return; this.loaded = true;
    const src = window.RRR_ANIMALS;
    if (!src) { reportProblem('audio', 'animals.js missing: cows and dogs will be silent'); return; }
    for (const [name, url] of Object.entries(src)) {
      const bin = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      Sfx.ctx.decodeAudioData(bytes.buffer, b => { this.bufs[name] = b; }, e => reportProblem('audio', `animal sound ${name} decode failed`, e));
    }
  },
  playAt(name, gain, pan, rate, delay = 0) {
    const a = Sfx.ctx, buf = this.bufs[name], out = buf && this.outAt(gain, pan); if (!out) return;
    const n = a.createBufferSource(); n.buffer = buf; n.playbackRate.value = rate * rand(0.94, 1.06); // every animal a little different
    n.connect(out); n.start(a.currentTime + delay);
  },
  mooAt(gain, pan, rate) { this.playAt(pick(['moo1', 'moo2']), gain, pan, rate); },
  barkAt(gain, pan, rate, times = 2) {
    if (times >= 3) { this.playAt('growl', gain, pan, rate); return; } // riled up: bark and growl
    this.playAt(pick(['bark1', 'bark2']), gain, pan, rate);
    if (times === 2) this.playAt(pick(['bark1', 'bark2']), gain, pan, rate * 1.04, rand(0.28, 0.4));
  },
  mooFrom(c) { const p = this.spot(c); this.mooAt(Math.max(p.gain, 0.3), p.pan, p.rate); this.lastMoo = performance.now(); },
  barkFrom(c, times) { const p = this.spot(c); this.barkAt(p.gain, p.pan, p.rate, times || 1 + Math.floor(Math.random() * 3)); },
  updateAnimals(dt) {
    if (!Sfx.ctx || !RACING_STATES.includes(state) || paused) return;
    this.mooT -= dt;
    for (const c of traffic) {
      const dz = wrapDelta(c.z - player.dist);
      if (dz < -400 || dz > 2600) { if (c.type === 'cow' && Math.abs(dz) > 3000) c.mooed = false; continue; }
      // most cows moo once as you come up on them
      if (c.type === 'cow' && !c.mooed && dz > 0 && dz < 2200) { c.mooed = true; if (this.mooT <= 0 && Math.random() < 0.7) { this.mooFrom(c); this.mooT = rand(1.2, 2.5); } }
      // roadside dogs sound off as you come up to them (chasers bark from updateDog)
      if (c.type === 'dog' && c.mode === 'sit' && dz > 0 && dz < 1500 && Math.random() < dt * 0.25) this.barkFrom(c);
    }
  },
};
