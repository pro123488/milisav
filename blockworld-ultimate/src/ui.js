// Interfaz de juego: HUD (corazones, hambre, aire, armadura, barra rápida), avisos, depuración, chat y utilidades de DOM.
import { Items, maxDurability } from './items.js';
import { getItemIconURL } from './atlas.js';
import { HOTBAR_SIZE } from './inventory.js';
import { biomeName } from './biomes.js';
import { clockString, phaseName } from './sky.js';
import { GAMEMODE_NAMES } from './config.js';
import { EFFECTS, ROMAN } from './effects.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export function el(tag, cls, attrs, ...children) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}

// ── Iconos de píxeles del HUD (generados por código) ──────────────
const HUD_PX = {
  heart: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
  food: ['..XXXX..', '.XXXXXX.', '.XXXXXX.', '..XXXX..', '...XX...', '..XXXX..', '..X..X..'],
  armor: ['XX..XX', 'XXXXXX', 'XXXXXX', 'XXXXXX', '.XXXX.', '..XX..'],
  bubble: ['..XXX..', '.X...X.', 'X.....X', 'X.....X', 'X.....X', '.X...X.', '..XXX..'],
};
const iconCache = {};
function pixelIcon(name, fill, stroke, scale = 2) {
  const key = name + fill + stroke + scale;
  if (iconCache[key]) return iconCache[key];
  const rows = HUD_PX[name];
  const w = rows[0].length, h = rows.length;
  const c = document.createElement('canvas'); c.width = (w + 2) * scale; c.height = (h + 2) * scale;
  const g = c.getContext('2d');
  const set = (x, y, col) => { g.fillStyle = col; g.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale); };
  rows.forEach((r, y) => { for (let x = 0; x < w; x++) if (r[x] === 'X') { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h || rows[ny][nx] !== 'X') set(x, y, stroke); } } });
  rows.forEach((r, y) => { for (let x = 0; x < w; x++) if (r[x] === 'X') set(x, y, fill); });
  // brillo
  set(1, 1, 'rgba(255,255,255,0.55)');
  const url = c.toDataURL();
  iconCache[key] = url;
  return url;
}
const HEART_FULL = () => pixelIcon('heart', '#e6323c', '#4a0a12', 3);
const HEART_EMPTY = () => pixelIcon('heart', '#2a1a1e', '#4a0a12', 3);
const HEART_HALF = () => {
  // medio corazón: mitad izquierda roja, derecha vacía
  const key = 'hearthalf';
  if (iconCache[key]) return iconCache[key];
  const a = new Image(), b = new Image();
  a.src = HEART_FULL(); b.src = HEART_EMPTY();
  const c = document.createElement('canvas'); c.width = 27; c.height = 27;
  const g = c.getContext('2d');
  const draw = () => { g.clearRect(0, 0, 27, 27); g.drawImage(b, 0, 0); g.save(); g.beginPath(); g.rect(0, 0, 14, 27); g.clip(); g.drawImage(a, 0, 0); g.restore(); };
  if (a.complete && b.complete) draw(); else { let n = 0; const done = () => { if (++n === 2) draw(); }; a.onload = done; b.onload = done; }
  iconCache[key] = c.toDataURL();
  return iconCache[key];
};

