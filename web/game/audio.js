'use strict';
// Sound effects and the two-stroke engine.
// ------------------------------------------------------------------ audio
// iOS: play as media so the silent switch doesn't mute the game (Safari 17+)
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older iOS */ }
const VOL_DEFAULTS = { master: 1, race: 0.3, voices: 1, music: 0.3, city: 0.3 };
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
// Auto-rickshaw engine: single-cylinder two-stroke. Each firing is a pop that rings an exhaust
// resonance and a tinny body rattle; off-throttle it misfires ("ring-ding-ding").
const TWO_STROKE_WORKLET = `
class TwoStroke extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [
    { name: 'rpm', defaultValue: 0, minValue: 0, maxValue: 1 },
    { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1 },
    { name: 'level', defaultValue: 0, minValue: 0, maxValue: 1 } ]; }
  constructor() { super(); this.ph = 0; this.env = 0; this.kick = 0; this.lvl = 0; this.rpm = 0; this.thr = 0;
    this.a1 = 0; this.a2 = 0; this.b1 = 0; this.b2 = 0; this.hp = 0; this.jit = 1; }
  process(_, outputs, p) {
    const out = outputs[0][0], sr = sampleRate;
    for (let i = 0; i < out.length; i++) {
      const tr = p.rpm.length > 1 ? p.rpm[i] : p.rpm[0], tt = p.throttle.length > 1 ? p.throttle[i] : p.throttle[0], tl = p.level.length > 1 ? p.level[i] : p.level[0];
      this.rpm += (tr - this.rpm) * 0.0004; this.thr += (tt - this.thr) * 0.002; this.lvl += (tl - this.lvl) * 0.001;
      const f = (24 + this.rpm * 82) * this.jit;
      this.ph += f / sr;
      if (this.ph >= 1) {
        this.ph -= 1; this.jit = 0.93 + Math.random() * 0.14;
        const misfire = Math.random() < (this.thr < 0.3 ? 0.18 + this.rpm * 0.25 : 0.03);
        if (!misfire) { this.env = (0.75 + Math.random() * 0.5) * (0.55 + this.thr * 0.45); this.kick = 1; }
      }
      const noise = Math.random() * 2 - 1;
      const x = this.env * noise * 0.6 + this.kick * 0.9;
      this.kick = 0;
      this.env *= Math.exp(-1 / (sr * (0.006 + (1 - this.rpm) * 0.01)));
      // exhaust resonance (low, "phut") and body rattle (high, tinny)
      // input gains are scaled by sin(w) so each resonator peaks near the excitation level
      const w1 = 2 * Math.PI * (150 + this.rpm * 170) / sr, r1 = 0.9975;
      const y1 = 2 * r1 * Math.cos(w1) * this.a1 - r1 * r1 * this.a2 + x * Math.sin(w1) * 0.7; this.a2 = this.a1; this.a1 = y1;
      const w2 = 2 * Math.PI * (1150 + this.rpm * 500) / sr, r2 = 0.99;
      const y2 = 2 * r2 * Math.cos(w2) * this.b1 - r2 * r2 * this.b2 + x * Math.sin(w2) * 0.35; this.b2 = this.b1; this.b1 = y2;
      this.hp += (noise - this.hp) * 0.2;
      let y = y1 + y2 + (noise - this.hp) * 0.01 * (0.4 + this.rpm);
      y = Math.tanh(y * 0.3) * 0.9; // raw peaks ~3 at idle, ~6 flat out: light crunch only when revved
      out[i] = y * this.lvl;
    }
    return true;
  }
}
registerProcessor('two-stroke', TwoStroke);`;

