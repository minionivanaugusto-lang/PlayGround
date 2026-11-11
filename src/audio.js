// Tiny procedural soundscape: soft wind, birds and warm pickup chimes.

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.windGain = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem('colonia-aurora-muted') === '1';
    } catch {
      this.muted = false;
    }
    this.birdTimer = null;
  }

  get ready() {
    return !!this.ctx;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.42;
      this.master.connect(this.ctx.destination);
      this.startWind();
      this.scheduleBird();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    try {
      localStorage.setItem('colonia-aurora-muted', muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.42, this.ctx.currentTime, 0.08);
    }
  }

  startWind() {
    const ctx = this.ctx;
    const seconds = 5;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.4;
    const gain = ctx.createGain();
    gain.gain.value = 0.055;
    this.windGain = gain;

    // Slow breathing of the breeze.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.075;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.022;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();

    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  scheduleBird() {
    if (this.birdTimer) clearTimeout(this.birdTimer);
    this.birdTimer = setTimeout(() => {
      if (this.ctx && !this.muted) this.bird();
      this.scheduleBird();
    }, 7000 + Math.random() * 9000);
  }

  bird() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.05;
    const base = 1600 + Math.random() * 1200;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const t = now + i * (0.12 + Math.random() * 0.08);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * (1 + i * 0.07), t);
      osc.frequency.exponentialRampToValueAtTime(base * (1.25 + i * 0.1), t + 0.09);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.022, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  tone(freq, duration, type = 'sine', volume = 0.08, when = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  pickup(kind) {
    const base = { leaf: 520, seed: 610, berry: 690, pebble: 420, twig: 470 }[kind] || 560;
    this.tone(base, 0.16, 'triangle', 0.06);
    this.tone(base * 1.5, 0.12, 'sine', 0.035, 0.045);
  }

  deposit() {
    this.tone(392, 0.18, 'sine', 0.06);
    this.tone(523.25, 0.24, 'sine', 0.055, 0.07);
    this.tone(659.25, 0.3, 'sine', 0.04, 0.14);
  }

  objective() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f, 0.5, 'triangle', 0.055, i * 0.11);
    });
  }

  complete() {
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this.tone(f, 0.8, 'sine', 0.05, i * 0.12);
    });
  }
}
