'use strict';
// Background music and the drift anthem.
// ------------------------------------------------------------------ music
// Light background music, one original groove per city, synthesised live (16th-note sequencer).
// Each city pack carries its song (web/cities/<id>/city.js); pitches are semitones above Sa (D3).
const SA_HZ = 146.83;
const Music = {
  on: store.get('music', true), city: null, bus: null, step: 0, next: 0, timer: null,
  hz(semi) { return SA_HZ * Math.pow(2, semi / 12); },
  ensure() {
    const a = Sfx.ctx; if (!a || !Sfx.master) return false;
    if (!this.bus) {
      this.bus = a.createGain(); this.bus.gain.value = 0; this.bus.connect(Sfx.musicBus);
      // tanpura-style drone on Sa and Pa
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      const dg = a.createGain(); dg.gain.value = 0.045; lp.connect(dg); dg.connect(this.bus);
      for (const [semi, det] of [[-12, 0], [-5, 3], [0, -3]]) { const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.hz(semi); o.detune.value = det; o.connect(lp); o.start(); }
      this.next = a.currentTime + 0.1;
      this.timer = setInterval(() => this.tick(), 25);
    }
    return true;
  },
  setCity(city) { if (city !== this.city) { this.city = city; this.step = 0; if (Sfx.ctx) this.next = Sfx.ctx.currentTime + 0.1; } },
  toggle() { this.on = !this.on; store.set('music', this.on); },
  tick() {
    const a = Sfx.ctx, song = this.city && this.city.song; if (!a || !song) return;
    const vol = (!this.on ? 0 : paused ? 0.1 : state === 'title' || state === 'champion' || state === 'results' ? 0.3 : 0.2) * DriftMusic.duck;
    this.bus.gain.setTargetAtTime(vol, a.currentTime, 0.3);
    if (a.state !== 'running' || !this.on) { this.next = a.currentTime + 0.1; return; }
    const stepDur = 60 / song.bpm / 4;
    if (this.next < a.currentTime - 0.2) this.next = a.currentTime + 0.05;
    while (this.next < a.currentTime + 0.12) {
      const s = this.step, t = this.next + (s % 2 ? song.swing * stepDur : 0);
      for (const [inst, pat] of Object.entries(song.drums)) if (pat[s % pat.length] === 'x') this.drum(inst, t, s);
      for (const [at, semi, len] of song.melody) if (at === s % 32) this.note(song.lead, t, semi, len * stepDur);
      this.next += stepDur; this.step++;
    }
  },
  env(t, peak, attack, dur) { const g = Sfx.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(this.bus); return g; },
  osc(type, f, t, dur, dest, f2) { const o = Sfx.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.8); o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o; },
  noise(t, dur, peak, type, freq, q = 1) {
    const a = Sfx.ctx, n = a.createBufferSource(); n.buffer = Sfx.noiseBuf;
    const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    n.connect(f); f.connect(this.env(t, peak, 0.003, dur)); n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.05);
  },
  drum(inst, t, s) {
    const accent = s % 4 === 0 ? 1 : 0.75;
    if (inst === 'dha') { this.osc('sine', 120, t, 0.35, this.env(t, 0.9 * accent, 0.004, 0.35), 52); this.noise(t, 0.04, 0.15, 'lowpass', 900); }
    if (inst === 'ghe') { this.osc('sine', 72, t, 0.4, this.env(t, 0.8, 0.004, 0.4), 105); } // tabla bayan: pitch bends up
    if (inst === 'na') { this.osc('triangle', 520 + Math.random() * 60, t, 0.1, this.env(t, 0.32 * accent, 0.002, 0.1), 470); this.noise(t, 0.025, 0.08, 'highpass', 3500); }
    if (inst === 'clap') { for (const d of [0, 0.012, 0.024]) this.noise(t + d, 0.05, 0.25, 'bandpass', 1400, 1.2); }
    if (inst === 'shaker') this.noise(t, 0.035, 0.05 * accent, 'highpass', 6500);
  },
  note(lead, t, semi, dur) {
    const a = Sfx.ctx, f = this.hz(semi + 12);
    if (lead === 'harmonium') {
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000; lp.connect(this.env(t, 0.09, 0.04, dur + 0.08));
      this.osc('sawtooth', f * 1.002, t, dur + 0.08, lp); this.osc('sawtooth', f * 0.998, t, dur + 0.08, lp); this.osc('square', f / 2, t, dur + 0.08, lp);
    } else if (lead === 'tumbi') {
      const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700; hp.connect(this.env(t, 0.13, 0.002, 0.22));
      this.osc('sawtooth', f * 2.04, t, 0.22, hp, f * 2);
    } else if (lead === 'nadaswaram') {
      const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.1; bp.connect(this.env(t, 0.11, 0.05, dur + 0.05));
      const o1 = this.osc('sawtooth', f * 2, t, dur + 0.05, bp), o2 = this.osc('square', f * 2, t, dur + 0.05, bp);
      const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 7; lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency); lfo.start(t); lfo.stop(t + dur + 0.1);
    }
  },
};

