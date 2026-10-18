// Menú principal, selección y creación de mundos, opciones, controles y créditos.
import { el, $ } from './ui.js';
import { buildControlsPanel } from './screens.js';
import { DIFFICULTIES, DIFFICULTY_NAMES, GAMEMODES, GAMEMODE_NAMES, WORLD_TYPES, WORLD_SIZES, VERSION, GAME_NAME } from './config.js';
import { saveSettings } from './save.js';

const OPTION_SLIDERS = [
  { key: 'renderDistance', label: 'Distancia de renderizado', min: 2, max: 12, step: 1, fmt: (v) => `${v} chunks` },
  { key: 'fov', label: 'Campo de visión', min: 50, max: 110, step: 1, fmt: (v) => `${v}°` },
  { key: 'sensitivity', label: 'Sensibilidad del ratón', min: 0.2, max: 3, step: 0.05, fmt: (v) => `${(+v).toFixed(2)}×` },
  { key: 'brightness', label: 'Brillo', min: 0.8, max: 1.8, step: 0.05, fmt: (v) => `${Math.round(v * 100)} %` },
  { key: 'masterVolume', label: 'Volumen general', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)} %` },
  { key: 'musicVolume', label: 'Volumen de música', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)} %` },
  { key: 'touchSensitivity', label: 'Sensibilidad táctil', min: 0.3, max: 3, step: 0.05, fmt: (v) => `${(+v).toFixed(2)}×` },
];
const OPTION_SELECTS = [
  { key: 'touchControls', label: 'Controles táctiles', options: [['auto', 'Automático (teléfonos y tabletas)'], ['on', 'Siempre'], ['off', 'Nunca']] },
];
const OPTION_TOGGLES = [
  { key: 'autoJump', label: 'Autosalto (sube bloques de 1 de alto)' },
  { key: 'bobbing', label: 'Balanceo de cámara al andar' },
  { key: 'clouds', label: 'Nubes' },
  { key: 'particles', label: 'Partículas' },
  { key: 'fancyLeaves', label: 'Hojas detalladas (más lento)' },
  { key: 'invertY', label: 'Invertir eje Y del ratón' },
  { key: 'showFps', label: 'Mostrar FPS' },
  { key: 'touchFullscreen', label: 'Pantalla completa al jugar con controles táctiles' },
];

/** Panel de opciones reutilizable (menú principal y pausa). onChange(key, value) se llama al instante. */
export function buildOptionsPanel(settings, onChange) {
  const box = el('div', 'options');
  for (const o of OPTION_SLIDERS) {
    const val = el('span', 'val', { text: o.fmt(settings[o.key]) });
    const input = el('input', null, { type: 'range', min: o.min, max: o.max, step: o.step, value: settings[o.key] });
    input.addEventListener('input', () => {
      const v = o.step >= 1 ? parseInt(input.value, 10) : parseFloat(input.value);
      settings[o.key] = v; val.textContent = o.fmt(v); saveSettings(settings); onChange(o.key, v);
    });
    box.append(el('label', 'opt', null, el('span', 'lbl', { text: o.label }), input, val));
  }
  for (const o of OPTION_SELECTS) {
    const sel = el('select');
    for (const [v, t] of o.options) { const op = el('option', null, { value: v, text: t }); if ((settings[o.key] || o.options[0][0]) === v) op.selected = true; sel.append(op); }
    sel.addEventListener('change', () => { settings[o.key] = sel.value; saveSettings(settings); onChange(o.key, sel.value); });
    box.append(el('label', 'opt sel', null, el('span', 'lbl', { text: o.label }), sel));
  }
  for (const o of OPTION_TOGGLES) {
    const input = el('input', null, { type: 'checkbox' }); input.checked = !!settings[o.key];
    input.addEventListener('change', () => { settings[o.key] = input.checked; saveSettings(settings); onChange(o.key, input.checked); });
    box.append(el('label', 'opt chk', null, input, el('span', 'lbl', { text: o.label })));
  }
  return box;
}