export class UI {
  constructor(game) {
    this.game = game;
    this.hud = $('#hud'); this.hotbarEl = $('#hotbar'); this.heartsEl = $('#hearts'); this.hungerEl = $('#hunger');
    this.armorEl = $('#armor-row'); this.bubblesEl = $('#bubbles-row'); this.toastsEl = $('#toasts');
    this.topLeft = $('#hud-top-left'); this.topRight = $('#hud-top-right'); this.centerMsg = $('#hud-center-msg');
    this.dmgFlash = $('#dmg-flash'); this.waterTint = $('#water-tint'); this.chatLogEl = $('#chat-log'); this.chatInput = $('#chat-input');
    this.eatBar = $('#eat-progress');
    this.screenRoot = $('#screen-root'); this.menuRoot = $('#menu-root');
    this.screen = null;                 // pantalla abierta ({close(), ...})
    this.debug = false; this.hudHidden = false;
    this._sig = {};
    this._flash = 0; this._itemNameTimer = 0; this._lastSel = -1;
    this.chatLines = [];
    this._buildHotbar();
    this.tooltip = el('div', 'tooltip hidden'); document.body.append(this.tooltip);
    this.compassEl = el('div', 'hud-compass hidden'); this.hud.append(this.compassEl);
    this.effectsEl = el('div', 'effects-hud'); this.hud.append(this.effectsEl);
    // Barra de vida de jefe
    this.bossEl = el('div', 'boss-bar hidden', null, el('div', 'boss-name'), el('div', 'boss-track', null, el('div', 'boss-fill')), el('div', 'boss-phase'));
    this.hud.append(this.bossEl);
  }
  /** Barra de vida del jefe (null = ocultar). */
  setBoss(info) {
    if (!info) { this.bossEl.classList.add('hidden'); return; }
    this.bossEl.classList.remove('hidden');
    this.bossEl.children[0].textContent = info.name;
    this.bossEl.children[1].firstChild.style.width = Math.max(0, Math.min(100, info.frac * 100)).toFixed(1) + '%';
    this.bossEl.children[2].textContent = info.phase || '';
  }
  /** Texto de la brújula de aldeas (null = ocultar). */
  setCompass(text) {
    if (!text) { this.compassEl.classList.add('hidden'); return; }
    if (this.compassEl.textContent !== text) this.compassEl.textContent = text;
    this.compassEl.classList.remove('hidden');
  }

  // ── Utilidades ──
  showHud(show) { this.hud.classList.toggle('hidden', !show); }
  toast(msg, ms = 3000) {
    const t = el('div', 'toast', { text: msg });
    this.toastsEl.append(t);
    while (this.toastsEl.children.length > 5) this.toastsEl.firstChild.remove();
    setTimeout(() => { t.classList.add('fade'); setTimeout(() => t.remove(), 600); }, ms);
  }
  damageFlash() { this._flash = 1; }
  showLoading(show, title, frac, hint) {
    const L = $('#loading');
    L.classList.toggle('hidden', !show);
    if (!show) return;
    if (title) $('.load-title', L).textContent = title;
    $('.load-bar > div', L).style.width = Math.round((frac ?? 0) * 100) + '%';
    if (hint !== undefined) $('.load-hint', L).textContent = hint;
  }
  showFatal(msg) { const f = $('#fatal'); f.classList.remove('hidden'); f.innerHTML = msg; }
  centerMessage(msg, ms = 2500) { this.centerMsg.textContent = msg; this.centerMsg.classList.add('show'); clearTimeout(this._cm); this._cm = setTimeout(() => this.centerMsg.classList.remove('show'), ms); }

