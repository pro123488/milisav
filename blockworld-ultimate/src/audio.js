// Audio 100 % procedural (WebAudio): sonidos de bloques por material, criaturas, interfaz y música ambiental generativa.
// No usa archivos ni muestras de terceros: todo es síntesis original.

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null; this.master = null; this.musicGain = null; this.noise = null;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.musicOn = false; this._musicTimer = 0; this.dayFactor = 1;
    this.enabled = true;
  }

  /** Debe llamarse tras un gesto del usuario (clic/tecla) para que el navegador permita audio. */
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      // retardo realimentado = "reverb" barato para la música
      this.delay = this.ctx.createDelay(1.0); this.delay.delayTime.value = 0.37;
      const fb = this.ctx.createGain(); fb.gain.value = 0.42;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      this.delay.connect(lp); lp.connect(fb); fb.connect(this.delay);
      this.musicGain.connect(this.master); this.delay.connect(this.master);
      // ruido blanco reutilizable
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.settings.masterVolume;
    this.musicGain.gain.value = this.settings.musicVolume * 0.5;
  }

  setListener(x, y, z, yaw) { this.listener.x = x; this.listener.y = y; this.listener.z = z; this.listener.yaw = yaw; }

  _spatial(x, y, z) {
    if (x === undefined) return { g: 1, pan: 0 };
    const dx = x - this.listener.x, dy = (y ?? 0) - this.listener.y, dz = z - this.listener.z;
    const d = Math.hypot(dx, dy, dz);
    const g = Math.max(0, 1 - d / 36); const gg = g * g;
    const yaw = this.listener.yaw;
    // vector derecho de la cámara: (cos yaw, 0, -sin yaw)
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const pan = d > 0.1 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0;
    return { g: gg, pan };
  }

  _out(node, sp) {
    let n = node;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = sp.pan * 0.8; n.connect(p); n = p; }
    n.connect(this.master);
  }

  /** Ráfaga de ruido filtrado con envolvente. */
  _noise({ dur = 0.1, type = 'bandpass', freq = 1000, q = 1, gain = 0.5, sweep = 0, attack = 0.002, rate = 1 }, sp) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true; src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * sp.g, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); this._out(g, sp);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  _tone({ dur = 0.15, type = 'sine', freq = 440, to = 0, gain = 0.3, attack = 0.005 }, sp) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * sp.g, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); this._out(g, sp); o.start(t); o.stop(t + dur + 0.05);
  }

  /** Sonido de material. kind: dig | break | place | step */
  blockSound(kind, material, x, y, z) {
    if (!this.ctx || !this.enabled) return;
    const sp = this._spatial(x, y, z);
    const vol = { dig: 0.22, break: 0.5, place: 0.38, step: 0.16 }[kind] ?? 0.3;
    const pitch = 0.85 + Math.random() * 0.3;
    const low = kind === 'break' ? 0.8 : 1;
    switch (material) {
      case 'stone': this._noise({ dur: 0.09 + (kind === 'break' ? 0.08 : 0), freq: 1500 * pitch * low, q: 0.9, gain: vol, type: 'bandpass' }, sp); this._tone({ dur: 0.06, type: 'square', freq: 120 * pitch, to: 70, gain: vol * 0.25 }, sp); break;
      case 'dirt': this._noise({ dur: 0.1, type: 'lowpass', freq: 650 * pitch, q: 0.7, gain: vol * 1.3 }, sp); break;
      case 'grass': case 'plant': this._noise({ dur: 0.09, type: 'bandpass', freq: 2600 * pitch, q: 0.6, gain: vol * 0.8 }, sp); break;
      case 'leaf': this._noise({ dur: 0.07, type: 'highpass', freq: 3000 * pitch, q: 0.5, gain: vol * 0.7 }, sp); break;
      case 'sand': this._noise({ dur: 0.14, type: 'bandpass', freq: 1900 * pitch, q: 0.4, gain: vol * 0.9 }, sp); break;
      case 'gravel': this._noise({ dur: 0.12, type: 'bandpass', freq: 1100 * pitch, q: 0.5, gain: vol * 1.1 }, sp); this._noise({ dur: 0.05, type: 'highpass', freq: 3500, gain: vol * 0.4, attack: 0.03 }, sp); break;
      case 'wood': this._tone({ dur: 0.1, type: 'triangle', freq: 190 * pitch, to: 110, gain: vol * 0.9 }, sp); this._noise({ dur: 0.06, type: 'bandpass', freq: 900, q: 1.5, gain: vol * 0.5 }, sp); break;
      case 'glass': this._tone({ dur: 0.22, type: 'sine', freq: 2400 * pitch, to: 1800, gain: vol * 0.5 }, sp); this._tone({ dur: 0.18, type: 'sine', freq: 3600 * pitch, gain: vol * 0.3 }, sp); this._noise({ dur: 0.06, type: 'highpass', freq: 5000, gain: vol * 0.5 }, sp); break;
      case 'metal': this._tone({ dur: 0.25, type: 'square', freq: 520 * pitch, to: 480, gain: vol * 0.3 }, sp); this._noise({ dur: 0.05, type: 'highpass', freq: 4000, gain: vol * 0.4 }, sp); break;
      case 'snow': this._noise({ dur: 0.12, type: 'bandpass', freq: 3200 * pitch, q: 0.4, gain: vol * 0.6 }, sp); break;
      case 'water': this._noise({ dur: 0.25, type: 'lowpass', freq: 900 * pitch, sweep: 0.4, q: 0.8, gain: vol * 1.2 }, sp); break;
      default: this._noise({ dur: 0.08, type: 'bandpass', freq: 1200 * pitch, gain: vol }, sp);
    }
  }

  /** Efectos nombrados. */
  play(name, x, y, z) {
    if (!this.ctx || !this.enabled) return;
    const sp = this._spatial(x, y, z);
    const p = 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'hit': this._noise({ dur: 0.1, type: 'bandpass', freq: 500, q: 1, gain: 0.6 }, sp); this._tone({ dur: 0.1, type: 'square', freq: 160, to: 80, gain: 0.25 }, sp); break;
      case 'hurt': this._tone({ dur: 0.22, type: 'sawtooth', freq: 280 * p, to: 140, gain: 0.35 }, sp); this._noise({ dur: 0.12, type: 'bandpass', freq: 700, gain: 0.35 }, sp); break;
      case 'die': this._tone({ dur: 0.5, type: 'sawtooth', freq: 220 * p, to: 55, gain: 0.35 }, sp); break;
      case 'pickup': this._tone({ dur: 0.1, type: 'sine', freq: 700 * p, to: 1300, gain: 0.22 }, sp); break;
      case 'eat': this._noise({ dur: 0.07, type: 'bandpass', freq: 1800 * p, q: 1.2, gain: 0.5 }, sp); break;
      case 'burp': this._tone({ dur: 0.3, type: 'sawtooth', freq: 110, to: 70, gain: 0.25 }, sp); break;
      case 'splash': this._noise({ dur: 0.3, type: 'lowpass', freq: 1400, sweep: 0.3, gain: 0.6 }, sp); break;
      case 'toolbreak': this._noise({ dur: 0.15, type: 'highpass', freq: 2500, gain: 0.5 }, sp); this._tone({ dur: 0.18, type: 'square', freq: 300, to: 100, gain: 0.25 }, sp); break;
      case 'click': this._tone({ dur: 0.04, type: 'square', freq: 900, gain: 0.08 }, { g: 1, pan: 0 }); break;
      case 'open': this._tone({ dur: 0.12, type: 'triangle', freq: 300, to: 480, gain: 0.2 }, { g: 1, pan: 0 }); break;
      case 'craft': this._tone({ dur: 0.1, type: 'triangle', freq: 520, to: 780, gain: 0.2 }, { g: 1, pan: 0 }); this._tone({ dur: 0.12, type: 'triangle', freq: 780, to: 1040, gain: 0.15, attack: 0.05 }, { g: 1, pan: 0 }); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone({ dur: 0.2, type: 'triangle', freq: f, gain: 0.2 }, { g: 1, pan: 0 }), i * 90)); break;
      case 'fall': this._noise({ dur: 0.18, type: 'lowpass', freq: 400, gain: 0.7 }, sp); break;
      case 'door': this._tone({ dur: 0.16, type: 'triangle', freq: 150 * p, to: 95, gain: 0.35 }, sp); this._noise({ dur: 0.1, type: 'bandpass', freq: 700 * p, q: 2, gain: 0.3 }, sp); break;
      case 'door_metal': this._tone({ dur: 0.3, type: 'square', freq: 210 * p, to: 160, gain: 0.18 }, sp); this._noise({ dur: 0.12, type: 'bandpass', freq: 2600, q: 3, gain: 0.25 }, sp); break;
      case 'fizz': this._noise({ dur: 0.45, type: 'highpass', freq: 2200, sweep: 0.5, gain: 0.35 }, sp); break;
      case 'bell': [0, 0.45, 0.9].forEach((t) => setTimeout(() => { this._tone({ dur: 1.1, type: 'sine', freq: 660 * p, to: 652, gain: 0.3 }, sp); this._tone({ dur: 0.9, type: 'sine', freq: 1650 * p, gain: 0.12 }, sp); }, t * 1000)); break;
      case 'leash': this._noise({ dur: 0.08, type: 'bandpass', freq: 1500 * p, q: 1.5, gain: 0.35 }, sp); break;
      case 'deny': this._tone({ dur: 0.12, type: 'square', freq: 180, to: 140, gain: 0.12 }, { g: 1, pan: 0 }); break;
      // criaturas
      case 'moo': this._tone({ dur: 0.7, type: 'sawtooth', freq: 130 * p, to: 95, gain: 0.3 }, sp); this._tone({ dur: 0.7, type: 'triangle', freq: 195 * p, to: 140, gain: 0.15 }, sp); break;
      case 'oink': this._tone({ dur: 0.18, type: 'square', freq: 260 * p, to: 200, gain: 0.2 }, sp); this._noise({ dur: 0.12, type: 'bandpass', freq: 900, gain: 0.25 }, sp); break;
      case 'chirp': this._tone({ dur: 0.1, type: 'sine', freq: 2200 * p, to: 3000, gain: 0.15 }, sp); setTimeout(() => this._tone({ dur: 0.1, type: 'sine', freq: 2600 * p, to: 2000, gain: 0.12 }, sp), 120); break;
      case 'yip': this._tone({ dur: 0.12, type: 'triangle', freq: 900 * p, to: 1400, gain: 0.2 }, sp); break;
      case 'growl': this._tone({ dur: 0.5, type: 'sawtooth', freq: 70 * p, to: 50, gain: 0.35 }, sp); this._noise({ dur: 0.45, type: 'lowpass', freq: 300, gain: 0.3 }, sp); break;
      case 'rattle': this._noise({ dur: 0.12, type: 'bandpass', freq: 3000, q: 4, gain: 0.35 }, sp); setTimeout(() => this._noise({ dur: 0.1, type: 'bandpass', freq: 3400, q: 4, gain: 0.3 }, sp), 90); break;
      case 'screech': this._tone({ dur: 0.18, type: 'sawtooth', freq: 3200 * p, to: 4200, gain: 0.12 }, sp); break;
      case 'rumble': this._tone({ dur: 0.6, type: 'sawtooth', freq: 55, to: 38, gain: 0.4 }, sp); this._noise({ dur: 0.5, type: 'lowpass', freq: 220, gain: 0.4 }, sp); break;
      case 'shoot': this._noise({ dur: 0.1, type: 'bandpass', freq: 2200, sweep: 0.4, gain: 0.3 }, sp); break;
      default: break;
    }
  }

  // ── Música generativa ──
  startMusic() { this.musicOn = true; this._musicTimer = 4; }
  stopMusic() { this.musicOn = false; }
  /** Llamar cada fotograma con dt para programar frases. */
  update(dt, dayFactor) {
    this.dayFactor = dayFactor;
    if (!this.ctx || !this.musicOn || this.settings.musicVolume <= 0) return;
    this._musicTimer -= dt;
    if (this._musicTimer > 0) return;
    this._musicTimer = 14 + Math.random() * 26;
    this._phrase();
  }
  _phrase() {
    const ctx = this.ctx, day = this.dayFactor > 0.4;
    // escalas: día pentatónica mayor, noche pentatónica menor/frigia
    const root = [196, 220, 174.6, 233][Math.floor(Math.random() * 4)];
    const ratios = day ? [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2] : [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5, 2];
    const n = 4 + Math.floor(Math.random() * 5);
    let t = ctx.currentTime + 0.1;
    let idx = Math.floor(Math.random() * ratios.length);
    for (let i = 0; i < n; i++) {
      idx = Math.max(0, Math.min(ratios.length - 1, idx + Math.floor(Math.random() * 5) - 2));
      const f = root * ratios[idx] * (Math.random() < 0.2 ? 2 : 1);
      const o = ctx.createOscillator(); o.type = day ? 'sine' : 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); const d = 1.4 + Math.random() * 1.6;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(this.musicGain); g.connect(this.delay);
      o.start(t); o.stop(t + d + 0.1);
      t += 0.5 + Math.random() * 1.1;
    }
    // base suave
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = root / 2;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0, ctx.currentTime); g2.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 2); g2.gain.linearRampToValueAtTime(0, ctx.currentTime + 7);
    o2.connect(g2); g2.connect(this.musicGain); o2.start(); o2.stop(ctx.currentTime + 7.5);
  }
}
