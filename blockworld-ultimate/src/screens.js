// Pantallas dentro del juego: inventario (supervivencia y creativo), mesa de trabajo, cofre, horno, pausa, muerte y controles.
// Toda la manipulación de objetos pasa por las funciones puras de inventory.js: la interfaz solo repinta desde el modelo.
import { el, $, UI } from './ui.js';
import { Items, creativeCatalog, makeStack, maxDurability, ARMOR_SLOTS } from './items.js';
import { getItemIconURL } from './atlas.js';
import { clickSlot, shiftMove, collectToCursor, addToSlots, stackMax, countInSlots, HOTBAR_SIZE } from './inventory.js';
import { recipesFor, canCraft, maxCrafts, craft, countIngredient, TAGS, smeltRecipe, fuelTime, repairStack, repairMaterial } from './crafting.js';
import { DEFAULT_KEYS } from './controls.js';
import { ACHIEVEMENTS } from './achievements.js';

const KEY_LABEL = (c) => c.replace('Key', '').replace('Arrow', '↑↓←→'.charAt(['Up', 'Down', 'Left', 'Right'].findIndex((d) => c.endsWith(d))) || '').replace('Space', 'Espacio').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'Shift').replace('Slash', '/');

/** Base común de las pantallas con huecos. */
class SlotScreen {
  constructor(game, title, cls = '') {
    this.game = game; this.ui = game.ui;
    this.root = el('div', 'screen-overlay ' + cls);
    this.panel = el('div', 'panel');
    this.root.append(this.panel);
    if (title) this.panel.append(el('h2', null, { text: title }));
    this.views = [];     // {el, slots, idx, rules}
    this.cursorEl = el('div', 'cursor-item hidden', null, el('img'), el('span', 'count'));
    document.body.append(this.cursorEl);
    this.mx = 0; this.my = 0;
    this._move = (e) => { this.mx = e.clientX; this.my = e.clientY; this._placeCursor(); if (this.hover) this.ui.showTooltip(this.hover.slots[this.hover.idx], this.mx, this.my); };
    document.addEventListener('mousemove', this._move);
    // Clic fuera del panel: soltar el objeto de la mano
    this.root.addEventListener('mousedown', (e) => {
      if (e.target !== this.root) return;
      const inv = game.inventory;
      if (inv.cursor) {
        if (e.button === 0) { game.dropFromPlayer(inv.cursor); inv.cursor = null; }
        else { game.dropFromPlayer({ i: inv.cursor.i, n: 1, d: inv.cursor.d }); inv.cursor.n--; if (inv.cursor.n <= 0) inv.cursor = null; }
        this.refresh();
      }
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onClose() {
    document.removeEventListener('mousemove', this._move);
    this.cursorEl.remove();
    const g = this.game, inv = g.inventory;
    // Lo que quede en la mano vuelve al inventario (o se suelta si no cabe)
    if (inv.cursor) { const rest = inv.add(inv.cursor); if (rest) g.dropFromPlayer(rest); inv.cursor = null; }
    this.ui.hideTooltip();
    if (this.afterClose) this.afterClose();
  }

  _placeCursor() { this.cursorEl.style.transform = `translate(${this.mx + 6}px, ${this.my + 6}px)`; }

  /** Crea un hueco enlazado a slots[idx]. */
  slot(slots, idx, rules = {}, cls = '') {
    const d = el('div', 'slot ' + cls, null, el('img', 'icon'), el('span', 'count'), el('div', 'dur', null, el('div')));
    if (rules.label) d.append(el('span', 'slot-label', { text: rules.label }));
    d.addEventListener('mousedown', (e) => { e.preventDefault(); this.onSlot(slots, idx, rules, e); });
    d.addEventListener('dblclick', () => this.onDouble(slots, idx));
    d.addEventListener('mouseenter', () => { this.hover = { slots, idx }; this.ui.showTooltip(slots[idx], this.mx, this.my); });
    d.addEventListener('mouseleave', () => { this.hover = null; this.ui.hideTooltip(); });
    this.views.push({ el: d, slots, idx });
    return d;
  }

  grid(slots, from, to, cols, rules = () => ({}), cls = '') {
    const g = el('div', 'slot-grid', { style: `grid-template-columns: repeat(${cols}, 44px)` });
    for (let i = from; i < to; i++) g.append(this.slot(slots, i, rules(i), cls));
    return g;
  }

  onSlot(slots, idx, rules, e) {
    const g = this.game, inv = g.inventory;
    if (e.shiftKey && !inv.cursor) { if (this.onShift(slots, idx)) { this.afterChange(); } return; }
    const button = e.button === 2 ? 2 : 0;
    const before = inv.cursor;
    inv.cursor = clickSlot(slots, idx, inv.cursor, button, {
      canPlace: rules.canPlace ? (i, st) => rules.canPlace(st) : undefined,
      outputOnly: rules.outputOnly ? () => true : undefined,
    });
    if (rules.outputOnly && before !== inv.cursor && inv.cursor) { g.audio && g.audio.play('pickup'); this.onTake && this.onTake(slots, idx); }
    g.audio && g.audio.play('click');
    this.afterChange();
  }
  onDouble(slots, idx) {
    const inv = this.game.inventory;
    if (!inv.cursor) return;
    collectToCursor([...new Set(this.views.map((v) => v.slots))], inv.cursor);
    this.afterChange();
  }
  onShift(slots, idx) { return false; }
  afterChange() { this.refresh(); }

  /** Repinta si el inventario cambió por fuera (p. ej. recogiendo objetos con la pantalla abierta). */
  sigCheck() {
    const inv = this.game.inventory;
    const sig = inv.slots.map((x) => (x ? x.i + ':' + x.n : '-')).join(',') + '|' + (inv.cursor ? inv.cursor.n : 0);
    if (sig !== this._sig) { this._sig = sig; this.refresh(); }
  }
  update() { this.sigCheck(); }

  refresh() {
    const inv = this.game.inventory;
    for (const v of this.views) UI.paintSlot(v.el, v.slots[v.idx]);
    const c = inv.cursor;
    this.cursorEl.classList.toggle('hidden', !c);
    if (c) { UI.paintSlot(this.cursorEl, c); this._placeCursor(); }
    if (this.hover) this.ui.showTooltip(this.hover.slots[this.hover.idx], this.mx, this.my); else this.ui.hideTooltip();
    if (this.onRefresh) this.onRefresh();
  }

  /** Inventario del jugador (3 filas + barra rápida). */
  playerInventory() {
    const inv = this.game.inventory;
    const box = el('div', 'inv-block');
    box.append(this.grid(inv.slots, 9, 36, 9));
    box.append(el('div', 'hotbar-gap'));
    box.append(this.grid(inv.slots, 0, 9, 9));
    return box;
  }

  armorColumn() {
    const inv = this.game.inventory;
    const col = el('div', 'armor-col');
    const names = ['Casco', 'Peto', 'Grebas', 'Botas'];
    for (let i = 0; i < 4; i++) {
      col.append(this.slot(inv.armor, i, {
        canPlace: (st) => { const it = Items.get(st.i); return !!(it && it.armor && it.armor.slotIndex === i); }, label: names[i][0],
      }, 'armor'));
    }
    return col;
  }

  /** Mayús+clic estándar entre inventario del jugador y hasta un contenedor destino. */
  shiftFromPlayer(slots, idx, extraTargets = []) {
    const inv = this.game.inventory;
    if (slots === inv.slots) {
      const s = slots[idx];
      if (!s) return false;
      const it = Items.get(s.i);
      // armadura → ranura de armadura
      if (it.armor && !inv.armor[it.armor.slotIndex]) { inv.armor[it.armor.slotIndex] = s; slots[idx] = null; return true; }
      for (const t of extraTargets) { if (t.accept && !t.accept(s)) continue; if (shiftMove(slots, idx, [t])) return true; }
      if (idx < HOTBAR_SIZE) return shiftMove(slots, idx, [{ slots, from: 9, to: 36 }]);
      return shiftMove(slots, idx, [{ slots, from: 0, to: 9 }]);
    }
    if (slots === inv.armor) return shiftMove(slots, idx, [{ slots: inv.slots, from: 0, to: 36 }]);
    return false;
  }
}

// ── Panel de fabricación ────────────────────────────────────────
class CraftingPanel {
  constructor(screen, station) {
    this.screen = screen; this.game = screen.game; this.station = station;
    this.onlyAvailable = false;
    this.root = el('div', 'craft-panel');
    this.root.append(el('h3', null, { text: station === 'workbench' ? 'Mesa de trabajo' : 'Fabricación básica' }));
    const bar = el('div', 'craft-bar');
    this.chk = el('label', 'chk', null, el('input', null, { type: 'checkbox' }), ' Solo disponibles');
    $('input', this.chk).addEventListener('change', (e) => { this.onlyAvailable = e.target.checked; this.refresh(); });
    bar.append(this.chk);
    this.root.append(bar);
    this.list = el('div', 'recipe-list');
    this.root.append(this.list);
    if (station === 'workbench') {
      this.repairBox = el('div', 'repair-box');
      this.root.append(this.repairBox);
    }
    this.refresh();
  }

  refresh() {
    const g = this.game, inv = g.inventory;
    const creative = g.mode === 'creative';
    const rs = recipesFor(this.station === 'workbench' ? 'workbench' : 'hand', g.discovered, creative);
    // en la mesa de trabajo también valen las recetas de mano
    const all = this.station === 'workbench' ? recipesFor('workbench', g.discovered, creative) : rs;
    this.list.innerHTML = '';
    let lastCat = null;
    for (const r of all) {
      const can = canCraft(r, inv.slots);
      if (this.onlyAvailable && !can) continue;
      if (r.category !== lastCat) { lastCat = r.category; this.list.append(el('div', 'cat', { text: r.category })); }
      const out = Items.get(r.out);
      const card = el('div', 'recipe' + (can ? '' : ' no'));
      const ico = el('div', 'r-out', null, el('img', null, { src: getItemIconURL(out) }), r.n > 1 ? el('span', 'count', { text: r.n }) : null);
      const ing = el('div', 'r-ing');
      for (const [spec, n] of r.in) {
        const have = countIngredient(inv.slots, spec);
        const label = spec.startsWith('#') ? (spec === '#log' ? 'Cualquier tronco' : 'Carbón') : Items.get(spec).name;
        const icon = spec.startsWith('#') ? Items.get(TAGS[spec][0]) : Items.get(spec);
        ing.append(el('span', 'ing' + (have >= n ? '' : ' miss'), { title: label }, el('img', null, { src: getItemIconURL(icon) }), `${have}/${n}`));
      }
      card.append(ico, el('div', 'r-name', null, el('b', null, { text: out.name }), ing));
      card.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const times = e.shiftKey ? Math.max(1, maxCrafts(r, inv.slots)) : 1;
        if (!can) { g.audio && g.audio.play('click'); return; }
        const done = craft(r, inv.slots, times);
        if (done > 0) { g.audio && g.audio.play('craft'); g.onItemObtained(out.key); this.screen.refresh(); } else g.ui.toast('No hay espacio en el inventario');
      });
      this.list.append(card);
    }
    if (!this.list.children.length) this.list.append(el('div', 'empty', { text: 'No hay recetas disponibles. ¡Reúne materiales para descubrir más!' }));
    if (this.repairBox) this._repair();
  }

  _repair() {
    const g = this.game, inv = g.inventory;
    this.repairBox.innerHTML = '';
    const st = inv.getSelected();
    const it = st ? Items.get(st.i) : null;
    this.repairBox.append(el('h4', null, { text: 'Reparar' }));
    if (!it || !(it.tool || it.armor)) { this.repairBox.append(el('div', 'dim', { text: 'Sostén una herramienta o armadura dañada (barra rápida) y ten su material.' })); return; }
    const max = maxDurability(it);
    const mat = Items.get(repairMaterial(it));
    const row = el('div', 'repair-row', null, el('img', null, { src: getItemIconURL(it) }), el('span', null, { text: `${it.name}: ${max - (st.d || 0)}/${max}` }));
    const btn = el('button', 'btn small', { text: `Reparar (1 ${mat.name})` });
    if (!st.d) btn.disabled = true;
    btn.addEventListener('click', () => {
      const r = repairStack(st, inv.slots);
      if (!r.ok) g.ui.toast(r.reason); else { g.audio && g.audio.play('craft'); this.screen.refresh(); }
    });
    this.repairBox.append(row, btn);
  }
}

// ── Inventario ───────────────────────────────────────────────────
export function openInventoryScreen(game) {
  const creative = game.mode === 'creative';
  const s = new SlotScreen(game, creative ? 'Inventario creativo' : 'Inventario', 'inventory-screen');
  s.onShift = (slots, idx) => s.shiftFromPlayer(slots, idx);
  const inv = game.inventory;
  if (creative) {
    // Catálogo con búsqueda y categorías
    const cat = creativeCatalog();
    const tabs = [['Todo', () => true], ['Bloques', (i) => i.kind === 'block' || i.kind === 'door'], ['Herramientas', (i) => i.kind === 'tool'], ['Armaduras', (i) => i.kind === 'armor'], ['Comida', (i) => !!i.food], ['Materiales', (i) => i.kind === 'material' || i.kind === 'bucket' || i.kind === 'rope']];
    let filter = tabs[0][1], q = '';
    const bar = el('div', 'creative-bar');
    const tabBox = el('div', 'tabs');
    const search = el('input', 'search', { type: 'text', placeholder: 'Buscar…' });
    tabs.forEach(([name, f], i) => {
      const b = el('button', 'tab' + (i === 0 ? ' on' : ''), { text: name });
      b.addEventListener('click', () => { filter = f; [...tabBox.children].forEach((c) => c.classList.remove('on')); b.classList.add('on'); fill(); });
      tabBox.append(b);
    });
    bar.append(tabBox, search);
    const grid = el('div', 'catalog');
    const fill = () => {
      grid.innerHTML = '';
      const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      for (const it of cat) {
        if (!filter(it)) continue;
        if (q && !norm(it.name).includes(norm(q)) && !norm(it.key).includes(norm(q))) continue;
        const d = el('div', 'slot cat-item', { title: it.name }, el('img', 'icon', { src: getItemIconURL(it) }));
        d.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const n = e.button === 2 ? 1 : (it.stack > 1 ? it.stack : 1);
          if (e.shiftKey) { const rest = addToSlots(inv.slots, makeStack(it.id, n)); void rest; }
          else inv.cursor = makeStack(it.id, n);
          s.refresh();
        });
        d.addEventListener('mouseenter', () => s.ui.showTooltip(makeStack(it.id, 1), s.mx, s.my));
        d.addEventListener('mouseleave', () => s.ui.hideTooltip());
        grid.append(d);
      }
    };
    search.addEventListener('input', () => { q = search.value; fill(); });
    search.addEventListener('keydown', (e) => e.stopPropagation());
    fill();
    s.panel.append(bar, grid);
    // Papelera: soltar aquí destruye
    const trash = el('div', 'trash', { text: '🗑 Papelera (suelta aquí)' });
    trash.addEventListener('mousedown', (e) => { e.preventDefault(); inv.cursor = null; s.refresh(); });
    s.panel.append(trash);
    s.panel.append(el('div', 'creative-row', null, s.armorColumn(), s.playerInventory()));
  } else {
    const top = el('div', 'inv-top');
    top.append(s.armorColumn());
    const cp = new CraftingPanel(s, 'hand');
    s.onRefresh = () => cp.refresh();
    top.append(cp.root);
    s.panel.append(top, s.playerInventory());
  }
  s.refresh();
  return s;
}

