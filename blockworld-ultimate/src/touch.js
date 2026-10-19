// Controles táctiles para teléfonos y tabletas. Emula el "bloqueo del puntero" de Controls y alimenta los mismos
// estados (teclas, giro de cámara, botones del ratón), así que el resto del juego no distingue ratón de dedo:
//   · mitad izquierda: joystick flotante (al borde = correr);
//   · resto de la pantalla: arrastrar = mirar; tocar = usar/colocar; mantener quieto = romper/atacar;
//   · botones: saltar (doble toque = volar en Creativo), agacharse (toque = fijo, mantener = mientras dure; también baja
//     de los vehículos), romper (mantener), usar (mantener: comer, beber, colocar seguido);
//   · fila superior: pausa, inventario, bestiario, cámara, soltar, chat; botón ✕ para cerrar pantallas.

const LOOK_RAD_PER_PX = 0.0045; // giro por píxel arrastrado (× sensibilidad táctil)
const TAP_MS = 260, HOLD_MS = 300, MOVE_TOL = 12;
const STICK_R = 56;
const MIN_PRESS = 120;

/** ¿El dispositivo se maneja con el dedo (teléfono, tableta)? */
export function isTouchDevice() {
  try {
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches) return true;
    return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && typeof matchMedia === 'function' && !matchMedia('(any-pointer: fine)').matches;
  } catch (e) { return false; }
}