// ------------------------------------------------------------------ drift anthem
// An original drift track (not a copy of any song): 132 BPM trap beat with an 808 kick that slides,
// claps on 2 and 4, hi-hat rolls, and a koto-like plucked riff in the Japanese "in" scale on E. It slams
// in with a gong when you start drifting, keeps going while you chain drifts and fades out ~2 s after
// the last one; the city music ducks under it. It plays on the music bus, so the Music slider and N apply.
const DRIFT_SONG = {
  bpm: 132,
  // 32 sixteenth steps (2 bars)
  kick:  'x.....x...x.....x.....x..x..x...',
  clap:  '........x...............x.......',
  hat:   'x.x.x.x.x.x.x.x.x.x.x.x.xxxxx.x.',
  // 808 root per step (semitones from E1); '.' = hold
  bass:  [[0, 0], [6, 0], [10, 3], [16, 5], [22, 3], [26, -2]],
  // koto riff over 4 bars: [step 0..63, semitone from E4, length in steps]  (E F A B C = 0 1 5 7 8)
  koto:  [[0, 12, 2], [2, 8, 2], [4, 7, 2], [6, 5, 2], [8, 7, 4], [14, 1, 2], [16, 0, 4], [22, 5, 2], [24, 7, 2], [26, 8, 2], [28, 7, 4],
          [32, 12, 2], [34, 13, 2], [36, 12, 2], [38, 8, 2], [40, 7, 4], [46, 5, 2], [48, 8, 2], [50, 7, 2], [52, 5, 2], [54, 1, 2], [56, 0, 8]],
};
const DriftMusic = {
  bus: null, on: false, step: 0, next: 0, timer: null, hold: 0, level: 0, lastT: 0,
  hz(semi, oct = 4) { return 329.63 * Math.pow(2, (semi + (oct - 4) * 12) / 12); }, // E4 = 329.63
  ensure() {
    const a = Sfx.ctx; if (!a || !Sfx.musicBus) return false;
    if (!this.bus) {
      this.bus = a.createGain(); this.bus.gain.value = 0; this.bus.connect(Sfx.musicBus);
      this.timer = setInterval(() => this.tick(), 25);
    }
    return true;
  },
  // called every frame: drifting = the player is mid-drift right now
  update(drifting) {
    if (!this.ensure()) return;
    const a = Sfx.ctx, now = performance.now() / 1000, dt = Math.min(0.1, now - (this.lastT || now)); this.lastT = now;
    const allowed = Music.on && !paused && state === 'race';
    if (drifting && allowed) {
      if (!this.on) { this.on = true; this.step = 0; this.next = a.currentTime + 0.06; this.gong(a.currentTime + 0.02); }
      this.hold = 2;
    } else this.hold -= dt;
    if (this.on && (this.hold <= 0 || !allowed)) this.on = false;
    this.level += ((this.on ? 1 : 0) - this.level) * Math.min(1, dt * (this.on ? 8 : 0.8));
    this.bus.gain.setTargetAtTime(this.level * 0.42, a.currentTime, 0.05);
  },
  get duck() { return 1 - 0.85 * this.level; }, // how much of the city music is left
  silence() { this.on = false; this.level = 0; this.hold = 0; if (this.bus) this.bus.gain.setTargetAtTime(0, Sfx.ctx.currentTime, 0.02); },
  tick() {
    const a = Sfx.ctx; if (!a || !this.bus || a.state !== 'running') return;
    if (!this.on && this.level < 0.02) { this.next = a.currentTime + 0.05; return; }
    const sd = 60 / DRIFT_SONG.bpm / 4;
    if (this.next < a.currentTime - 0.2) this.next = a.currentTime + 0.05;
    while (this.next < a.currentTime + 0.12) {
      const s = this.step, t = this.next, b = s % 32;
      if (DRIFT_SONG.kick[b] === 'x') this.kick(t);
      if (DRIFT_SONG.clap[b] === 'x') this.clap(t);
      if (DRIFT_SONG.hat[b] === 'x') this.hat(t, b >= 24 && b <= 28 ? 0.6 : b % 4 === 0 ? 1 : 0.7);
      for (const [at, semi] of DRIFT_SONG.bass) if (at === b) this.bass(t, semi, sd * 6);
      for (const [at, semi, len] of DRIFT_SONG.koto) if (at === s % 64) this.koto(t, semi, len * sd);
      this.next += sd; this.step++;
    }
  },
  env(t, peak, attack, dur, dest = this.bus) { const g = Sfx.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(dest); return g; },
  osc(type, f, t, dur, dest, f2, glide = 0.8) { const o = Sfx.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur * glide); o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o; },
  noise(t, dur, peak, type, freq, q = 1) {
    const a = Sfx.ctx, n = a.createBufferSource(); n.buffer = Sfx.noiseBuf;
    const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    n.connect(f); f.connect(this.env(t, peak, 0.002, dur)); n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.05);
  },
  kick(t) { this.osc('sine', 150, t, 0.5, this.env(t, 0.95, 0.003, 0.5), 45, 0.25); this.noise(t, 0.02, 0.2, 'lowpass', 1500); },
  clap(t) { for (const d of [0, 0.011, 0.022, 0.034]) this.noise(t + d, 0.09, 0.32, 'bandpass', 1300, 1.4); this.noise(t + 0.03, 0.35, 0.06, 'bandpass', 1800, 0.8); },
  hat(t, v) { this.noise(t, 0.04, 0.09 * v, 'highpass', 8000); },
  bass(t, semi, dur) { // 808: sine with a little saturation-ish square layer, sliding into the note
    const f = this.hz(semi, 1), g = this.env(t, 0.55, 0.01, dur);
    this.osc('sine', f * 1.25, t, dur, g, f, 0.12); this.osc('square', f, t, dur * 0.5, this.env(t, 0.05, 0.01, dur * 0.5));
  },
  koto(t, semi, dur) { // plucked string: bright attack, quick decay, a tiny pitch bend down (the koto "oshi" release)
    const a = Sfx.ctx, f = this.hz(semi, 4), hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
    hp.connect(this.env(t, 0.2, 0.002, Math.max(0.35, dur * 1.4)));
    this.osc('triangle', f * 1.012, t, Math.max(0.35, dur * 1.4), hp, f, 0.15); this.osc('sawtooth', f * 2, t, 0.12, this.env(t, 0.05, 0.001, 0.12, hp));
  },
  gong(t) { // the drift hit: inharmonic partials with a long, shimmering tail
    for (const [f, v, d] of [[82, 0.5, 2.6], [128, 0.3, 2.2], [197, 0.22, 1.8], [263, 0.14, 1.5], [419, 0.08, 1.1]]) {
      const o = this.osc('sine', f, t, d, this.env(t, v, 0.01, d)); o.detune.setValueAtTime(-15, t); o.detune.linearRampToValueAtTime(10, t + d);
    }
    this.noise(t, 0.6, 0.12, 'bandpass', 900, 0.7);
  },
};