export function openWorkbenchScreen(game) {
  const s = new SlotScreen(game, null, 'workbench-screen');
  s.onShift = (slots, idx) => s.shiftFromPlayer(slots, idx);
  const cp = new CraftingPanel(s, 'workbench');
  s.onRefresh = () => cp.refresh();
  s.panel.append(cp.root, el('h3', null, { text: 'Inventario' }), s.playerInventory());
  s.refresh();
  return s;
}

export function openChestScreen(game, be) {
  const s = new SlotScreen(game, 'Cofre', 'chest-screen');
  const inv = game.inventory;
  s.panel.append(s.grid(be.slots, 0, 27, 9));
  s.panel.append(el('h3', null, { text: 'Inventario' }), s.playerInventory());
  s.onShift = (slots, idx) => {
    if (slots === be.slots) return shiftMove(slots, idx, [{ slots: inv.slots, from: 0, to: 36 }]);
    return s.shiftFromPlayer(slots, idx, [{ slots: be.slots, from: 0, to: 27 }]);
  };
  s.refresh();
  return s;
}

export function openFurnaceScreen(game, be) {
  const s = new SlotScreen(game, 'Horno', 'furnace-screen');
  const inv = game.inventory;
  const ex = be.extra || (be.extra = { burn: 0, burnMax: 0, cook: 0 });
  const rules = [
    { label: '' },
    { canPlace: (st) => fuelTime(st.i) > 0, label: '' },
    { outputOnly: true },
  ];
  const fire = el('div', 'flame', null, el('div'));
  const arrow = el('div', 'arrow', null, el('div'));
  const col = el('div', 'furnace-col', null, s.slot(be.slots, 0, rules[0]), fire, s.slot(be.slots, 1, rules[1]));
  s.panel.append(el('div', 'furnace-row', null, col, arrow, s.slot(be.slots, 2, rules[2], 'big')));
  s.panel.append(el('h3', null, { text: 'Inventario' }), s.playerInventory());
  s.onShift = (slots, idx) => {
    if (slots === be.slots) return shiftMove(slots, idx, [{ slots: inv.slots, from: 0, to: 36 }]);
    const st = slots[idx];
    const targets = [];
    if (st && smeltRecipe(st.i)) targets.push({ slots: be.slots, from: 0, to: 1 });
    else if (st && fuelTime(st.i) > 0) targets.push({ slots: be.slots, from: 1, to: 2 });
    return s.shiftFromPlayer(slots, idx, targets);
  };
  s.update = () => {
    s.sigCheck();
    $('div', fire).style.height = (ex.burn > 0 && ex.burnMax ? Math.round((ex.burn / ex.burnMax) * 100) : 0) + '%';
    const rec = be.slots[0] ? smeltRecipe(be.slots[0].i) : null;
    $('div', arrow).style.width = (rec ? Math.round((ex.cook / rec.time) * 100) : 0) + '%';
    for (const v of s.views) UI.paintSlot(v.el, v.slots[v.idx]);
  };
  s.refresh();
  return s;
}

