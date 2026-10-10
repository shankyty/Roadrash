'use strict';
// Engines and horns of the traffic around you.
// ------------------------------------------------------------------ other vehicles
// Positional engine sound for the nearest buses, trucks, cars and rival autos (louder when close,
// panned to their side of the road, Doppler-shifted as you close in or drop back), plus Indian
// traffic horns: random honking, and vehicles honking at you when you overtake them closely.
const VEHICLE_SOUND = {
  truck: { f: 30, f2: 2, lp: 230, am: [8, 0.45], gain: 0.55, horn: { notes: [196, 247], dur: 0.75, wave: 'sawtooth', cut: 1700, blasts: 1 } },
  bus: { f: 36, f2: 2, lp: 260, am: [9, 0.35], gain: 0.5, horn: { notes: [294, 370], dur: 0.35, wave: 'sawtooth', cut: 2200, blasts: 2 } },
  tractor: { f: 24, f2: 2, lp: 200, am: [11, 0.75], gain: 0.5, horn: { notes: [220, 277], dur: 0.45, wave: 'sawtooth', cut: 1500, blasts: 1 } },
  bike: { f: 58, f2: 1.7, lp: 900, am: [28, 0.35], gain: 0.16, horn: { notes: [560, 660], dur: 0.1, wave: 'square', cut: 3600, blasts: 2 } },
  car: { f: 70, f2: 1.5, lp: 600, am: [0, 0], gain: 0.25, horn: { notes: [415, 523], dur: 0.12, wave: 'square', cut: 3000, blasts: 2 } },
  auto: { f: 34, f2: 1.5, lp: 500, am: [22, 0.6], gain: 0.22, horn: { notes: [380, 300], dur: 0.16, wave: 'square', cut: 1800, blasts: 2, bulb: true } },
};
const VehicleAudio = {
  voices: [], ready: false, honkT: 3,
  kindOf(c) { return c.isRival ? 'auto' : VEHICLE_SOUND[c.type] ? c.type : null; },
  ensureVoices() {
    const a = Sfx.ctx; if (this.ready) return true; if (!a || !Sfx.raceBus) return false;
    for (let i = 0; i < 5; i++) {
      const g = a.createGain(); g.gain.value = 0;
      const pan = a.createStereoPanner ? a.createStereoPanner() : null;
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 1.5;
      const o1 = a.createOscillator(); o1.type = 'sawtooth';
      const o2 = a.createOscillator(); o2.type = 'square';
      const am = a.createGain(); am.gain.value = 1;
      const lfo = a.createOscillator(); lfo.type = 'square';
      const lfoG = a.createGain(); lfoG.gain.value = 0; lfo.connect(lfoG); lfoG.connect(am.gain);
      o1.connect(lp); o2.connect(lp); lp.connect(am); am.connect(g);
      if (pan) { g.connect(pan); pan.connect(Sfx.raceBus); } else g.connect(Sfx.raceBus);
      o1.start(); o2.start(); lfo.start();
      this.voices.push({ o1, o2, lp, g, pan, lfo, lfoG });
    }
    return (this.ready = true);
  },
  updateVehicles(dt) {
    if (!this.ensureVoices()) return;
    const a = Sfx.ctx, t = a.currentTime, live = RACING_STATES.includes(state) && !paused;
    const near = [];
    if (live) {
      for (const c of traffic) {
        const kind = this.kindOf(c); if (!kind) continue;
        const dz = wrapDelta(c.z - player.dist);
        // overtaking close by: they often lean on the horn
        if (c.dir !== -1 && c._dz > 0 && dz <= 0 && Math.abs(c.x - player.x) < 0.9 && player.speed > c.speed && Math.random() < 0.55) this.honkAt(c, dz, true);
        // rash bikers lean on the horn coming up behind you
        if (c.rash && c.dir !== -1 && dz < 0 && dz > -1800 && Math.abs(c.x - player.x) < 0.5 && !(c.honkCd > 0)) { c.honkCd = 1.1; this.honkAt(c, dz, true); }
        // you're in an oncoming vehicle's lane, heading at it: long angry horn
        if (c.dir === -1 && dz > 0 && dz < 4500 && Math.abs(c.x - player.x) < (c.nw + TUK_NW) / 2 && !(c.honkCd > 0)) { c.honkCd = 2.5; this.honkAt(c, dz, true); }
        if (c.honkCd > 0) c.honkCd -= dt;
        c._dz = dz;
        if (dz > -800 && dz < 3500) near.push({ c, kind, dz });
      }
      for (const r of rivals) { const dz = r.dist - player.dist; if (r.ko <= 0 && dz > -800 && dz < 3500) near.push({ c: r, kind: 'auto', dz }); }
      // random city honking from someone in view
      this.honkT -= dt;
      if (this.honkT <= 0) {
        this.honkT = rand(1.5, 4.5);
        const pool = near.filter(n => n.dz > -300); if (pool.length) { const n = pick(pool); this.honkAt(n.c, n.dz, false); }
      }
    }
    near.sort((x, y) => Math.abs(x.dz) - Math.abs(y.dz));
    this.voices.forEach((v, i) => {
      const e = near[i];
      if (!e) { v.g.gain.setTargetAtTime(0, t, 0.15); return; }
      const { c, kind, dz } = e, p = VEHICLE_SOUND[kind];
      const closeness = Math.max(0, 1 - Math.abs(dz) / 3500);
      const closing = clamp((dz > 0 ? 1 : -1) * (player.speed - (c.dir || 1) * c.speed) / MAX_SPEED, -1, 1); // + while approaching
      const rpm = kind === 'auto' ? c.speed / MAX_SPEED : 0.6;
      const f = p.f * (1 + (kind === 'auto' ? rpm * 1.6 : 0.2)) * (1 + 0.12 * closing);
      v.o1.frequency.setTargetAtTime(f, t, 0.1); v.o2.frequency.setTargetAtTime(f * p.f2, t, 0.1);
      v.lp.frequency.setTargetAtTime(p.lp * (0.6 + 0.8 * closeness), t, 0.1);
      v.lfo.frequency.setTargetAtTime(Math.max(1, p.am[0] * (kind === 'auto' ? 0.6 + rpm * 1.4 : 1)), t, 0.1);
      v.lfoG.gain.setTargetAtTime(p.am[1] * 0.5, t, 0.1);
      v.g.gain.setTargetAtTime(p.gain * closeness * closeness, t, 0.12);
      if (v.pan) v.pan.pan.setTargetAtTime(clamp((c.x - player.x) * 0.7, -0.9, 0.9), t, 0.1);
    });
  },
  // real horns (web/horns.js): musical truck horns and a deep bus air horn, recorded in Jaipur
  hornBufs: {}, hornsLoaded: false,
  loadHorns() {
    if (this.hornsLoaded || !Sfx.ctx) return; this.hornsLoaded = true;
    const src = window.RRR_HORNS;
    if (!src) { reportProblem('audio', 'horns.js missing: using synthesised horns'); return; }
    for (const [name, url] of Object.entries(src)) {
      const bin = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      Sfx.ctx.decodeAudioData(bytes.buffer, b => { this.hornBufs[name] = b; }, e => reportProblem('audio', `horn ${name} decode failed`, e));
    }
  },
  honkAt(c, dz, angry) {
    const kind = this.kindOf(c); if (!kind) return;
    const h = VEHICLE_SOUND[kind].horn, closeness = Math.max(0, 1 - Math.abs(dz) / 3500);
    const vol = 0.35 * closeness * closeness + (angry ? 0.1 : 0), pan = clamp((c.x - player.x) * 0.7, -0.9, 0.9);
    const rec = kind === 'truck' ? this.hornBufs[pick(['truck1', 'truck2'])] : kind === 'bus' ? this.hornBufs.bus : null;
    if (rec) this.hornClip(rec, vol * 2.2, pan, angry); else this.hornTone(h, vol, pan, angry ? 1.6 : 1);
  },
  hornClip(buf, vol, panX, angry) {
    const a = Sfx.ctx; if (!a || vol < 0.01) return;
    const out = a.createGain(); out.gain.value = Math.min(vol, 1.2);
    if (a.createStereoPanner) { const pn = a.createStereoPanner(); pn.pan.value = panX; out.connect(pn); pn.connect(Sfx.raceBus); } else out.connect(Sfx.raceBus);
    const n = a.createBufferSource(); n.buffer = buf; n.playbackRate.value = rand(0.97, 1.03); n.connect(out);
    // an angry driver cuts the horn short and hits it again
    if (angry) { n.start(a.currentTime, 0, Math.min(0.7, buf.duration)); const n2 = a.createBufferSource(); n2.buffer = buf; n2.connect(out); n2.start(a.currentTime + 0.8); }
    else n.start();
  },
  hornTone(h, vol, panX, stretch) {
    const a = Sfx.ctx; if (!a || vol < 0.01) return;
    const out = a.createGain(); out.gain.value = vol;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = h.cut; lp.connect(out);
    if (a.createStereoPanner) { const pn = a.createStereoPanner(); pn.pan.value = panX; out.connect(pn); pn.connect(Sfx.raceBus); } else out.connect(Sfx.raceBus);
    const blast = h.dur * stretch;
    for (let b = 0; b < h.blasts; b++) {
      const t0 = a.currentTime + b * (blast + 0.08);
      const env = a.createGain(); env.gain.setValueAtTime(0.0001, t0); env.gain.exponentialRampToValueAtTime(1, t0 + 0.02);
      env.gain.setValueAtTime(1, t0 + blast * 0.8); env.gain.exponentialRampToValueAtTime(0.0001, t0 + blast); env.connect(lp);
      (h.bulb ? [h.notes[b % 2]] : h.notes).forEach(f => {
        const o = a.createOscillator(); o.type = h.wave; o.frequency.setValueAtTime(f, t0);
        if (!h.bulb) o.frequency.linearRampToValueAtTime(f * 0.97, t0 + blast); // air horns sag a little
        o.connect(env); o.start(t0); o.stop(t0 + blast + 0.05);
      });
    }
  },
};