/** Controles táctiles activos según la opción (auto/on/off) y ?touch=1|0 en la URL. */
export function touchWanted(settings) {
  try {
    const q = new URLSearchParams(location.search).get('touch');
    if (q === '1') return true;
    if (q === '0') return false;
  } catch (e) { /* sin URL */ }
  const s = settings.touchControls || 'auto';
  return s === 'on' || (s === 'auto' && isTouchDevice());
}

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export class TouchControls {
  constructor(game) {
    this.game = game; this.ctl = game.controls;
    this.active = false;
    this.stick = null;   // {id, cx, cy}
    this.look = null;    // {id, x, y, t0, moved, holding, timer}
    this.crouchLatched = false;
    this._portraitHint = false;
    this._build();
    this.ctl.onTouchRelease = () => this.reset();
  }

  // ── Interfaz ──
  _build() {
    const root = this.root = mk('div', 'hidden'); root.id = 'touch-ui';
    // capa de juego: joystick (izquierda) y mirar/tocar (resto)
    const layer = this.layer = mk('div', 't-layer');
    this.stickBase = mk('div', 't-stick idle'); this.stickKnob = mk('div', 't-knob'); this.stickBase.append(this.stickKnob);
    layer.append(this.stickBase);
    layer.addEventListener('pointerdown', (e) => this._down(e));
    layer.addEventListener('pointermove', (e) => this._move(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) layer.addEventListener(ev, (e) => this._up(e));
    root.append(layer);
    // botones de acción
    const ctl = this.ctl;
    const hold = (cls, label, title, onDown, onUp) => {
      const b = mk('div', 't-btn ' + cls, label); b.title = title;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch (er) { /* sin captura */ } b.classList.add('on'); onDown(e); });
      const up = (e) => { if (!b.classList.contains('on')) return; b.classList.remove('on'); onUp(e); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      root.append(b); return b;
    };
    // una tecla virtual se mantiene al menos MIN_PRESS ms: un toque muy rápido (o un teléfono a pocos FPS) no se pierde
    // (una pulsación nueva cancela la suelta pendiente de la anterior)
    this._rel = {};
    const press = (code) => { clearTimeout(this._rel[code]); ctl.keys.add(code); };
    const release = (code, t0) => {
      const left = MIN_PRESS - (performance.now() - t0);
      clearTimeout(this._rel[code]);
      if (left > 0) this._rel[code] = setTimeout(() => ctl.keys.delete(code), left); else ctl.keys.delete(code);
    };
    hold('t-jump', '⤒', 'Saltar', () => { this._jumpT0 = performance.now(); press('Space'); }, () => release('Space', this._jumpT0));
    this.crouchBtn = hold('t-crouch', '⤓', 'Agacharse / bajar del vehículo', () => {
      this._crouchT0 = performance.now(); this._crouchWas = this.crouchLatched; this._crouchRide = !!this.game.riding;
      if (this._crouchRide) { this.game.dismount(); return; } // bajar del vehículo al instante (no se queda agachado)
      press('KeyC');
    }, () => {
      if (this._crouchRide) return;
      const quick = performance.now() - this._crouchT0 < 250;
      // toque corto: queda fijo (o se suelta si ya lo estaba)
      this.crouchLatched = quick && !this._crouchWas;
      if (!this.crouchLatched) release('KeyC', this._crouchT0);
      this.crouchBtn.classList.toggle('latched', this.crouchLatched);
    });
    hold('t-mine', '⛏', 'Romper / atacar (mantener)', () => { this._mineBtn = true; this._syncMine(); ctl.onMouseDown && ctl.onMouseDown(0); }, () => { this._mineBtn = false; this._syncMine(); });
    hold('t-use', '✋', 'Usar / colocar (mantener para comer o colocar seguido)', () => { ctl.mouse[2] = true; ctl.onMouseDown && ctl.onMouseDown(2); }, () => { ctl.mouse[2] = false; });
    // fila superior
    const top = mk('div', 't-top');
    const g = this.game;
    const small = (label, title, fn) => {
      const b = mk('div', 't-btn t-small', label); b.title = title;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (g.state === 'playing' && !g._traveling) fn(); });
      top.append(b); return b;
    };
    const key = (code, extra = {}) => g.onKey(code, { shiftKey: false, preventDefault() {}, ...extra });
    small('⏸', 'Pausa', () => g.openPause());
    small('🎒', 'Inventario', () => key('KeyE'));
    small('📖', 'Bestiario', () => key('KeyB'));
    small('👁', 'Cámara 1ª / 3ª persona', () => key('KeyV'));
    small('⇩', 'Soltar objeto', () => key('KeyQ'));
    small('💬', 'Chat y comandos', () => key('KeyT'));
    root.append(top);
    document.body.append(root);
    // ✕ para cerrar pantallas que con teclado se cierran con E o Esc (inventario, cofres, comercio…) y el chat
    const close = this.closeBtn = mk('div', 't-close hidden', '✕'); close.title = 'Cerrar';
    close.addEventListener('click', (e) => {
      e.preventDefault();
      if (g.ui.chatOpen) { g.ui.closeChat(); g.afterChat(); return; }
      if (g.state === 'screen' && g.ui.screen) g.closeScreen();
    });
    document.body.append(close);
    // barra rápida: tocar una ranura la selecciona
    g.ui.hotbarEl.addEventListener('pointerdown', (e) => {
      if (!this.active || g.state !== 'playing') return;
      const s = e.target.closest && e.target.closest('.slot.hot');
      if (!s) return;
      e.preventDefault(); e.stopPropagation();
      g.inventory.selected = parseInt(s.dataset.i, 10) || 0;
    });
  }

  /** Activa o desactiva los controles táctiles (opción "Controles táctiles"). */
  setActive(on) {
    on = !!on;
    if (on === this.active) return;
    if (!on && this.ctl.locked && this.ctl.touchMode) this.ctl.unlock();
    this.active = on;
    this.ctl.touchMode = on;
    document.body.classList.toggle('touch', on);
    this.reset();
    this.update();
  }

  /** Romper: el botón ⛏ y mantener el dedo quieto son dos fuentes; soltar una no corta la otra. */
  _syncMine() { this.ctl.mouse[0] = !!this._mineBtn || !!(this.look && this.look.holding); }
  /** Quita el agachado fijo (al subir a un vehículo). */
  unlatchCrouch() {
    if (!this.crouchLatched) return;
    this.crouchLatched = false; this.ctl.keys.delete('KeyC');
    if (this.crouchBtn) this.crouchBtn.classList.remove('latched');
  }

  /** Suelta todo (al pausar, abrir una pantalla o perder el foco). */
  reset() {
    const ctl = this.ctl;
    this._mineBtn = false;
    for (const k in this._rel || {}) clearTimeout(this._rel[k]);
    this.stick = null; ctl.stick = null;
    if (this.look && this.look.timer) clearTimeout(this.look.timer);
    this.look = null;
    this.crouchLatched = false;
    if (this.crouchBtn) this.crouchBtn.classList.remove('latched');
    for (const b of this.root.querySelectorAll('.t-btn.on')) b.classList.remove('on');
    this._stickVisual(null);
  }

  /** Muestra la capa táctil solo mientras se juega; el ✕ mientras hay una pantalla o el chat abiertos. */
  update() {
    const g = this.game;
    const playing = this.active && g.state === 'playing' && this.ctl.locked && !g.ui.chatOpen;
    this.root.classList.toggle('hidden', !playing);
    const closable = this.active && ((g.state === 'screen' && !!g.ui.screen) || g.ui.chatOpen);
    this.closeBtn.classList.toggle('hidden', !closable);
    if (playing && !this._portraitHint && innerHeight > innerWidth * 1.15) {
      this._portraitHint = true;
      g.ui.toast('📱 Gira el teléfono: se juega mejor en horizontal', 4000);
    }
  }

  /** Al "capturar el puntero" en modo táctil: pantalla completa y horizontal si el navegador lo permite. */
  enterPlay() {
    try {
      const d = document.documentElement;
      if (!document.fullscreenElement && d.requestFullscreen && this.game.settings.touchFullscreen !== false) {
        const p = d.requestFullscreen({ navigationUI: 'hide' });
        if (p && p.then) p.then(() => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* sin bloqueo */ } }).catch(() => {});
      }
    } catch (e) { /* sin pantalla completa (iPhone) */ }
  }

  // ── Gestos de la capa de juego ──
  _down(e) {
    if (!this.ctl.locked) return;
    e.preventDefault();
    const w = innerWidth, h = innerHeight;
    try { this.layer.setPointerCapture(e.pointerId); } catch (er) { /* sin captura */ }
    if (!this.stick && e.clientX < w * 0.4 && e.clientY > h * 0.25) {
      this.stick = { id: e.pointerId, cx: e.clientX, cy: e.clientY };
      this.ctl.stick = { x: 0, y: 0, mag: 0 };
      this._stickVisual(this.stick);
      return;
    }
    if (this.look) return; // un solo dedo mira
    const lk = this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, holding: false, timer: 0 };
    lk.timer = setTimeout(() => {
      // mantener quieto: romper / atacar mientras dure
      if (this.look !== lk || lk.moved) return;
      lk.holding = true; this._syncMine(); this.ctl.onMouseDown && this.ctl.onMouseDown(0);
    }, HOLD_MS);
  }
  _move(e) {
    const ctl = this.ctl;
    if (this.stick && e.pointerId === this.stick.id) {
      let dx = e.clientX - this.stick.cx, dy = e.clientY - this.stick.cy;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
      const mag = Math.min(1, d / STICK_R);
      ctl.stick = { x: dx / STICK_R, y: dy / STICK_R, mag };
      this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.stickBase.classList.toggle('run', mag > 0.92);
      return;
    }
    const lk = this.look;
    if (lk && e.pointerId === lk.id) {
      const dx = e.clientX - lk.x, dy = e.clientY - lk.y;
      lk.x = e.clientX; lk.y = e.clientY;
      if (!lk.moved && Math.hypot(e.clientX - lk.x0, e.clientY - lk.y0) > MOVE_TOL) lk.moved = true;
      if (lk.moved || lk.holding) {
        const k = LOOK_RAD_PER_PX * (this.game.settings.touchSensitivity || 1);
        ctl.touchLookX += dx * k; ctl.touchLookY += dy * k;
      }
    }
  }
  _up(e) {
    const ctl = this.ctl;
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null; ctl.stick = null; this._stickVisual(null);
      return;
    }
    const lk = this.look;
    if (lk && e.pointerId === lk.id) {
      clearTimeout(lk.timer);
      this.look = null;
      if (lk.holding) { this._syncMine(); return; }
      // toque corto sin arrastrar: usar / colocar donde apunta la mira
      if (e.type === 'pointerup' && !lk.moved && performance.now() - lk.t0 < TAP_MS + HOLD_MS && ctl.locked && ctl.onMouseDown) ctl.onMouseDown(2);
    }
  }
  _stickVisual(st) {
    const b = this.stickBase;
    if (!b) return;
    b.classList.toggle('idle', !st); b.classList.remove('run');
    this.stickKnob.style.transform = '';
    if (st) { b.style.left = st.cx + 'px'; b.style.top = st.cy + 'px'; b.style.bottom = ''; }
    else { b.style.left = ''; b.style.top = ''; }
  }
}
