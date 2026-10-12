// Punto de entrada: crea el juego, el almacenamiento, los menús y conecta crear/cargar/salir de mundos.
import { Game } from './game.js';
import { Menus } from './menus.js';
import { SaveStore, loadSettings, newWorldId } from './save.js';
import { seedFromString } from './terrain.js';
import { VERSION, GENERATOR_VERSION, DIFFICULTY_NAMES, GAMEMODE_NAMES } from './config.js';

const TIPS = [
  'Consejo: mantén pulsado el clic izquierdo para romper bloques; cada herramienta tiene su nivel.',
  'Consejo: las antorchas y los cristales de las cuevas iluminan; la oscuridad atrae monstruos.',
  'Consejo: duerme en una cama de noche para saltar a la mañana y fijar tu punto de reaparición.',
  'Consejo: los cultivos solo crecen con luz y mejor cerca de agua (tierra arada húmeda).',
  'Consejo: C te agacha y evita que caigas por los bordes al construir.',
  'Consejo: alimenta a los animales con su comida para que se reproduzcan.',
  'Consejo: usa F3 para ver coordenadas, luz y rendimiento.',
];

class App {
  async init() {
    const canvas = document.getElementById('gl');
    this.settings = loadSettings();
    try {
      this.game = new Game(canvas, this.settings);
    } catch (e) {
      console.error(e);
      document.getElementById('fatal').classList.remove('hidden');
      document.getElementById('fatal').innerHTML = '<h2>No se pudo iniciar WebGL</h2><p>Este juego necesita un navegador con WebGL 2 activado (Chrome, Edge, Firefox o Safari recientes) y aceleración por hardware.</p><pre>' + String(e && e.message || e) + '</pre>';
      return;
    }
    this.audio = this.game.audio;
    this.ui = this.game.ui;
    this.store = await SaveStore.open();
    this.menus = new Menus(this);
    this.game.onExitRequest = () => this.exitToMenu();
    this.game.start();
    window.__app = this; window.__game = this.game;
    window.addEventListener('beforeunload', () => { if (this.game.state === 'playing') this.game.saveGame(true); });
    const params = new URLSearchParams(location.search);
    if (params.get('autostart')) { await this.autostart(params); return; }
    this.game.startPanorama();
    await this.menus.showMain();
  }

  applySetting(k, v) { this.game.applySetting(k, v); }

  async autostart(params) {
    const mode = params.get('autostart');
    this.settings.renderDistance = parseInt(params.get('rd') || '4', 10);
    const form = {
      name: 'Prueba', seedText: params.get('seed') || 'prueba', type: params.get('type') || 'normal', difficulty: params.get('diff') || 'normal',
      size: 0, structures: params.get('structures') !== '0', mobs: params.get('mobs') || 'all', mode: mode === 'peaceful' ? 'survival' : mode, commands: true, keepInventory: false,
    };
    if (mode === 'peaceful') form.difficulty = 'peaceful';
    this.menus.hide();
    const meta = this._makeMeta(form);
    meta.useWorker = params.get('worker') !== '0';
    meta.id = 'autostart-' + meta.id;
    const cs = await this.store.chunkStore(meta.id);
    await this.store.putWorld(meta);
    await this.game.startSession(meta, this.store, cs, () => {});
    window.__ready = true;
  }

  _makeMeta(f) {
    const seed = seedFromString(f.seedText);
    return {
      id: newWorldId(), name: f.name, seed, seedText: f.seedText || String(seed), type: f.type, difficulty: f.difficulty, mode: f.mode,
      size: f.size, structures: f.structures, mobs: f.mobs, commands: f.commands, keepInventory: f.keepInventory,
      genVersion: GENERATOR_VERSION, gameVersion: VERSION, created: Date.now(), lastPlayed: Date.now(), playTime: 0,
    };
  }

  async quickStart(kind) {
    const n = Math.floor(Math.random() * 900 + 100);
    const names = { survival: 'Supervivencia', creative: 'Creativo', adventure: 'Aventura', peaceful: 'Pacífico' };
    await this.createWorld({
      name: `Mundo ${names[kind]} ${n}`, seedText: '', type: 'normal', difficulty: kind === 'peaceful' ? 'peaceful' : 'normal', size: 0,
      structures: true, mobs: 'all', mode: kind === 'peaceful' ? 'survival' : kind, commands: true, keepInventory: false,
    });
  }

  async createWorld(form) {
    const meta = this._makeMeta(form);
    await this.store.putWorld(meta);
    await this.playWorld(meta.id);
  }

  async playWorld(id) {
    this.menus.hide();
    const ui = this.ui;
    ui.showLoading(true, 'Generando el mundo…', 0.03, TIPS[Math.floor(Math.random() * TIPS.length)]);
    try {
      const meta = await this.store.getWorld(id);
      if (!meta) throw new Error('El mundo no existe');
      meta.useWorker = new URLSearchParams(location.search).get('worker') !== '0';
      const cs = await this.store.chunkStore(id);
      await this.game.startSession(meta, this.store, cs, (f) => ui.showLoading(true, 'Cargando chunks…', f));
      ui.showLoading(false);
      this.showReady(meta);
    } catch (e) {
      console.error(e);
      ui.showLoading(false);
      ui.showFatal('<h2>Error al cargar el mundo</h2><pre>' + String(e && e.stack || e) + '</pre><button class="btn" onclick="location.reload()">Recargar</button>');
    }
  }

  /** El navegador exige un clic para capturar el ratón: pantalla de "listo". */
  showReady(meta) {
    const g = this.game;
    g.state = 'paused'; g.paused = true;
    const root = document.createElement('div'); root.className = 'screen-overlay ready';
    const panel = document.createElement('div'); panel.className = 'panel narrow';
    panel.innerHTML = `<h2>${meta.name}</h2><p class="center dim">${GAMEMODE_NAMES[meta.mode]} · ${DIFFICULTY_NAMES[meta.difficulty]}</p><p class="center">Haz clic para jugar</p><p class="center dim">Esc pausa · E inventario · F3 depuración · T chat</p>`;
    const b = document.createElement('button'); b.className = 'btn primary big'; b.textContent = 'Jugar';
    b.addEventListener('click', () => { this.audio.resume(); g.resume(); window.__ready = true; });
    panel.append(b); root.append(panel);
    g.ui.setScreen({ root });
  }

  async exitToMenu() {
    const ui = this.ui;
    ui.showLoading(true, 'Guardando el mundo…', 0.6, '');
    await this.game.endSession();
    ui.showLoading(false);
    this.game.startPanorama();
    await this.menus.showMain();
  }
}

new App().init().catch((e) => {
  console.error(e);
  const f = document.getElementById('fatal');
  f.classList.remove('hidden');
  f.innerHTML = '<h2>Error al iniciar</h2><pre>' + String(e && e.stack || e) + '</pre>';
});