// ── Pausa / muerte / controles ──────────────────────────────────
export function openPauseScreen(game, { onResume, onOptions, onControls, onQuit, onAchievements }) {
  const root = el('div', 'screen-overlay dim');
  const panel = el('div', 'panel narrow', null, el('h2', null, { text: 'Juego en pausa' }));
  const mk = (t, f, cls = '') => { const b = el('button', 'btn ' + cls, { text: t }); b.addEventListener('click', () => { game.audio && game.audio.play('click'); f(); }); return b; };
  panel.append(mk('Continuar', onResume, 'primary'), mk('Opciones', onOptions), mk('Controles', onControls), mk('Logros', onAchievements), mk('Guardar y salir al menú', onQuit));
  panel.append(el('p', 'dim center', { text: 'El mundo se guarda automáticamente cada 30 s.' }));
  root.append(panel);
  return { root };
}

export function openDeathScreen(game, cause, { onRespawn, onQuit }) {
  const root = el('div', 'screen-overlay death');
  const names = { fall: 'Te caíste desde demasiado alto', drown: 'Te ahogaste', lava: 'Intentaste nadar en lava', fire: 'Te quemaste', cactus: 'Te pinchó un cacto', void: 'Caíste al vacío', starve: 'Moriste de hambre', mob: 'Te derrotó una criatura', magic: 'Fuiste víctima de la magia', cmd: 'Fuiste eliminado' };
  const panel = el('div', 'panel narrow', null, el('h2', 'red', { text: 'Has muerto' }), el('p', 'center', { text: names[cause] || 'Has muerto' }));
  const b1 = el('button', 'btn primary', { text: 'Reaparecer' }); b1.addEventListener('click', onRespawn);
  const b2 = el('button', 'btn', { text: 'Guardar y salir al menú' }); b2.addEventListener('click', onQuit);
  panel.append(b1, b2);
  if (game.meta && game.meta.keepInventory) panel.append(el('p', 'dim center', { text: 'Conservas tu inventario (regla del mundo).' }));
  else panel.append(el('p', 'dim center', { text: 'Tus objetos se han quedado donde caíste.' }));
  root.append(panel);
  return { root };
}