const Sfx = {
  ctx: null, master: null, engine: null, muted: store.get('muted', false), vol: { ...VOL_DEFAULTS, ...store.get('vol', {}) },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {
      if (!this.problem) { this.problem = 'Sound isn\'t supported in this browser'; reportProblem('audio', 'AudioContext unavailable', e); }
      return;
    }
    const a = this.ctx;
    // iOS can interrupt audio (call, screen recording, another app); explain it and recover by itself
    a.onstatechange = () => {
      if (a.state === 'running') this.problem = null;
      else if (a.state === 'interrupted') this.problem = 'Sound paused by your phone (call, screen recording or another app): tap to resume';
    };
    this.master = a.createGain(); this.master.connect(a.destination);
    // three channels the player can balance: race (engine, horn, fights), music, city noise
    for (const k of ['raceBus', 'voiceBus', 'musicBus', 'cityBus']) { this[k] = a.createGain(); this[k].connect(this.master); }
    this.applyVol();
    // iOS unlock: a silent blip started from inside the tap
    const blip = a.createBufferSource(); blip.buffer = a.createBuffer(1, 1, 22050); blip.connect(a.destination); blip.start(0);
    const len = a.sampleRate; this.noiseBuf = a.createBuffer(1, len, a.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.loadSamples();
    VoiceClips.loadClips();
    Animals.loadAnimals();
    VehicleAudio.loadHorns();
    Music.ensure();
    Ambience.ensure();
    if (a.audioWorklet) {
      const url = URL.createObjectURL(new Blob([TWO_STROKE_WORKLET], { type: 'application/javascript' }));
      a.audioWorklet.addModule(url).then(() => {
        const node = new AudioWorkletNode(a, 'two-stroke');
        const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
        node.connect(hp); hp.connect(this.raceBus);
        this.engine = { worklet: node, rpm: node.parameters.get('rpm'), throttle: node.parameters.get('throttle'), level: node.parameters.get('level') };
      }).catch(e => { reportProblem('audio', 'engine synth AudioWorklet failed (using fallback)', e); this.fallbackEngine(); });
    } else this.fallbackEngine();
  },
  // simple oscillator engine for browsers without AudioWorklet
  fallbackEngine() {
    const a = this.ctx;
    const o = a.createOscillator(); o.type = 'square';
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 2;
    const eg = a.createGain(); eg.gain.value = 0;
    const lfo = a.createOscillator(); lfo.type = 'square'; const lg = a.createGain(); lg.gain.value = 0;
    lfo.connect(lg); lg.connect(eg.gain); o.connect(f); f.connect(eg); eg.connect(this.raceBus); o.start(); lfo.start();
    this.engine = { o, f, eg, lfo, lg };
  },
  // Recorded engine (web/sounds.js): an idle loop and a rev loop, crossfaded by load and pitched by speed.
  // Until they decode (or if they fail) the synthesised two-stroke plays instead.
  loadSamples() {
    const src = window.RRR_SOUNDS; if (!src) { reportProblem('audio', 'sounds.js missing: engine recording not loaded'); return; }
    const a = this.ctx, bufs = {};
    const decode = url => {
      const bin = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Promise((res, rej) => a.decodeAudioData(bytes.buffer, res, rej));
    };
    Promise.all(Object.entries(src).map(([k, url]) => decode(url).then(b => { bufs[k] = b; }))).then(() => {
      const loop = buf => { const n = a.createBufferSource(); n.buffer = buf; n.loop = true; const g = a.createGain(); g.gain.value = 0; n.connect(g); g.connect(this.raceBus); n.start(); return { n, g }; };
      const idle = loop(bufs.idle), rev = loop(bufs.rev);
      this.samples = { idleSrc: idle.n, idleGain: idle.g, revSrc: rev.n, revGain: rev.g, start: bufs.start };
    }).catch(e => { this.samples = null; reportProblem('audio', 'engine recording decode failed (using synth)', e); });
  },
  // kick-start at the beginning of a race; the loops fade in once it has caught
  startEngine() {
    const s = this.samples; if (!s || !this.ctx) return;
    const n = this.ctx.createBufferSource(); n.buffer = s.start;
    const g = this.ctx.createGain(); g.gain.value = 0.8; n.connect(g); g.connect(this.raceBus); n.start();
    this.engineOnAt = this.ctx.currentTime + 1.6;
  },
  toggleMute() { this.muted = !this.muted; store.set('muted', this.muted); this.applyVol(); },
  setVol(k, v) { this.vol[k] = Math.round(clamp(v, 0, 1) * 10) / 10; store.set('vol', this.vol); this.applyVol(); },
  applyVol() {
    if (!this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5 * this.vol.master, t, 0.03);
    this.raceBus.gain.setTargetAtTime(this.vol.race, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this.vol.music, t, 0.03);
    this.cityBus.gain.setTargetAtTime(this.vol.city, t, 0.03);
    this.voiceBus.gain.setTargetAtTime(this.vol.voices, t, 0.03);
  },
  get running() { return !!this.ctx && this.ctx.state === 'running'; },
  setEngine(pct, on, throttle = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, smp = this.samples;
    if (smp) {
      if (this.engine && this.engine.worklet) this.engine.level.setTargetAtTime(0, t, 0.05);
      const live = on && t >= (this.engineOnAt || 0);
      const load = clamp(pct * 0.75 + throttle * 0.35, 0, 1);
      const k = clamp((load - 0.2) / 0.55, 0, 1), revMix = k * k * (3 - 2 * k);
      smp.idleGain.gain.setTargetAtTime(live ? (1 - revMix) * 0.8 : 0, t, 0.08);
      smp.revGain.gain.setTargetAtTime(live ? revMix * 0.7 : 0, t, 0.08);
      smp.idleSrc.playbackRate.setTargetAtTime(1 + pct * 0.7, t, 0.1);
      smp.revSrc.playbackRate.setTargetAtTime(0.82 + pct * 0.45 + throttle * 0.05, t, 0.1);
      return;
    }
    const e = this.engine; if (!e) return;
    if (e.worklet) {
      e.rpm.setTargetAtTime(clamp(pct * 0.85 + throttle * 0.15, 0, 1), t, 0.05);
      e.throttle.setTargetAtTime(throttle, t, 0.05);
      e.level.setTargetAtTime(on ? 0.55 : 0, t, 0.1);
      return;
    }
    e.eg.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.08); e.lg.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.08);
    e.o.frequency.setTargetAtTime(90 + pct * 160, t, 0.06); e.lfo.frequency.setTargetAtTime(24 + pct * 80, t, 0.06);
    e.f.frequency.setTargetAtTime(300 + pct * 700, t, 0.06);
  },
  tone(freq, dur, type = 'sine', vol = 0.3, slide = null, delay = 0, filter = null) {
    if (!this.ctx) return; const a = this.ctx, t = a.currentTime + delay;
    const o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o; if (filter) { const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter; o.connect(fl); node = fl; }
    node.connect(g); g.connect(this.raceBus); o.start(t); o.stop(t + dur + 0.05);
  },
  // tyre squeal while drifting: two detuned saws through a narrow band plus hiss, level set every frame
  squeal(level) {
    if (!this.ctx) return; const a = this.ctx, t = a.currentTime;
    if (!this.sq) {
      const g = a.createGain(); g.gain.value = 0; const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 9;
      const o1 = a.createOscillator(), o2 = a.createOscillator(); o1.type = o2.type = 'sawtooth'; o1.frequency.value = 1080; o2.frequency.value = 1210;
      const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 7; lg.gain.value = 60; lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
      const n = a.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true; const hp = a.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2600; hp.Q.value = 3;
      o1.connect(bp); o2.connect(bp); n.connect(hp); bp.connect(g); hp.connect(g); g.connect(this.raceBus);
      for (const s of [o1, o2, lfo, n]) s.start();
      this.sq = g;
    }
    this.sq.gain.setTargetAtTime(level * 0.11, t, 0.06);
  },
  noise(dur, vol, filter = 1000, delay = 0) {
    if (!this.ctx) return; const a = this.ctx, t = a.currentTime + delay;
    const s = a.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter;
    const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.raceBus); s.start(t); s.stop(t + dur + 0.05);
  },
  horn() { this.tone(380, 0.13, 'square', 0.16, 360, 0, 1800); this.tone(300, 0.22, 'square', 0.16, 280, 0.15, 1600); },
  hit(kind = 'wood') { // wood: a stick's thwack; slap: a hand, a shoe, a wet cloth; thud: a kick or something heavy
    if (kind === 'slap') { this.noise(0.07, 0.6, 3200); this.tone(420, 0.06, 'triangle', 0.25, 180); }
    else if (kind === 'thud') { this.noise(0.16, 0.4, 600); this.tone(80, 0.26, 'sine', 0.7, 38); }
    else { this.noise(0.12, 0.5, 1400); this.tone(120, 0.2, 'sine', 0.55, 50); }
  },
  whoosh() { this.noise(0.14, 0.12, 3500); },
  crash() { this.noise(0.8, 0.6, 700); this.tone(90, 0.6, 'sine', 0.5, 30); this.noise(0.3, 0.3, 4000, 0.1); },
  // a steady hiss of rain on monsoon tracks (on the city bus, with the street noise)
  rain(on) {
    if (!this.ctx || !this.cityBus || !!this.rainSrc === on) return;
    if (!on) { this.rainSrc.stop(); this.rainSrc = null; return; }
    const a = this.ctx, n = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    n.buffer = this.noiseBuf; n.loop = true; f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.5; g.gain.value = 0.4;
    n.connect(f); f.connect(g); g.connect(this.cityBus); n.start(); this.rainSrc = n;
  },
  thunder() { this.noise(2.8, 0.55, 220); this.noise(1.2, 0.3, 700, 0.06); this.tone(45, 2.2, 'sine', 0.35, 30); },
  splash() { this.noise(0.45, 0.35, 1600); this.noise(0.3, 0.18, 5000, 0.04); },
  bump() { this.tone(90, 0.12, 'sine', 0.4, 60); this.noise(0.08, 0.2, 900); },
  whistle() { for (const [t, d] of [[0, 0.12], [0.18, 0.5]]) { this.tone(2900, d, 'sine', 0.16, 3100, t); this.tone(3350, d, 'sine', 0.08, 3500, t); } }, // traffic cop's whistle
  grunt() { this.tone(rand(170, 230), 0.22, 'sawtooth', 0.12, 110, 0, 900); },
  bark() { this.tone(560, 0.08, 'sawtooth', 0.14, 330, 0, 1600); this.noise(0.05, 0.08, 2200); this.tone(520, 0.08, 'sawtooth', 0.12, 300, 0.14, 1600); },
  yelp() { this.tone(900, 0.12, 'triangle', 0.16, 1500); this.tone(1300, 0.22, 'triangle', 0.12, 700, 0.12); },
  moo() { this.tone(150, 1.0, 'sawtooth', 0.14, 100, 0, 500); },
  beep(hi) { this.tone(hi ? 880 : 520, hi ? 0.4 : 0.18, 'square', 0.14, null, 0, 2500); },
  ko() { this.tone(700, 0.5, 'triangle', 0.25, 140); },
  cash() { this.tone(1200, 0.08, 'square', 0.1); this.tone(1600, 0.14, 'square', 0.1, null, 0.08); },
};
