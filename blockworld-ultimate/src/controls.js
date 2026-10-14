// Entrada: teclado, ratón (pointer lock), rueda y atajos. Mantiene el estado de las teclas y emite eventos de alto nivel.

export const DEFAULT_KEYS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC'], inventory: ['KeyE'], drop: ['KeyQ'],
  camera: ['KeyV'], debug: ['F3'], chat: ['KeyT', 'Slash'], hideHud: ['F1'],
};

export class Controls {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = [false, false, false];
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.sensitivity = 1; this.invertY = false;
    this.locked = false;
    this.enabled = false;       // solo procesa entrada de juego cuando está activo
    this.bindings = DEFAULT_KEYS;
    // callbacks
    this.onKeyDown = null;      // (code, event) — para atajos (E, Esc, F3, números...)
    this.onLockChange = null;   // (locked)
    this.onMouseDown = null;    // (button)
    this.onWheel = null;

    document.addEventListener('keydown', (e) => this._keydown(e));
    document.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse = [false, false, false]; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouse[e.button] = true;
      if (this.onMouseDown) this.onMouseDown(e.button);
      e.preventDefault();
    });
    document.addEventListener('mouseup', (e) => { this.mouse[e.button] = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Algunos navegadores envían un salto enorme justo al capturar el ratón: se descarta.
      if (this._skipMove > 0) { this._skipMove--; return; }
      const mx = e.movementX || 0, my = e.movementY || 0;
      if (Math.abs(mx) > 350 || Math.abs(my) > 350) return;
      this.mouseDX += mx; this.mouseDY += my;
    });
    document.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.wheel += Math.sign(e.deltaY);
      if (this.onWheel) this.onWheel(Math.sign(e.deltaY));
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this._skipMove = this.locked ? 1 : 0;
      if (!this.locked) { this.mouse = [false, false, false]; this.keys.clear(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { if (this.onLockChange) this.onLockChange(false, true); });
  }

  _keydown(e) {
    if (e.repeat) {
      if (this.locked && ['Space', 'Tab'].includes(e.code)) e.preventDefault();
      return;
    }
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; // formularios / chat
    if (this.locked || this.enabled) {
      if (['Space', 'Tab', 'F1', 'F3', 'F5', 'Slash', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.ctrlKey && ['KeyW', 'KeyS', 'KeyD', 'KeyA'].includes(e.code)) e.preventDefault();
    }
    this.keys.add(e.code);
    if (this.onKeyDown) this.onKeyDown(e.code, e);
  }

  isDown(action) { return this.bindings[action].some((c) => this.keys.has(c)); }

  /** Movimiento para el jugador. */
  getMove() {
    const k = (a) => (this.isDown(a) ? 1 : 0);
    return {
      fwd: k('forward') - k('back'), strafe: k('right') - k('left'),
      jump: this.isDown('jump'), sprint: this.isDown('sprint'), crouch: this.isDown('crouch'), crouchDown: this.isDown('crouch'),
    };
  }

  consumeLook() {
    const r = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0; this.mouseDY = 0;
    return r;
  }
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }

  lock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const q = this.canvas.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) { /* sin bloqueo */ } });
    } catch (e) {
      try { this.canvas.requestPointerLock(); } catch (e2) { /* sin bloqueo */ }
    }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
}