export function buildControlsPanel() {
  const rows = [
    ['Avanzar / izquierda / retroceder / derecha', 'W A S D (o flechas)'], ['Saltar (doble toque: volar en Creativo)', 'Espacio'], ['Correr', 'Shift'], ['Agacharse (no cae de los bordes) / bajar al volar', 'C'],
    ['Mirar', 'Ratón'], ['Romper bloque / atacar', 'Clic izquierdo (mantener)'], ['Colocar bloque / usar / abrir / comer (mantener)', 'Clic derecho'], ['Copiar bloque apuntado (Creativo)', 'Clic central'],
    ['Seleccionar ranura', 'Teclas 1–9 o rueda'], ['Inventario / fabricación', 'E'], ['Soltar objeto (Mayús+Q: toda la pila)', 'Q'], ['Cámara en 1ª / 3ª persona', 'V'],
    ['Depuración (coordenadas, FPS)', 'F3'], ['Ocultar interfaz', 'F1'], ['Chat y comandos', 'T o /'], ['Pausa', 'Esc'],
  ];
  const t = el('table', 'keys');
  for (const [a, k] of rows) t.append(el('tr', null, null, el('td', null, { text: a }), el('td', 'k', null, el('kbd', null, { text: k }))));
  return t;
}
export function openControlsScreen(onBack) {
  const root = el('div', 'screen-overlay dim');
  const panel = el('div', 'panel', null, el('h2', null, { text: 'Controles' }), buildControlsPanel());
  const b = el('button', 'btn primary', { text: 'Volver' }); b.addEventListener('click', onBack);
  panel.append(b); root.append(panel);
  return { root };
}
export function openAchievementsScreen(game, onBack) {
  const root = el('div', 'screen-overlay dim');
  const list = el('div', 'ach-list');
  for (const a of ACHIEVEMENTS) {
    const done = game.achievements.has(a.id);
    list.append(el('div', 'ach' + (done ? ' done' : ''), null, el('span', 'ach-ico', { text: done ? '🏆' : '🔒' }), el('div', null, null, el('b', null, { text: a.name }), el('div', 'dim', { text: a.desc }))));
  }
  const b = el('button', 'btn primary', { text: 'Volver' }); b.addEventListener('click', onBack);
  const panel = el('div', 'panel', null, el('h2', null, { text: `Logros (${game.achievements.size}/${ACHIEVEMENTS.length})` }), list, b);
  root.append(panel);
  return { root };
}
void DEFAULT_KEYS; void KEY_LABEL; void stackMax; void countInSlots; void ARMOR_SLOTS;