const fmtDate = (t) => (t ? new Date(t).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export class Menus {
  constructor(app) {
    this.app = app;
    this.root = $('#menu-root');
  }

  hide() { this.root.innerHTML = ''; this.root.classList.add('hidden'); }
  _show(content) { this.root.classList.remove('hidden'); this.root.innerHTML = ''; this.root.append(content); }

  _logo() {
    return el('div', 'logo', null,
      el('div', 'logo-main', null, ...'BLOCKWORLD'.split('').map((c, i) => el('span', 'lt lt' + (i % 5), { text: c }))),
      el('div', 'logo-sub', { text: 'U L T I M A T E' }));
  }

  async showMain() {
    const app = this.app;
    const worlds = await app.store.listWorlds();
    const wrap = el('div', 'menu-screen');
    wrap.append(this._logo());
    const col = el('div', 'menu-col');
    const btn = (text, fn, cls = '', disabled = false, sub = '') => {
      const b = el('button', 'btn ' + cls, null, el('span', null, { text }), sub ? el('small', null, { text: sub }) : null);
      if (disabled) b.disabled = true;
      b.addEventListener('click', () => { app.audio.resume(); app.audio.play('click'); fn(); });
      return b;
    };
    col.append(
      btn('Jugar', () => this.showPlay(), 'primary big', false, worlds.length ? `${worlds.length} mundo${worlds.length > 1 ? 's' : ''} guardado${worlds.length > 1 ? 's' : ''}` : 'Empieza una aventura'),
      btn('Continuar mundo', () => app.playWorld(worlds[0].id), '', !worlds.length, worlds[0] ? worlds[0].name : 'No hay mundos guardados'),
      btn('Crear mundo', () => this.showCreate()),
      btn('Seleccionar mundo', () => this.showSelect(), '', !worlds.length),
    );
    col.append(el('div', 'menu-sep', { text: 'Inicio rápido (mundo nuevo al azar)' }));
    const quick = el('div', 'quick');
    quick.append(
      btn('Supervivencia', () => app.quickStart('survival'), 'mode surv'),
      btn('Creativo', () => app.quickStart('creative'), 'mode crea'),
      btn('Aventura', () => app.quickStart('adventure'), 'mode adv'),
      btn('Pacífico', () => app.quickStart('peaceful'), 'mode peace'),
    );
    col.append(quick, el('div', 'menu-sep'));
    const row = el('div', 'quick three');
    row.append(btn('Opciones', () => this.showOptions()), btn('Controles', () => this.showControls()), btn('Créditos', () => this.showCredits()));
    col.append(row);
    wrap.append(col);
    wrap.append(el('div', 'menu-foot', { text: `${GAME_NAME} · ${VERSION}` }));
    if (!app.store.persistent) wrap.append(el('div', 'warn', { text: '⚠ El almacenamiento del navegador no está disponible: los mundos no se guardarán.' }));
    this._show(wrap);
  }

  _panel(title, ...children) {
    const wrap = el('div', 'menu-screen');
    wrap.append(this._logo());
    const panel = el('div', 'panel menu-panel', null, el('h2', null, { text: title }), ...children);
    wrap.append(panel);
    return { wrap, panel };
  }

  showPlay() { this.showSelect(true); }

  async showSelect(withCreate = false) {
    const app = this.app;
    const worlds = await app.store.listWorlds();
    const list = el('div', 'world-list');
    if (!worlds.length) list.append(el('div', 'empty', { text: 'Todavía no hay mundos guardados. ¡Crea el primero!' }));
    for (const w of worlds) {
      const row = el('div', 'world-row');
      const info = el('div', 'w-info', null,
        el('b', null, { text: w.name }),
        el('div', 'dim', { text: `${GAMEMODE_NAMES[w.mode] || w.mode} · ${DIFFICULTY_NAMES[w.difficulty] || w.difficulty} · ${WORLD_TYPES[w.type] ? WORLD_TYPES[w.type].name.split(' (')[0] : w.type}` }),
        el('div', 'dim', { text: `Semilla ${w.seedText ?? w.seed} · Jugado: ${fmtDate(w.lastPlayed)} · ${Math.round((w.playTime || 0) / 60)} min` }));
      const play = el('button', 'btn primary small', { text: 'Jugar' });
      play.addEventListener('click', () => { app.audio.resume(); app.playWorld(w.id); });
      const del = el('button', 'btn danger small', { text: 'Borrar' });
      del.addEventListener('click', async () => {
        if (del.dataset.sure) { await app.store.deleteWorld(w.id); this.showSelect(withCreate); return; }
        del.dataset.sure = '1'; del.textContent = '¿Seguro?'; setTimeout(() => { delete del.dataset.sure; del.textContent = 'Borrar'; }, 3000);
      });
      row.append(info, el('div', 'w-btns', null, play, del));
      list.append(row);
    }
    const back = el('button', 'btn', { text: 'Volver' }); back.addEventListener('click', () => this.showMain());
    const actions = el('div', 'actions', null, back);
    if (withCreate) { const c = el('button', 'btn primary', { text: 'Crear mundo nuevo' }); c.addEventListener('click', () => this.showCreate()); actions.prepend(c); }
    const { wrap } = this._panel(withCreate ? 'Jugar' : 'Seleccionar mundo', list, actions);
    this._show(wrap);
  }

  showCreate(defaults = {}) {
    const app = this.app;
    const f = { name: 'Mi mundo', seed: '', type: 'normal', difficulty: 'normal', size: 'infinite', structures: true, mobs: 'all', mode: 'survival', commands: true, keepInventory: false, ...defaults };
    const sel = (opts, cur) => { const s = el('select'); for (const [k, v] of opts) { const o = el('option', null, { value: k, text: v }); if (k === cur) o.selected = true; s.append(o); } return s; };
    const fld = (label, ctl, hint) => el('label', 'fld', null, el('span', 'lbl', { text: label }), ctl, hint ? el('small', 'dim', { text: hint }) : null);
    const name = el('input', null, { type: 'text', value: f.name, maxlength: 32 });
    const seed = el('input', null, { type: 'text', value: f.seed, placeholder: 'Vacío = al azar (texto o número)', maxlength: 40 });
    const type = sel(Object.entries(WORLD_TYPES).map(([k, v]) => [k, v.name]), f.type);
    const diff = sel(DIFFICULTIES.map((d) => [d, DIFFICULTY_NAMES[d]]), f.difficulty);
    const size = sel(Object.entries(WORLD_SIZES).map(([k, v]) => [k, v.name]), f.size);
    const mode = sel(GAMEMODES.map((m) => [m, GAMEMODE_NAMES[m]]), f.mode);
    const mobs = sel([['all', 'Todas (animales y monstruos)'], ['animals', 'Solo animales'], ['none', 'Ninguna']], f.mobs);
    const chk = (label, val) => { const i = el('input', null, { type: 'checkbox' }); i.checked = val; return [el('label', 'opt chk', null, i, el('span', 'lbl', { text: label })), i]; };
    const [structL, structI] = chk('Generar estructuras (ruinas, templos, mazmorras)', f.structures);
    const [cmdL, cmdI] = chk('Permitir comandos y trucos (T o /)', f.commands);
    const [keepL, keepI] = chk('Conservar el inventario al morir', f.keepInventory);
    const form = el('div', 'form', null,
      fld('Nombre del mundo', name), fld('Semilla', seed, 'La misma semilla y versión del generador crean el mismo mundo.'),
      fld('Tipo de mundo', type), fld('Modo de juego', mode), fld('Dificultad', diff), fld('Tamaño / límites del mundo', size),
      fld('Aparición de criaturas', mobs), structL, cmdL, keepL);
    const note = el('div', 'note', { html: '<b>No incluido todavía (fases posteriores):</b> dimensiones, aldeas y comercio, jefes, maquinaria automática, multijugador. El juego te avisará si una opción aún no existe.' });
    const go = el('button', 'btn primary', { text: 'Crear mundo' });
    go.addEventListener('click', () => {
      app.audio.resume();
      app.createWorld({
        name: name.value.trim() || 'Mundo nuevo', seedText: seed.value.trim(), type: type.value, difficulty: diff.value, size: WORLD_SIZES[size.value].size,
        structures: structI.checked, mobs: mobs.value, mode: mode.value, commands: cmdI.checked, keepInventory: keepI.checked,
      });
    });
    const back = el('button', 'btn', { text: 'Cancelar' }); back.addEventListener('click', () => this.showMain());
    const { wrap } = this._panel('Crear mundo', form, note, el('div', 'actions', null, go, back));
    this._show(wrap);
  }

  showOptions(back) {
    const app = this.app;
    const panel = buildOptionsPanel(app.settings, (k, v) => app.applySetting(k, v));
    const b = el('button', 'btn primary', { text: 'Volver' }); b.addEventListener('click', back || (() => this.showMain()));
    const { wrap } = this._panel('Opciones', panel, el('div', 'actions', null, b));
    this._show(wrap);
  }

  showControls() {
    const b = el('button', 'btn primary', { text: 'Volver' }); b.addEventListener('click', () => this.showMain());
    const { wrap } = this._panel('Controles', buildControlsPanel(), el('div', 'actions', null, b));
    this._show(wrap);
  }

  showCredits() {
    const b = el('button', 'btn primary', { text: 'Volver' }); b.addEventListener('click', () => this.showMain());
    const body = el('div', 'credits', { html: `
      <p><b>${GAME_NAME}</b> — ${VERSION}</p>
      <p>Videojuego original de bloques, supervivencia, construcción y exploración. Diseño, código, texturas, sonidos, música,
      criaturas y modelos son originales y se generan por código: no se usan recursos, nombres ni código de otros juegos.</p>
      <p>Motor 3D: <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a> r160 (licencia MIT), incluido en <code>vendor/</code>.</p>
      <p>Tecnologías: HTML, CSS, JavaScript (módulos ES), WebGL, Web Workers, WebAudio e IndexedDB.</p>
      <p class="dim">Fase 1: mundo procedural, iluminación, bloques, minería, construcción, inventario, fabricación, hornos, cofres,
      agricultura, supervivencia, ciclo día/noche, animales y monstruos, guardado.</p>` });
    const { wrap } = this._panel('Créditos', body, el('div', 'actions', null, b));
    this._show(wrap);
  }
}