  // ── Barra rápida ──
  _buildHotbar() {
    this.hotbarEl.innerHTML = '';
    this.hotSlots = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const s = el('div', 'slot hot', { 'data-i': i });
      s.append(el('img', 'icon'), el('span', 'count'), el('div', 'dur', null, el('div')), el('span', 'keynum', { text: i + 1 }));
      this.hotbarEl.append(s); this.hotSlots.push(s);
    }
    this.itemName = el('div', 'item-name'); this.hotbarEl.parentElement.insertBefore(this.itemName, this.hotbarEl);
  }

  /** Dibuja el contenido de un hueco (usado por la barra rápida y por las pantallas). */
  static paintSlot(div, stack) {
    const img = $('img.icon', div), cnt = $('.count', div), dur = $('.dur', div);
    if (!stack) { img.removeAttribute('src'); img.style.visibility = 'hidden'; cnt.textContent = ''; if (dur) dur.style.display = 'none'; return; }
    const it = Items.get(stack.i);
    img.src = getItemIconURL(it); img.style.visibility = 'visible';
    cnt.textContent = stack.n > 1 ? stack.n : '';
    const max = maxDurability(it);
    if (dur) {
      if (max && stack.d > 0) {
        dur.style.display = 'block';
        const f = 1 - stack.d / max;
        const bar = dur.firstChild; bar.style.width = Math.round(f * 100) + '%';
        bar.style.background = f > 0.5 ? '#5ad85a' : f > 0.2 ? '#e6c83c' : '#e24a3c';
      } else dur.style.display = 'none';
    }
  }

  // ── Actualización por fotograma ──
  update(dt) {
    const g = this.game, inv = g.inventory, sv = g.survival;
    if (!g.world || !inv) return;
    // Barra rápida
    const sig = inv.slots.slice(0, 9).map((s) => (s ? `${s.i}:${s.n}:${s.d || 0}` : '-')).join('|') + '#' + inv.selected;
    if (sig !== this._sig.hot) {
      this._sig.hot = sig;
      this.hotSlots.forEach((d, i) => { UI.paintSlot(d, inv.slots[i]); d.classList.toggle('sel', i === inv.selected); });
    }
    if (inv.selected !== this._lastSel) {
      this._lastSel = inv.selected;
      const s = inv.slots[inv.selected];
      this.itemName.textContent = s ? Items.get(s.i).name : '';
      this._itemNameTimer = 2;
    }
    if (this._itemNameTimer > 0) { this._itemNameTimer -= dt; this.itemName.style.opacity = Math.min(1, this._itemNameTimer * 2); }
    // Salud / hambre / armadura / aire
    const creative = g.mode === 'creative';
    $('#stats-row').style.visibility = creative ? 'hidden' : 'visible';
    const hs = `${Math.ceil(sv.health)}|${sv.maxHealth}|${sv.hunger | 0}|${sv.invuln > 0 ? 1 : 0}|${inv.armorDefense()}|${Math.ceil(sv.air)}|${g.player.headInWater ? 1 : 0}|${sv.effects.has('poison') ? 1 : 0}`;
    if (hs !== this._sig.stats) {
      this._sig.stats = hs;
      this._drawHearts(); this._drawHunger(); this._drawArmor(); this._drawBubbles();
    }
    // Destello de daño y agua
    if (this._flash > 0) { this._flash = Math.max(0, this._flash - dt * 2.5); }
    this.dmgFlash.style.opacity = this._flash * 0.55;
    const fl = g.headFluid;
    this.waterTint.style.opacity = fl ? 1 : 0;
    this.waterTint.className = fl === 2 ? 'lava' : '';
    // Comer
    if (g.eating) { this.eatBar.classList.remove('hidden'); this.eatBar.firstChild.style.width = Math.min(100, (g.eating.t / g.eating.dur) * 100) + '%'; }
    else this.eatBar.classList.add('hidden');
    // Información superior
    const atm = g.sky.atm;
    const p = g.player;
    const biome = g.world.terrain ? biomeName(g.currentBiome ?? 2) : '';
    const clock = g.dimension === 'dark' ? 'Dimensión Oscura · penumbra eterna' : `${clockString(g.time)} · ${phaseName(g.time)}`;
    this.topRight.innerHTML = `<div class="clock">${clock}</div><div class="biome">${biome}</div><div class="mode">${GAMEMODE_NAMES[g.mode]}${g.difficulty === 'peaceful' ? ' · Pacífico' : ''}</div>`;
    if (this.debug) {
      const hit = g.hit;
      const lines = [
        `BLOCKWORLD ULTIMATE ${g.versionText || ''}`,
        `${g.frameStats.fps} FPS · gen ${g.world.gen.mode} · chunks ${g.world.chunks.size} (pend ${g.world.pending.size}) · mallas ${g.world.stats.meshed}`,
        `XYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
        `Chunk: ${Math.floor(p.x / 16)}, ${Math.floor(p.z / 16)} · Dirección: ${((p.yaw * 180 / Math.PI) % 360 + 360) % 360 | 0}° / ${(p.pitch * 180 / Math.PI) | 0}°`,
        `Bioma: ${biome} · Luz: cielo ${g.world.getSky(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z))} bloque ${g.world.getBlockLight(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z))}`,
        `Hora: ${clockString(g.time)} (${g.time.toFixed(3)}) · sol ${atm.sunH.toFixed(2)}`,
        `Entidades: ${g.entities.list.length} · semilla ${g.meta.seed} · modo ${g.mode} · ${g.difficulty}`,
        hit ? `Apuntando: ${g.world.getBlock(hit.x, hit.y, hit.z)} (${hit.x}, ${hit.y}, ${hit.z})` : 'Apuntando: -',
      ];
      this.topLeft.textContent = lines.join('\n');
      this.topLeft.style.display = 'block';
    } else if (g.settings.showFps) { this.topLeft.textContent = `${g.frameStats.fps} FPS`; this.topLeft.style.display = 'block'; }
    else this.topLeft.style.display = 'none';
    // Efectos de estado
    const fxs = sv.effects ? [...sv.effects.list].map(([id, e]) => `${id}:${e.level}:${Math.ceil(e.time)}`).join('|') : '';
    if (fxs !== this._sig.fx) {
      this._sig.fx = fxs;
      this.effectsEl.innerHTML = '';
      for (const [id, e] of sv.effects.list) {
        const d = EFFECTS[id];
        const t = Math.ceil(e.time), mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
        this.effectsEl.append(el('div', 'fx' + (d.good ? '' : ' bad'), { title: d.desc }, el('span', 'fx-dot', { style: `background:${d.color}` }), `${d.name} ${ROMAN[e.level] || e.level} · ${mm}:${ss}`));
      }
    }
    // Chat: desvanecer líneas antiguas
    const now = performance.now();
    for (const l of this.chatLines) l.el.style.opacity = this.chatInput.classList.contains('hidden') ? Math.max(0, Math.min(1, (l.until - now) / 800)) : 1;
  }

  _drawHearts() {
    const sv = this.game.survival;
    const hp = Math.ceil(sv.health);
    this.heartsEl.innerHTML = '';
    const poison = sv.effects && sv.effects.has('poison');
    for (let i = 0; i < Math.ceil(sv.maxHealth / 2); i++) {
      const v = hp - i * 2;
      const img = el('img', 'hp' + (sv.health <= 6 ? ' low' : '') + (poison ? ' poison' : ''), { src: v >= 2 ? HEART_FULL() : v === 1 ? HEART_HALF() : HEART_EMPTY(), width: 20, height: 20 });
      if (sv.invuln > 0) img.classList.add('inv');
      this.heartsEl.append(img);
    }
  }
  _drawHunger() {
    const sv = this.game.survival;
    this.hungerEl.innerHTML = '';
    for (let i = 9; i >= 0; i--) {
      const v = Math.floor(sv.hunger) - i * 2;
      const img = el('img', 'fd', { src: pixelIcon('food', v >= 2 ? '#c8873c' : v === 1 ? '#8a6a3c' : '#2a2018', '#3a2410', 3), width: 20, height: 20 });
      this.hungerEl.append(img);
    }
  }
  _drawArmor() {
    const def = this.game.inventory.armorDefense();
    this.armorEl.innerHTML = '';
    if (def <= 0) return;
    for (let i = 0; i < 10; i++) {
      const v = def - i * 2;
      this.armorEl.append(el('img', 'ar', { src: pixelIcon('armor', v >= 2 ? '#d6d9de' : v === 1 ? '#8d929c' : '#2a2c30', '#20242a', 3), width: 18, height: 18 }));
    }
  }
  _drawBubbles() {
    const g = this.game, sv = g.survival;
    this.bubblesEl.innerHTML = '';
    if (!g.player.headInWater && sv.air >= sv.maxAir - 0.01) return;
    const n = Math.max(0, Math.ceil(sv.air));
    for (let i = 0; i < 10; i++) this.bubblesEl.append(el('img', 'bb', { src: pixelIcon('bubble', i < n ? '#7ac8ff' : '#17283a', '#0a1a2a', 3), width: 18, height: 18 }));
  }

  // ── Información emergente de objetos ──
  showTooltip(stack, x, y) {
    if (!stack) { this.tooltip.classList.add('hidden'); return; }
    const it = Items.get(stack.i);
    const lines = [`<b>${it.name}</b>`];
    const max = maxDurability(it);
    if (it.tool) {
      lines.push(`<span class="dim">Nivel de cosecha ${it.tool.level} · Velocidad ${it.tool.speed} · Daño ${it.tool.damage.toFixed(1)}</span>`);
    }
    if (it.armor) lines.push(`<span class="dim">Defensa +${it.armor.defense}</span>`);
    if (it.food) lines.push(`<span class="dim">Hambre +${it.food.hunger}</span>`);
    const fxList = (it.food && it.food.effects) || (it.drink && it.drink.effects) || [];
    if (fxList.length) lines.push(`<span class="fx-line">${fxList.map(([id, sec, lvl]) => `${EFFECTS[id].name}${lvl > 1 ? ' ' + ROMAN[lvl] : ''} (${sec} s)`).join(' · ')}</span>`);
    if (it.drink && it.drink.heal) lines.push(`<span class="fx-line">Cura ${it.drink.heal / 2} corazones y quita los efectos negativos</span>`);
    const DESC = {
      glass_bottle: 'Clic derecho sobre el agua para llenarlo', water_flask: 'Base de los tónicos', tonic_base: 'Destílalo con un ingrediente en la mesa de alquimia',
      heart_crystal: 'Clic derecho: +1 corazón máximo (hasta 20)', root_staff: 'Clic derecho: las raíces inmovilizan a los enemigos cercanos y te regeneran (15 s de recarga)',
      prism_blade: 'Cada cuatro golpes libera un anillo de esquirlas', coral_crown: 'Respiras bajo el agua mientras la llevas puesta',
      titan_hammer: 'Rompe zonas de 3×3 bloques de piedra y minerales', snowball: 'Clic derecho: lánzala (enfría al Titán Volcánico)',
      umbral_key: 'Clic derecho en un Núcleo de portal rodeado de 8 bloques de vidrio volcánico para abrirlo', portal_core: 'Rodéalo de vidrio volcánico (3×3) y actívalo con la Llave umbría',
      eclipse_scepter: 'Clic derecho: dispara un proyectil de sombra', shadow_shard: 'Lo sueltan las criaturas de la Dimensión Oscura',
    };
    if (it.kind === 'summon') lines.push(`<span class="fx-line">Ofrenda: despierta a un jefe en su altar</span>`);
    if (DESC[it.key]) lines.push(`<span class="dim">${DESC[it.key]}</span>`);
    if (it.unique) lines.push('<span class="fx-line">★ Objeto único de jefe</span>');
    if (it.fuel) lines.push(`<span class="dim">Combustible: ${it.fuel} s</span>`);
    if (max) lines.push(`<span class="dim">Durabilidad ${max - (stack.d || 0)}/${max}</span>`);
    this.tooltip.innerHTML = lines.join('<br>');
    this.tooltip.classList.remove('hidden');
    const r = this.tooltip.getBoundingClientRect();
    this.tooltip.style.left = Math.min(window.innerWidth - r.width - 8, x + 14) + 'px';
    this.tooltip.style.top = Math.min(window.innerHeight - r.height - 8, y + 14) + 'px';
  }
  hideTooltip() { this.tooltip.classList.add('hidden'); }

  // ── Chat y comandos ──
  chat(msg, cls = '') {
    const line = el('div', 'chat-line ' + cls, { text: msg });
    this.chatLogEl.append(line);
    const rec = { el: line, until: performance.now() + 9000 };
    this.chatLines.push(rec);
    while (this.chatLogEl.children.length > 8) { this.chatLogEl.firstChild.remove(); this.chatLines.shift(); }
  }
  openChat(prefix = '') {
    this.chatInput.classList.remove('hidden');
    this.chatInput.value = prefix;
    this.chatOpen = true; // antes de soltar el puntero: en modo táctil se suelta al instante y si no se abriría la pausa
    this.game.controls.unlock();
    setTimeout(() => this.chatInput.focus(), 0);
  }
  closeChat() {
    this.chatInput.classList.add('hidden'); this.chatInput.blur(); this.chatOpen = false;
  }

  // ── Pantallas ──
  get hasScreen() { return !!this.screen || !!this.chatOpen; }
  setScreen(screen) { this.closeScreen(true); this.screen = screen; this.screenRoot.append(screen.root); this.hideTooltip(); }
  closeScreen(silent = false) {
    if (!this.screen) return;
    const s = this.screen; this.screen = null;
    if (s.onClose) s.onClose();
    s.root.remove();
    this.hideTooltip();
    if (!silent) this.game.onScreenClosed();
  }
}
