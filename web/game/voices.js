'use strict';
// Spoken curses and hawker calls.
// ------------------------------------------------------------------ voice clips
// Recorded (TTS-generated) lines from web/voices.js, played from the speaker's spot on the road:
// distance gain + muffling, stereo pan, and Doppler pitch while they play. Falls back to Voice (speech).
const VoiceClips = {
  bufs: {}, active: [], loading: false, failed: false,
  loadClips() {
    if (this.loading || !Sfx.ctx) return; this.loading = true;
    const src = window.RRR_VOICES;
    if (!src) { this.failed = true; reportProblem('voices', 'voices.js missing: bubbles will be silent'); return; }
    let bad = 0;
    for (const [line, url] of Object.entries(src)) {
      const bin = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      Sfx.ctx.decodeAudioData(bytes.buffer, b => { this.bufs[line] = b; }, e => { if (!bad++) reportProblem('voices', 'voice clip decode failed', e, line); });
    }
  },
  // where: () => ({ dz, x, vz }) for a speaker on the road, or null for your own driver (centre, no Doppler)
  playClip(line, { kind, rate = 1, where = null, owner = null }) {
    const a = Sfx.ctx, buf = this.bufs[line];
    if (!a || !buf || !Sfx.voiceBus || paused) return false;
    if (kind === 'hawker' && this.active.some(c => c.kind === 'hawker')) return true; // one hawker at a time
    for (const c of this.active) if (owner && c.owner === owner) { try { c.src.stop(); } catch (e) { /* ended */ } }
    const src = a.createBufferSource(); src.buffer = buf;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
    const g = a.createGain(); g.gain.value = 0;
    const pan = a.createStereoPanner ? a.createStereoPanner() : null;
    src.connect(lp); lp.connect(g);
    if (pan) { g.connect(pan); pan.connect(Sfx.voiceBus); } else g.connect(Sfx.voiceBus);
    const clip = { src, lp, g, pan, rate, where, owner, kind, base: kind === 'hawker' ? 0.85 : 1 };
    this.place(clip, true);
    src.start();
    this.active.push(clip);
    src.onended = () => { this.active = this.active.filter(c => c !== clip); };
    return true;
  },
  place(c, now) {
    const a = Sfx.ctx, t = a.currentTime, tc = now ? 0.001 : 0.06;
    let gain = c.base, pan = 0, rate = c.rate, cutoff = 9000;
    if (c.where) {
      const { dz, x, vz } = c.where();
      const near = clamp(1 - Math.abs(dz) / 4200, 0, 1);
      gain *= Math.pow(near, 1.4);
      cutoff = 900 + 8000 * near;                                   // far away sounds muffled
      pan = clamp((x - player.x) * 0.5, -0.9, 0.9);
      const closing = clamp((player.speed - vz) * Math.sign(dz || 1) / MAX_SPEED, -1, 1);
      rate *= 1 + 0.16 * closing;                                    // Doppler: up while closing in, down after passing
    }
    c.g.gain.setTargetAtTime(gain, t, tc);
    c.lp.frequency.setTargetAtTime(cutoff, t, tc);
    c.src.playbackRate.setTargetAtTime(rate, t, tc);
    if (c.pan) c.pan.pan.setTargetAtTime(pan, t, tc);
  },
  updateClips() { for (const c of this.active) this.place(c, false); },
  stopClips() { for (const c of this.active) { try { c.src.stop(); } catch (e) { /* ended */ } } this.active = []; },
};

// ------------------------------------------------------------------ voices
// Bubble lines are only ever heard as the recorded clips (VoiceClips); the game never uses the
// browser's text-to-speech. If a clip can't play, the bubble simply stays silent.
const Voice = {
  sayLine(line, { kind, where = null, owner = null, clipRate = 1 }) { VoiceClips.playClip(line, { kind, rate: clipRate, where, owner }); },
  stopVoices() { VoiceClips.stopClips(); },
};
addEventListener('visibilitychange', () => {
  if (document.hidden) { Voice.stopVoices(); return; }
  // coming back to the tab: pick audio up again if the phone had paused it
  const a = Sfx.ctx; if (a && a.state !== 'running') { const p = a.resume(); if (p && p.catch) p.catch(() => {}); }
});
