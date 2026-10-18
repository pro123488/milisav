// Orquestador del juego: renderizador, mundo, jugador, interacción, entidades, guardado y bucle principal.
import * as THREE from 'three';
import { World } from './world.js';
import { Terrain } from './terrain.js';
import { WorldRenderer } from './render.js';
import { Sky } from './sky.js';
import { Player } from './player.js';
import { Controls } from './controls.js';
import { DAY_LENGTH, REACH_SURVIVAL, REACH_CREATIVE, WORLD_HEIGHT as WH, SEA_LEVEL, GENERATOR_VERSION, VERSION } from './config.js';
import { Blocks, ID, B_SOUND, B_FLUID, B_REPLACEABLE, B_SOLID, B_ATTEN, B_OPAQUE } from './blocks.js';
import { Items, makeStack, rollDrops } from './items.js';
import { Inventory, Container, addToSlots } from './inventory.js';
import { RECIPES } from './crafting.js';
import { Survival } from './survival.js';
import { Mining } from './mining.js';
import { Building, supportOk, isContainerBlock } from './building.js';
import { EntityManager, ItemEntity, FallingBlock, Particles, buildModel } from './entities.js';
import { ANIMALS, createAnimal } from './animals.js';
import { MONSTERS, createMonster } from './monsters.js';
import { Spawner } from './spawner.js';
import { RandomTicks, tickFurnace } from './ticks.js';
import { FluidSim, flowVector } from './fluids.js';
import { VILLAGE_MOBS, createVillageMob } from './villagers.js';
import { villageAt, nearestVillage } from './villages.js';
import { PROFESSION_BY_STATION, villagerName } from './trading.js';
import { HandRenderer } from './hand.js';
import { UI } from './ui.js';
import { openInventoryScreen, openWorkbenchScreen, openChestScreen, openFurnaceScreen, openPauseScreen, openDeathScreen, openControlsScreen, openAchievementsScreen, openTradeScreen, openAlchemyScreen, openBestiaryScreen } from './screens.js';
import { BOSSES, BOSS_KEYS, createBoss, throwSnowball, bossForSummon } from './bosses.js';
import { tickAlchemy, ALCHEMY_SLOTS } from './alchemy.js';
import { Bestiary } from './bestiary.js';
import { nearestShrine } from './shrines.js';
import { portalFrameOK, activatePortal, deactivatePortal, findPortalNear, buildPortal, PORTAL_RING, PORTAL_TIME } from './portals.js';
import { ISLAND_Y, FLOOR_TOP } from './darkterrain.js';
import { OVERWORLD_BOSSES, Missile } from './bosses.js';
import { unstick } from './physics.js';
import { EnergySystem } from './energy.js';
import { isRail, updateRailsAround, RAIL } from './rails.js';
import { Minecart, Boat } from './vehicles.js';
import { facingFromVector } from './shapes.js';
import { AudioEngine } from './audio.js';
import { raycastBlocks } from './raycast.js';
import { chunkKey } from './chunk.js';
import { rollLoot } from './structures.js';
import { hash3, mulberry32 } from './noise.js';
import { runCommand } from './commands.js';
import { biomeName } from './biomes.js';
import { buildOptionsPanel } from './menus.js';
import { moveEntity, boxCollides } from './physics.js';
import { ACHIEVEMENTS } from './achievements.js';

export { ACHIEVEMENTS };

export class Game {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.07, 1400);
    this.camera.rotation.order = 'YXZ';
    this.controls = new Controls(canvas);
    this.sky = new Sky(this.scene);
    this.audio = new AudioEngine(settings);
    this.player = new Player();
    this.ui = new UI(this);
    this.versionText = VERSION;
    this.world = null; this.wr = null; this.meta = null;
    this.state = 'menu';           // menu | loading | playing | screen | paused | dead
    this.paused = false; this.frozen = false; this.panorama = false;
    this.time = 0.12;
    this.elapsed = 0; this.frameStats = { fps: 0, frames: 0, acc: 0 };
    this.mode = 'survival'; this.difficulty = 'normal';
    this.hit = null; this.headFluid = 0; this.handLight = 1;
    this.eating = null; this.cameraMode = 0;
    this.discovered = new Set(); this.achievements = new Set();
    this.stats = { blocksBroken: 0, blocksPlaced: 0, mobsKilled: 0, deaths: 0 };
    this.updateQueue = []; this.updateSet = new Set();
    this.sleeping = new Map();      // chunkKey → [entidades serializadas]
    this.structQueue = []; this.structDone = new Set();
    this.bobPhase = 0; this.stepAcc = 0; this.fovBoost = 0;
    this.useCooldown = 0; this.attackCharge = 1; this.saveTimer = 30; this.playTime = 0;
    this._expectUnlock = false; this._biomeTimer = 0; this.currentBiome = 2;
    this._furnaceAcc = 0; this.onExitRequest = null;
    this._wire();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this.canvas.addEventListener('click', () => { if (this.state === 'playing' && !this.controls.locked) this.controls.lock(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.openPause(); });
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // ═════════════ Panorama de fondo del menú ═════════════
  startPanorama() {
    this.endSessionObjects();
    this.panorama = true; this.state = 'menu';
    this.createWorld({ seed: 20240607, type: 'normal', structures: false, size: 0, useWorker: true, mobs: 'none' }, null, 4);
    const sp = this.world.terrain.findSpawn();
    this.pano = { x: sp.x + 0.5, z: sp.z + 0.5, y: sp.h, angle: 0.6 };
    this.time = 0.14; this.player.teleport(this.pano.x + 46, sp.h + 20, this.pano.z);
    this.ui.showHud(false);
  }

  // ═════════════ Mundo ═════════════
  createWorld(meta, store, renderDistance) {
    this.disposeWorld();
    this.world = new World({
      seed: meta.seed, type: meta.type, structures: meta.structures, size: meta.dim === 'dark' ? 0 : meta.size,
      renderDistance: renderDistance ?? this.settings.renderDistance, store, useWorker: meta.useWorker,
      dimension: meta.dim === 'dark' ? 'dark' : 'overworld',
    });
    this.dimension = this.world.dimension;
    this.sky.dark = this.dimension === 'dark';
    this.world.fancyLeaves = !!this.settings.fancyLeaves;
    this.wr = new WorldRenderer(this.scene, this.world);
    const prevUnload = this.world.onChunkUnload;
    this.world.onChunkUnload = (c) => { this.sleepChunk(c); if (this.energy) this.energy.unloadChunk(c); prevUnload(c); };
    this.world.onFreshChunk = (c, info) => this.onFreshChunk(c, info);
    this.world.onChunkLoaded = (c) => { this.wakeChunk(c); if (this.energy) this.energy.scanChunk(c); };
    this.world.onBlockChange = (x, y, z, o, n) => this.onBlockChange(x, y, z, o, n);
    this.meta = meta;
  }

  disposeWorld() {
    if (this.world) { this.world.dispose(); this.world = null; }
    if (this.wr) { this.scene.remove(this.wr.group); this.wr = null; }
  }

  endSessionObjects() {
    if (this.entities) { this.entities.clear(); }
    if (this.particles) { this.scene.remove(this.particles.mesh); this.particles = null; }
    if (this.mining) { this.mining.dispose(); this.mining = null; }
    if (this.building) { this.building.dispose(); this.building = null; }
    if (this.avatar) { this.scene.remove(this.avatar.root); this.avatar = null; }
    this.hand = null; this.entities = null;
    this.disposeWorld();
  }

  /** Empieza (o reanuda) una partida. Devuelve una promesa que se cumple cuando el entorno inicial está listo. */
  async startSession(meta, store, chunkStore, onProgress) {
    this.endSessionObjects();
    this.panorama = false; this.state = 'loading';
    // Fase 5: si la partida se guardó en la Dimensión Oscura, sus chunks están en otro almacén
    if (meta.dim === 'dark' && store) chunkStore = await store.chunkStore(meta.id + '~dark');
    this.store = store; this.chunkStore = chunkStore;
    this.mode = meta.mode; this.difficulty = meta.difficulty;
    this.createWorld(meta, chunkStore, undefined);
    const w = this.world;
    this.particles = new Particles(this.scene); this.particles.enabled = this.settings.particles;
    this.entities = new EntityManager(this);
    this.mining = new Mining(this); this.building = new Building(this);
    this.hand = new HandRenderer(this); this.spawner = new Spawner(this); this.ticks = new RandomTicks(this);
    this.fluids = new FluidSim(this);
    this.energy = new EnergySystem(this); this.riding = null;
    for (const c of w.chunks.values()) this.energy.scanChunk(c);
    this.spawner.configure(meta, this.difficulty);
    this.inventory = new Inventory(); this.survival = new Survival(this);
    this.discovered = new Set(); this.achievements = new Set(); this.stats = { blocksBroken: 0, blocksPlaced: 0, mobsKilled: 0, deaths: 0 };
    this.sleeping = new Map(); this.structQueue = []; this.structDone = new Set(this._dimData(meta).structDone || []);
    this.portalTimer = 0; this.portalCooldown = 0; this._traveling = false; this.scepterCd = 0;
    this.villages = new Map(Object.entries(meta.villages || {})); this._villageTimer = 0; this._compassTimer = 0;
    this.bestiary = new Bestiary(); this.bossKills = { ...(meta.bossKills || {}) }; this._bestTimer = 0; this.shake = 0; this.staffCd = 0; this.prismHits = 0;
    this._buildAvatar();
    const saved = meta.player;
    let sx, sz;
    this.spawnPoint = null;
    // Punto de aparición del mundo
    // (siempre del mundo normal, aunque la partida se dejara en la Dimensión Oscura)
    const wsp = (w.dimension === 'dark' ? new Terrain(meta.seed, { type: meta.type, structures: meta.structures }) : w.terrain).findSpawn();
    this.worldSpawn = { x: wsp.x + 0.5, z: wsp.z + 0.5 };
    if (saved) {
      this.inventory = Inventory.deserialize(saved.inv);
      this.survival.load(saved.sv);
      this.discovered = new Set(saved.discovered || []);
      this.achievements = new Set(saved.ach || []);
      this.stats = { ...this.stats, ...(saved.stats || {}) };
      this.bestiary = Bestiary.load(saved.best);
      this.spawnPoint = saved.spawn || null;
      this.player.yaw = saved.yaw || 0; this.player.pitch = saved.pitch || 0;
      this.time = meta.time ?? 0.12; this.playTime = meta.playTime || 0;
      const D = this._dimData(meta);
      for (const [k, list] of Object.entries(D.sleeping || {})) this.sleeping.set(+k, list);
      for (const [k, v] of Object.entries(D.be || {})) w.blockEntities.set(k, Container.deserialize(v));
      sx = saved.x; sz = saved.z;
    } else {
      this.time = 0.1; this.playTime = 0;
      sx = this.worldSpawn.x; sz = this.worldSpawn.z;
    }
    this.player.allowFlying = this.mode === 'creative';
    this.player.flying = !!(saved && saved.flying && this.mode === 'creative');
    this.currentBiome = w.terrain.biomeAt(Math.floor(sx), Math.floor(sz));
    this.saveTimer = 30;
    // Esperar a que haya chunks alrededor
    this.player.teleport(sx, WH - 4, sz);
    this.frozen = true;
    await new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        w.update(sx, sz, 14);
        const ready = w.isAreaReady(sx, sz, 2);
        n++;
        if (onProgress) onProgress(Math.min(0.95, (w.stats.meshed + w.stats.loadedFromSave) / 25));
        if (ready) resolve(); else setTimeout(tick, 12);
      };
      tick();
    });
    if (saved) this.player.teleport(saved.x, saved.y, saved.z);
    else {
      const sp = w.findGroundStand(sx, sz);
      if (sp) this.player.teleport(sp.x, sp.y, sp.z);
      else { let y = w.findStandY(Math.floor(sx), Math.floor(sz)); if (y < 0) y = SEA_LEVEL + 20; this.player.teleport(sx, y, sz); }
    }
    // si el sitio guardado estuviera bloqueado, la física lo corrige
    if (!saved) { this.spawner.initialFill(36); }
    this.frozen = false;
    this.ui.showHud(true);
    this.audio.startMusic();
    this.state = 'playing';
    if (this.settings.renderDistance !== w.renderDistance) w.setRenderDistance(this.settings.renderDistance);
    if (meta.genVersion !== undefined && meta.genVersion !== GENERATOR_VERSION) this.ui.toast('Este mundo se creó con otra versión del generador: el terreno nuevo podría no encajar.');
    return true;
  }

  async endSession() {
    if (this._travelPromise) await this._travelPromise; // no guardar a mitad de un viaje entre dimensiones
    if (this.world && this.state !== 'menu') await this.saveGame(true);
    this.controls.unlock();
    this.ui.closeScreen(true);
    this.ui.showHud(false);
    this.audio.stopMusic();
    this.state = 'menu'; this.paused = false;
  }

  // ═════════════ Entrada ═════════════
  _wire() {
    const c = this.controls;
    c.onKeyDown = (code, e) => this.onKey(code, e);
    c.onLockChange = (locked, error) => this.onLockChange(locked, error);
    c.onMouseDown = (b) => this.onMouseDown(b);
    c.onWheel = (d) => { if (this.state === 'playing') this.inventory.selected = (this.inventory.selected + d + 9) % 9; };
    const ci = this.ui.chatInput;
    ci.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const t = ci.value.trim();
        this.ui.closeChat();
        if (t) { this.ui.chat('> ' + t, 'me'); const r = t.startsWith('/') ? runCommand(this, t) : (this.meta.commands && t ? runCommand(this, t) : t); if (r) this.ui.chat(r, 'sys'); }
        this.afterChat();
      } else if (e.key === 'Escape') { this.ui.closeChat(); this.afterChat(); }
    });
  }

  afterChat() { if (this.state === 'playing') this.controls.lock(); }

  onLockChange(locked, error) {
    if (locked) { if (this.state === 'screen' && !this.ui.screen) this.state = 'playing'; return; }
    if (error) { this.ui.toast('El navegador no permitió capturar el ratón. Pulsa en el juego otra vez o ábrelo en su propia pestaña.', 6000); return; }
    if (this._expectUnlock) { this._expectUnlock = false; return; }
    if (this.state === 'playing' && !this.ui.hasScreen) this.openPause();
  }

  onKey(code, e) {
    if (this.state === 'menu' || this.state === 'loading') return;
    if (this.ui.chatOpen) return;
    if (code === 'Escape') {
      if (this.state === 'paused') { this.resume(); return; }
      if (this.ui.screen && this.state === 'screen') { this.closeScreen(); return; }
      if (this.state === 'dead') return;
      return;
    }
    if (this.state === 'screen') {
      if (code === 'KeyE' && this.ui.screen && !this.ui.screen.keepOnE) this.closeScreen();
      return;
    }
    if (this.state !== 'playing') return;
    if (code === 'F3') { this.ui.debug = !this.ui.debug; return; }
    if (code === 'F1') { this.ui.hudHidden = !this.ui.hudHidden; this.ui.hud.classList.toggle('nohud', this.ui.hudHidden); return; }
    if (code === 'KeyV') { this.cameraMode = (this.cameraMode + 1) % 3; return; }
    if (code === 'KeyE') { this.openInventory(); return; }
    if (code === 'KeyB') { this.openBestiary(); return; }
    if (code === 'KeyT' || code === 'Slash') { e.preventDefault(); this.ui.openChat(code === 'Slash' ? '/' : ''); return; }
    if (code === 'KeyQ') { this.dropSelected(e.shiftKey); return; }
    if (code.startsWith('Digit')) { const n = parseInt(code.slice(5), 10); if (n >= 1 && n <= 9) this.inventory.selected = n - 1; }
  }

  onMouseDown(button) {
    if (this.state !== 'playing' || this.paused) return;
    if (button === 0) this.tryAttack(true);
    else if (button === 2) { this.useCooldown = 0; this.useItem(true); }
    else if (button === 1 && this.mode === 'creative' && this.hit) {
      const id = this.world.getBlock(this.hit.x, this.hit.y, this.hit.z);
      const it = Items.pickFor(id);
      if (it) {
        const inv = this.inventory;
        const have = inv.slots.findIndex((s, i) => i < 9 && s && s.i === it.id);
        if (have >= 0) inv.selected = have;
        else { inv.slots[inv.selected] = makeStack(it.id, it.stack); }
      }
    }
  }

  // ═════════════ Pantallas ═════════════
  _openScreen(screen) {
    this.state = 'screen'; this._expectUnlock = true;
    this.mining && this.mining.reset();
    this.ui.setScreen(screen);
    this.controls.unlock();
    this.audio.play('open');
    if (screen.refresh) screen.refresh();
  }
  openInventory() { this._openScreen(openInventoryScreen(this)); }
  openCrafting(station) { this._openScreen(openWorkbenchScreen(this)); void station; }
  closeScreen() { this.ui.closeScreen(); }
  onScreenClosed() {
    if (this.state === 'screen' || this.state === 'paused') { this.state = 'playing'; this.paused = false; this.controls.lock(); }
  }

  getBlockEntity(x, y, z, type, size) {
    const k = this.world.beKey(x, y, z);
    let be = this.world.blockEntities.get(k);
    if (!be) { be = new Container(size, type); if (type === 'furnace') be.extra = { burn: 0, burnMax: 0, cook: 0 }; if (type === 'alchemy') be.extra = { brew: 0 }; this.world.blockEntities.set(k, be); }
    return be;
  }
  openChest(x, y, z) {
    const be = this.getBlockEntity(x, y, z, 'chest', 27);
    const key = this.world.beKey(x, y, z);
    if (be.loot && !this.achievements.has('cofre')) this.achieve('cofre');
    void key;
    this._openScreen(openChestScreen(this, be));
  }
  openFurnace(x, y, z) {
    const be = this.getBlockEntity(x, y, z, 'furnace', 3);
    this._openScreen(openFurnaceScreen(this, be));
  }
  /** Dispensador (9 huecos) y tolva (5): misma pantalla que el cofre. */
  openMachine(x, y, z, kind) {
    const be = this.getBlockEntity(x, y, z, kind, kind === 'dispenser' ? 9 : 5);
    this._openScreen(openChestScreen(this, be, kind === 'dispenser' ? 'Dispensador' : 'Tolva'));
  }
  /** Lanza una bola de nieve desde un punto (dispensadores). */
  throwFrom(x, y, z, dx, dy, dz) {
    const sp = 18;
    this.entities.add(new Missile(this, { x, y, z, vx: dx * sp, vy: dy * sp + 2, vz: dz * sp, color: 0xeef4fb, size: 0.22, gravity: 14, dmg: 0, owner: null, hitsPlayer: false, hitsMobs: true, kind: 'snow', life: 4, onHit: (m, t) => { if (t && t.onSnowball) t.onSnowball(); } }));
  }
  openAlchemy(x, y, z) {
    const be = this.getBlockEntity(x, y, z, 'alchemy', ALCHEMY_SLOTS);
    this._openScreen(openAlchemyScreen(this, be));
  }
  openBestiary() {
    const scr = openBestiaryScreen(this, () => this.closeScreen());
    scr.keepOnE = false;
    this._openScreen(scr);
  }
  openPause() {
    if (this.state !== 'playing') return;
    if (this._traveling) { this._pauseAfterTravel = true; return; } // se pausa al terminar el viaje
    this.state = 'paused'; this.paused = true; this._expectUnlock = false;
    this.controls.unlock();
    const show = () => this.ui.setScreen(openPauseScreen(this, {
      onResume: () => this.resume(),
      onOptions: () => { const root = document.createElement('div'); root.className = 'screen-overlay dim'; const panel = document.createElement('div'); panel.className = 'panel'; panel.innerHTML = '<h2>Opciones</h2>'; panel.append(buildOptionsPanel(this.settings, (k, v) => this.applySetting(k, v))); const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = 'Volver'; b.onclick = show; panel.append(b); root.append(panel); this.ui.setScreen({ root }); },
      onControls: () => this.ui.setScreen(openControlsScreen(show)),
      onAchievements: () => this.ui.setScreen(openAchievementsScreen(this, show)),
      onBestiary: () => this.ui.setScreen(openBestiaryScreen(this, show)),
      onQuit: () => { if (this.onExitRequest) this.onExitRequest(); },
    }));
    show();
  }
  resume() { this.ui.closeScreen(true); this.state = 'playing'; this.paused = false; this.controls.lock(); }

  applySetting(key, v) {
    switch (key) {
      case 'renderDistance': if (this.world) this.world.setRenderDistance(v); break;
      case 'masterVolume': case 'musicVolume': this.audio.applyVolumes(); break;
      case 'particles': if (this.particles) this.particles.enabled = v; break;
      case 'fancyLeaves': if (this.world) { this.world.fancyLeaves = v; for (const c of this.world.chunks.values()) c.meshDirty = true; } break;
      default: break;
    }
  }

  setMode(m) {
    this.mode = m; this.meta.mode = m;
    this.player.allowFlying = m === 'creative';
    if (m !== 'creative') this.player.flying = false;
  }
  setDifficulty(d) {
    this.difficulty = d; this.meta.difficulty = d;
    this.spawner.configure(this.meta, d);
    if (d === 'peaceful') for (const e of this.entities.list) {
      if (e.isBoss && !e.removed && e.deathTime < 0) e.sleepAgain(); // devuelve la ofrenda
      else if (MONSTERS[e.type] || e.isPylon) e.removed = true;
    }
  }

  // ═════════════ Muerte y reaparición ═════════════
  onPlayerDeath(cause, source) {
    this.stats.deaths++;
    if (this.riding) this.dismount();
    const p = this.player;
    if (!this.meta.keepInventory && this.mode !== 'creative') {
      for (const s of this.inventory.takeAll()) this.dropItem(s, p.x, p.y + 1, p.z, 3);
    }
    this.eating = null; this.mining.reset();
    this.state = 'dead'; this._expectUnlock = true;
    this.controls.unlock();
    this.ui.setScreen(openDeathScreen(this, cause, {
      onRespawn: () => this.respawn(),
      onQuit: () => { if (this.onExitRequest) this.onExitRequest(); },
    }));
    void source;
  }
  respawn() {
    this.survival.respawn();
    if (this.dimension === 'dark') { // se reaparece en el mundo normal
      this.ui.closeScreen(true); this.state = 'playing'; this.paused = false;
      this.travel('overworld', null, { respawn: true });
      this.controls.lock();
      return;
    }
    this.teleportToSpawn();
    this.ui.closeScreen(true);
    this.state = 'playing'; this.paused = false;
    this.controls.lock();
  }
  teleportToSpawn() {
    const sp = this.spawnPoint || { x: this.worldSpawn.x, z: this.worldSpawn.z };
    const w = this.world;
    if (sp.y !== undefined) { this.player.teleport(sp.x, sp.y, sp.z); return; }
    this.player.teleport(sp.x, WH - 4, sp.z); this.frozen = true;
    const tryFind = () => {
      if (!this.world) return;
      if (w.isLoaded(Math.floor(sp.x), Math.floor(sp.z))) {
        const gs = w.findGroundStand(sp.x, sp.z);
        if (gs) this.player.teleport(gs.x, gs.y, gs.z);
        else { const y = w.findStandY(Math.floor(sp.x), Math.floor(sp.z)); this.player.teleport(sp.x, y > 0 ? y : SEA_LEVEL + 20, sp.z); }
        this.frozen = false;
      } else setTimeout(tryFind, 100);
    };
    tryFind();
  }

  sleep(x, y, z) {
    if (this.dimension === 'dark') { this.ui.toast('En la Dimensión Oscura no se puede dormir'); return; }
    const night = this.time > 0.54 && this.time < 0.97;
    const hostile = this.entities.count((e) => MONSTERS[e.type] && !e.removed && Math.hypot(e.x - x, e.z - z) < 10);
    this.spawnPoint = { x: x + 0.5, y: y + 1, z: z + 0.5 };
    if (!night) { this.ui.toast('Solo puedes dormir de noche. Punto de reaparición guardado.'); return; }
    if (hostile) { this.ui.toast('No puedes dormir: hay monstruos cerca'); return; }
    this.time = 0.01;
    this.ui.centerMessage('Has dormido hasta el amanecer');
    this.ui.toast('Punto de reaparición guardado');
    this.achieve('dormir');
  }

  // ═════════════ Objetos y logros ═════════════
  achieve(id) {
    if (this.achievements.has(id)) return;
    this.achievements.add(id);
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a) { this.ui.toast(`🏆 Logro: ${a.name} — ${a.desc}`, 5000); this.audio.play('levelup'); }
  }

  /** Se llama al obtener un objeto (recoger, fabricar, fundir...). Desbloquea recetas y logros. */
  onItemObtained(key) {
    if (!this.discovered.has(key)) {
      this.discovered.add(key);
      const newRecipes = RECIPES.filter((r) => r.unlock === key);
      if (newRecipes.length && this.mode !== 'creative') this.ui.toast(`Nuevas recetas desbloqueadas (${newRecipes.length})`);
    }
    if (key.startsWith('log_')) this.achieve('tronco');
    else if (key === 'workbench') this.achieve('mesa');
    else if (key.endsWith('_pickaxe')) this.achieve('pico');
    else if (key === 'cobble') this.achieve('adoquin');
    else if (key === 'furnace') this.achieve('horno');
    else if (key === 'iron_ingot') this.achieve('hierro');
    else if (key === 'crystal_shard') this.achieve('cristal');
    else if (key === 'raw_noctisite' || key === 'noctisite_ingot') this.achieve('noctisita');
    else if (key === 'wheat') this.achieve('cosecha');
    else if (key === 'bread') this.achieve('pan');
    else { const it = Items.get(key); if (it && it.armor) this.achieve('armadura'); }
  }

  canPickup(stack) { return !this.survival.dead && this.inventory.canFit(stack); }
  pickup(e) {
    const rest = this.inventory.add(e.stack);
    const got = rest ? e.stack.n - rest.n : e.stack.n;
    if (got > 0) { this.audio.play('pickup', e.x, e.y, e.z); this.onItemObtained(Items.get(e.stack.i).key); }
    if (rest) e.stack.n = rest.n; else e.removed = true;
  }

  dropItem(stack, x, y, z, speed = 1.6) {
    if (!stack || stack.n <= 0) return null;
    const items = this.entities.list.filter((e) => e.type === 'item');
    if (items.length > 160) items[0].removed = true;
    const e = new ItemEntity(this, stack);
    e.setPos(x, y, z);
    const a = Math.random() * Math.PI * 2;
    e.vx = Math.cos(a) * speed * Math.random(); e.vz = Math.sin(a) * speed * Math.random(); e.vy = 3 + Math.random() * 2;
    this.entities.add(e);
    return e;
  }
  dropFromPlayer(stack) {
    if (!stack || stack.n <= 0) return;
    const p = this.player, d = p.lookDir();
    const e = new ItemEntity(this, stack, 1.6);
    e.setPos(p.x + d.x * 0.4, p.eyeY - 0.3, p.z + d.z * 0.4);
    e.vx = d.x * 4.2; e.vy = d.y * 3 + 1.2; e.vz = d.z * 4.2;
    this.entities.add(e);
  }
  dropSelected(whole) {
    const inv = this.inventory, s = inv.getSelected();
    if (!s) return;
    const n = whole ? s.n : 1;
    this.dropFromPlayer({ i: s.i, n, d: s.d });
    s.n -= n; if (s.n <= 0) inv.slots[inv.selected] = null;
    this.hand && this.hand.swing();
  }

  lightAt(x, y, z) {
    const w = this.world, atm = this.sky.atm;
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    let sky = w.getSky(fx, fy, fz) / 15 * atm.sun, blk = w.getBlockLight(fx, fy, fz) / 15;
    const id = w.getBlock(fx, fy, fz);
    if (B_ATTEN[id] >= 15 && !B_OPAQUE[id]) { // dentro de una escalera: luz de las celdas de alrededor
      sky = 0; blk = 0;
      for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
        const n = w.getBlock(fx + dx, fy + dy, fz + dz);
        if (B_OPAQUE[n] || B_ATTEN[n] >= 15) continue;
        sky = Math.max(sky, w.getSky(fx + dx, fy + dy, fz + dz) / 15 * atm.sun); blk = Math.max(blk, w.getBlockLight(fx + dx, fy + dy, fz + dz) / 15);
      }
    }
    const c = (l) => Math.pow(0.8, 15 * (1 - l));
    return Math.min(1, Math.max(c(sky), c(blk), 0.13) * this.settings.brightness);
  }

  // ═════════════ Criaturas ═════════════
  spawnMob(key, x, y, z) {
    const m = ANIMALS[key] ? createAnimal(this, key) : MONSTERS[key] ? createMonster(this, key) : VILLAGE_MOBS[key] ? createVillageMob(this, key) : BOSSES[key] ? createBoss(this, key) : null;
    if (!m) return null;
    m.setPos(x, y, z);
    this.entities.add(m);
    return m;
  }
  mobKilled(mob, source) {
    if (MONSTERS[mob.type]) { this.stats.mobsKilled++; this.achieve('monstruo'); }
    if (source === this.player || mob.lastHitBy === this.player || mob.isBoss) this.bestiary.kill(mob.type);
    if (mob.isVillager && (source === this.player || mob.lastHitBy === this.player)) this.villageReputation(mob.village, -20, mob);
  }
  // ═════════════ Vehículos (Fase 6) ═════════════
  /** Sube al vehículo `v` (vagoneta o barca). */
  mount(v) {
    if (this.riding || v.rider) return false;
    this.riding = v; v.rider = { push: false, ctl: null };
    this.mining.reset(); this.eating = null;
    const [sx, sy, sz] = v.seat(), p = this.player; p.x = sx; p.y = sy; p.z = sz; p.vx = p.vy = p.vz = 0; p.flying = false; // sentarse ya
    this.ui.toast(v.type === 'minecart' ? 'En la vagoneta: W para avanzar, C para bajar' : 'En la barca: W/S remar, A/D girar, C para bajar', 2600);
    this.audio.play('door', v.x, v.y, v.z);
    return true;
  }
  /** Baja del vehículo y deja al jugador de pie al lado (o encima si no hay sitio). */
  dismount() {
    const v = this.riding, p = this.player;
    if (!v) return;
    this.riding = null; v.rider = null;
    const w = this.world;
    const spots = [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]];
    let placed = false;
    for (const [dx, dz] of spots) {
      const x = v.x + dx, z = v.z + dz;
      for (const dy of [0, 1, -1]) {
        const y = Math.floor(v.y) + dy + 0.01;
        if (!boxCollides(w, x, y, z, p.w, p.h) && B_SOLID[w.getBlock(Math.floor(x), Math.floor(y) - 1, Math.floor(z))]) { p.teleport(x, y, z); placed = true; break; }
      }
      if (placed) break;
    }
    if (!placed) { p.teleport(v.x, v.y + 1, v.z); unstick(w, p); }
  }
  /** Fotograma montado: el vehículo manda; el jugador va sentado (la cámara sigue mirando libremente). */
  _ride(dt, move) {
    const v = this.riding, p = this.player;
    if (!v || v.removed) { this.riding = null; return; }
    if (move.crouch) { this.dismount(); return; }
    // si algo movió al jugador lejos del asiento (/tp, /spawn, reaparecer…), se baja sin volver a sentarlo
    { const [sx, sy, sz] = v.seat(); if (Math.abs(p.x - sx) > 2 || Math.abs(p.y - sy) > 2 || Math.abs(p.z - sz) > 2) { this.riding = null; v.rider = null; return; } }
    const d = p.lookDir();
    v.rider.push = move.fwd > 0;
    v.rider.look = facingFromVector(d.x, d.z);
    v.rider.ctl = { fwd: move.fwd, turn: -move.strafe };
    const [sx, sy, sz] = v.seat();
    p.x = sx; p.y = sy; p.z = sz; p.vx = p.vy = p.vz = 0; p.onGround = true; p.fallDistance = 0; p.moved = 0; p.landed = null;
    // fluidos en el asiento (como hace Player.update): lava que quema, cabeza bajo el agua…
    const w = this.world, fx = Math.floor(sx), fz = Math.floor(sz);
    const feetF = w.fluidAt(fx, Math.floor(sy + 0.1), fz), bodyF = w.fluidAt(fx, Math.floor(sy + 0.9), fz), headF = w.fluidAt(fx, Math.floor(sy + p.eye), fz);
    p.inLava = feetF === 2 || bodyF === 2;
    p.inWater = v.type !== 'boat' && (feetF === 1 || bodyF === 1); // en una barca a flote no se está "en el agua"
    p.headInWater = headF === 1;
  }

  // ═════════════ Dimensiones (Fase 5) ═════════════
  /** Datos propios de una dimensión dentro de los metadatos del mundo (el mundo normal usa la raíz). */
  _dimData(meta, dim = meta.dim) {
    if (dim === 'dark') return (meta.dark = meta.dark || {});
    return meta;
  }
  /** Clic derecho en un núcleo de portal: con la Llave umbría lo activa si el marco está completo. */
  usePortalCore(x, y, z) {
    const w = this.world, st = this.inventory.getSelected(), it = st ? Items.get(st.i) : null;
    if (w.getBlock(x, y, z) === ID.PORTAL_CORE_ACTIVE) { this.ui.toast('El portal está abierto: entra en el velo para viajar'); return true; }
    if (!it || it.key !== 'umbral_key') { this.ui.toast('Núcleo de portal: rodéalo con 8 bloques de vidrio volcánico y actívalo con la Llave umbría', 4500); return true; }
    if (!portalFrameOK(w, x, y, z)) { this.ui.toast('Faltan bloques de vidrio volcánico alrededor del núcleo (3×3 en el mismo nivel)'); this.audio.play('deny'); return true; }
    if (!activatePortal(w, x, y, z)) { this.ui.toast('Deja libres los dos bloques que hay encima del núcleo'); this.audio.play('deny'); return true; }
    this.audio.play('summon', x, y, z);
    this.particles.emit(x + 0.5, y + 1.5, z + 0.5, 0xb070ff, 30, 3, 1);
    this.ui.centerMessage('El portal umbrío se abre');
    return true;
  }
  /** Comprueba si el jugador está dentro del velo de un portal y, tras PORTAL_TIME s, viaja. */
  _updatePortal(dt) {
    const p = this.player, w = this.world;
    this.portalCooldown = Math.max(0, this.portalCooldown - dt);
    const inVeil = [p.y + 0.2, p.y + 1.2].some((yy) => w.getBlock(Math.floor(p.x), Math.floor(yy), Math.floor(p.z)) === ID.PORTAL_VEIL);
    if (!inVeil || this._traveling || this.state !== 'playing') { if (!inVeil) this.portalCooldown = Math.min(this.portalCooldown, 0.5); this.portalTimer = 0; return; }
    if (this.portalCooldown > 0) return;
    this.portalTimer += dt;
    if (Math.random() < 0.5) this.particles.emit(p.x, p.y + 1, p.z, 0xb070ff, 2, 1.5, 0.6);
    if (this.portalTimer >= PORTAL_TIME) {
      this.portalTimer = 0;
      let core = null;
      for (let k = 0; k <= 3 && !core; k++) if (w.getBlock(Math.floor(p.x), Math.floor(p.y) - k, Math.floor(p.z)) === ID.PORTAL_CORE_ACTIVE) core = [Math.floor(p.x), Math.floor(p.y) - k, Math.floor(p.z)];
      this.travel(this.dimension === 'dark' ? 'overworld' : 'dark', core);
    }
  }
  /** Reglas propias de la Dimensión Oscura: sin brújula de aldeas; logro al encontrar la ciudadela. */
  _updateDarkDimension(dt) {
    this._darkTimer = (this._darkTimer || 0) - dt;
    if (this._darkTimer > 0) return;
    this._darkTimer = 1;
    this.ui.setCompass(null);
    const c = this.world.terrain.citadel, p = this.player;
    if (c && Math.hypot(c.x - p.x, c.z - p.z) < 40 && !this.achievements.has('ciudadela')) { this.achieve('ciudadela'); this.ui.centerMessage('Ciudadela del Soberano', 3500); }
  }
  /** Altura a la que construir el portal de llegada en (x,z) de la dimensión actual. */
  _portalSiteY(x, z) {
    const w = this.world;
    let y = w.findStandY(x, z);
    if (this.dimension === 'dark') { if (y < FLOOR_TOP + 4) y = ISLAND_Y; } // sobre el abismo: plataforma flotante
    else if (y < 2) y = SEA_LEVEL + 1;
    return Math.min(WH - 8, y);
  }
  /**
   * Viaja a la otra dimensión: guarda la actual, cambia de mundo (otro generador y otro almacén de chunks), espera a
   * que se cargue el destino y busca un portal cercano o construye uno de vuelta. Devuelve una promesa.
   */
  travel(target, fromCore = null, opts = {}) {
    if (this._traveling || target === this.dimension || !this.meta) return Promise.resolve(false);
    this._traveling = true;
    this._travelPromise = this._travel(target, fromCore, opts).finally(() => { this._travelPromise = null; });
    return this._travelPromise;
  }
  /** opts.respawn: volver al mundo normal tras morir (se carga el punto de reaparición; no se construye portal). */
  async _travel(target, fromCore, opts) {
    const p = this.player, meta = this.meta;
    // una pantalla abierta (cofre, horno…) apuntaría al contenedor de la dimensión que se deja
    if (this.ui.screen) { this.ui.closeScreen(true); if (this.state === 'screen') this.state = 'playing'; }
    let tx = Math.floor(fromCore ? fromCore[0] : p.x), tz = Math.floor(fromCore ? fromCore[2] : p.z);
    if (opts.respawn) { const sp = this.spawnPoint || this.worldSpawn; tx = Math.floor(sp.x); tz = Math.floor(sp.z); }
    if (target === 'overworld' && meta.size > 0) { // mundo con límites: el portal de llegada queda dentro
      const h = meta.size / 2 - 6;
      tx = Math.max(-h, Math.min(h - 1, tx)); tz = Math.max(-h, Math.min(h - 1, tz));
    }
    this.ui.centerMessage(target === 'dark' ? 'Entrando en la Dimensión Oscura…' : 'Volviendo al mundo…', 2500);
    this.audio.play('summon');
    this.frozen = true;
    try {
      meta.portals = meta.portals || {};
      if (fromCore) meta.portals[this.dimension] = fromCore;
      await this.saveGame(true, true);     // guarda chunks y criaturas de la dimensión que se deja
      this.entities.clear();
      this.sleeping = new Map(); this.structQueue = []; this.updateQueue = []; this.updateSet = new Set();
      this.mining.reset(); this.eating = null;
      meta.dim = target;
      const cs = this.store ? await this.store.chunkStore(target === 'dark' ? meta.id + '~dark' : meta.id) : null;
      this.chunkStore = cs;
      if (this.riding) this.dismount();
      this.createWorld(meta, cs);
      this.fluids = new FluidSim(this);
      this.energy = new EnergySystem(this);
      const D = this._dimData(meta);
      this.structDone = new Set(D.structDone || []);
      for (const [k, list] of Object.entries(D.sleeping || {})) this.sleeping.set(+k, list);
      for (const [k, v] of Object.entries(D.be || {})) this.world.blockEntities.set(k, Container.deserialize(v));
      p.teleport(tx + 0.5, WH - 4, tz + 0.5);
      await new Promise((resolve) => {
        const t0 = performance.now();
        const tick = () => {
          if (!this.world) return resolve();
          this.world.update(tx, tz, 14);
          if (this.world.isAreaReady(tx, tz, 2) || performance.now() - t0 > 60000) resolve(); else setTimeout(tick, 16);
        };
        tick();
      });
      if (!opts.respawn) {
        let core = findPortalNear(this.world, tx, tz, 20);
        if (!core) {
          const y = this._portalSiteY(tx, tz);
          buildPortal(this.world, tx, y, tz, target === 'dark' ? ID.UMBRAL_STONE : ID.COBBLE);
          core = [tx, y, tz];
        }
        meta.portals[target] = core;
        p.teleport(core[0] + 0.5, core[1] + 1, core[2] + 2.5);
        unstick(this.world, p);
        this.portalCooldown = 3; this.portalTimer = 0;
        if (target === 'dark') this.achieve('portal');
        this.ui.centerMessage(target === 'dark' ? 'Dimensión Oscura' : biomeName(this.world.terrain.biomeAt(tx, tz)), 3000);
      }
      if (opts.respawn) this.teleportToSpawn(); // la zona ya está cargada: coloca al jugador en el acto
      await this.saveGame(true, true);
    } catch (e) {
      console.error('Error al viajar entre dimensiones', e);
      this.ui.toast('⚠ No se pudo completar el viaje');
    } finally {
      this.frozen = false; this._traveling = false;
      if (this._pauseAfterTravel) { this._pauseAfterTravel = false; if (!this.controls.locked) this.openPause(); }
    }
    return true;
  }

  // ═════════════ Jefes ═════════════
  /** Clic derecho en un altar: con la ofrenda en la mano despierta a su jefe; si no, explica qué pide. */
  useAltar(x, y, z, b) {
    const def = BOSSES[b.boss];
    if (!def) return false;
    const inv = this.inventory, st = inv.getSelected(), it = st ? Items.get(st.i) : null;
    this.achieve('santuario');
    const active = this.entities.list.find((e) => e.isBoss && !e.removed && e.deathTime < 0 && Math.hypot(e.x - x, e.z - z) < 64);
    if (active) { this.ui.toast(`${active.def.short} ya está despierto`); return true; }
    if (!it || it.key !== def.summon) {
      const want = bossForSummon(it && it.key);
      this.ui.toast(want ? `Esa ofrenda es para otro altar (${BOSSES[want].short})` : `${b.name}: ofrece ${Items.get(def.summon).name} para despertar al ${def.name}`, 4500);
      return true;
    }
    if (this.difficulty === 'peaceful') { this.ui.toast('Los jefes no despiertan en dificultad Pacífica'); return true; }
    if (this.mode !== 'creative') inv.consumeSelected(1);
    this.summonBoss(b.boss, x, y, z);
    return true;
  }
  /** Despierta al jefe `key` junto al altar (x,y,z). */
  summonBoss(key, x, y, z) {
    const def = BOSSES[key];
    if (!def) return null;
    const w = this.world;
    let pos = null;
    for (const [dx, dz] of [[0, 4], [4, 0], [0, -4], [-4, 0], [0, 2], [2, 0]]) {
      const px = x + 0.5 + dx, pz = z + 0.5 + dz, py = y + (def.flying ? 3 : 1);
      if (!boxCollides(w, px, py, pz, def.w, def.h)) { pos = [px, py, pz]; break; }
    }
    if (!pos) pos = [x + 0.5, y + 2, z + 0.5];
    const m = this.spawnMob(key, pos[0], pos[1], pos[2]);
    if (!m) return null;
    m.home = { x, y, z };
    this.audio.play('summon', x, y, z);
    this.ui.centerMessage(`¡${def.name} despierta!`);
    this.particles.emit(x + 0.5, y + 1.2, z + 0.5, def.color, 30, 4, 1);
    return m;
  }
  onBossDefeated(boss) {
    const def = boss.def;
    this.bossKills[def.key] = (this.bossKills[def.key] || 0) + 1;
    this.achieve(def.achievement);
    if (OVERWORLD_BOSSES.every((k) => this.bossKills[k])) this.achieve('cazajefes');
    this.ui.centerMessage(`¡${def.name} derrotado!`);
    if (def.key === 'sovereign' && this.bossKills.sovereign === 1) {
      const lines = ['La corona del Soberano se apaga y la penumbra se aclara un poco.', 'La noche que sobraba vuelve a repartirse entre los días del mundo.', 'Los portales seguirán abiertos: la Dimensión Oscura ya no tiene dueño. Gracias por jugar a BLOCKWORLD ULTIMATE.'];
      lines.forEach((t, i) => setTimeout(() => this.ui && this.ui.chat('✦ ' + t, 'sys'), 2500 + i * 3500));
    }
    this.audio.play('levelup');
  }
  /** Barra de vida y música del jefe más cercano, enfriamientos y fichas nuevas del bestiario. */
  _updateBosses(dt) {
    const p = this.player;
    this.staffCd = Math.max(0, this.staffCd - dt); this.scepterCd = Math.max(0, (this.scepterCd || 0) - dt);
    this.shake = Math.max(0, this.shake - dt);
    let best = null, bd = 56;
    for (const e of this.entities.list) {
      if (!e.isBoss || e.removed || e.deathTime >= 0) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < bd) { bd = d; best = e; }
    }
    this.activeBoss = best;
    if (best) {
      const phase = best.intro > 0 ? 'Despertando…' : best.shield ? 'Escudo prismático: rompe los pilares' : best.cool > 0 ? 'Enfriado: recibe el doble de daño' : best.stun > 0 ? 'Aturdida: recibe el doble de daño' : `Fase ${best.phase}: ${best.phaseName}`;
      const sig = best.def.name + Math.round(best.frac * 400) + phase;
      if (sig !== this._bossSig) { this._bossSig = sig; this.ui.setBoss({ name: best.def.name, frac: best.frac, phase }); }
      this.audio.setCombat(best.def.music);
    } else if (this._bossSig) { this._bossSig = null; this.ui.setBoss(null); this.audio.setCombat(null); }
    // Bestiario: criaturas vistas de cerca
    this._bestTimer -= dt;
    if (this._bestTimer <= 0) {
      this._bestTimer = 0.5;
      for (const e of this.entities.list) {
        if (e.removed || !e.def || e.deathTime >= 0 || e.burrowed || e.isPylon) continue;
        if (!(ANIMALS[e.type] || MONSTERS[e.type] || VILLAGE_MOBS[e.type] || BOSSES[e.type])) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z) < 14 && this.bestiary.see(e.type) && this.state === 'playing') this.ui.toast(`📖 Bestiario: ${e.def.name} (pulsa B)`, 2200);
      }
    }
  }

  sleepEntity(e) {
    if (!e.persistent || e.removed) return;
    const k = chunkKey(Math.floor(e.x / 16), Math.floor(e.z / 16));
    if (!this.sleeping.has(k)) this.sleeping.set(k, []);
    const list = this.sleeping.get(k);
    // los objetos sueltos tienen tope (son efímeros); animales y criaturas persistentes se guardan siempre
    if (e.type === 'item' && list.reduce((n, q) => n + (q.t === 'item' ? 1 : 0), 0) >= 40) return;
    list.push(e.serialize());
  }
  sleepChunk(c) {
    if (!this.entities) return;
    for (const e of this.entities.list) {
      if (e.removed) continue;
      if (Math.floor(e.x / 16) === c.cx && Math.floor(e.z / 16) === c.cz) {
        if (e.isBoss && e.deathTime < 0 && e.sleepAgain) { e.sleepAgain(); continue; }
        if (e.persistent) this.sleepEntity(e);
        e.removed = true;
      }
    }
  }
  wakeChunk(c) {
    const list = this.sleeping.get(c.key);
    if (!list || !this.entities) return;
    this.sleeping.delete(c.key);
    for (const s of list) this.restoreEntity(s);
  }
  restoreEntity(s) {
    if (s.t === 'minecart' || s.t === 'boat') {
      const v = s.t === 'minecart' ? new Minecart(this) : new Boat(this);
      v.setPos(s.x, s.y, s.z); v.initFromData(s.vd);
      this.entities.add(v); return;
    }
    if (s.t === 'item') {
      const e = new ItemEntity(this, { i: s.s[0], n: s.s[1], d: s.s[2] }, 0.2);
      e.setPos(s.x, s.y, s.z); e.life = s.life ?? 300; this.entities.add(e); return;
    }
    const m = this.spawnMob(s.t, s.x, s.y, s.z);
    if (!m) return;
    m.hp = s.hp ?? m.hp;
    if (s.baby) m.setBaby(true);
    m.growAge = s.age || 0; m.tamed = !!s.tamed; m.trust = s.trust || 0; m.persistentFlag = !!s.pf; m.breedCd = s.love || 0;
    if (s.leash && m.attachLeash) m.attachLeash(s.leash === 'p' ? 'player' : { x: s.leash[0], y: s.leash[1], z: s.leash[2] });
    if (s.vd && m.initFromData) m.initFromData(s.vd);
  }

  // ═════════════ Chunks generados: cofres y criaturas de estructuras ═════════════
  onFreshChunk(c, info) {
    const w = this.world;
    for (const ch of info.chests) {
      const k = w.beKey(ch.x, ch.y, ch.z);
      if (w.blockEntities.has(k)) continue;
      const be = new Container(27, 'chest'); be.loot = true;
      const rnd = mulberry32((hash3(ch.x, ch.y, ch.z, w.seed) * 4294967296) >>> 0);
      for (const l of rollLoot(ch.table, rnd, 4 + Math.floor(rnd() * 4))) {
        let slot = Math.floor(rnd() * 27), tries = 0;
        while (be.slots[slot] && tries++ < 40) slot = Math.floor(rnd() * 27);
        const it = Items.get(l.item);
        if (it && !be.slots[slot]) be.slots[slot] = { i: it.id, n: Math.min(l.n, it.stack), d: 0 };
      }
      w.blockEntities.set(k, be);
    }
    for (const m of info.mobs) {
      const key = `${m.type}@${Math.floor(m.x)},${m.y},${Math.floor(m.z)}`;
      if (!this.structDone.has(key)) this.structQueue.push({ ...m, key });
    }
  }
  _structMobs() {
    if (!this.structQueue.length) return;
    const p = this.player;
    for (let i = this.structQueue.length - 1; i >= 0; i--) {
      const m = this.structQueue[i];
      if (Math.hypot(m.x - p.x, m.z - p.z) > 44) continue;
      if (!this.world.isLoaded(Math.floor(m.x), Math.floor(m.z))) continue;
      this.structQueue.splice(i, 1);
      this.structDone.add(m.key);
      // aldeanos, guardianes y animales de corral aparecen aunque no haya monstruos
      const friendly = !MONSTERS[m.type];
      const allowed = friendly ? this.meta.mobs !== 'none' : this.meta.mobs === 'all' && this.difficulty !== 'peaceful';
      if (!allowed) continue;
      const mob = this.spawnMob(m.type, m.x, m.y + 0.01, m.z);
      if (mob && m.data) {
        if (mob.initFromData) mob.initFromData(m.data);
        if (m.data.pen) mob.persistentFlag = true;
      }
    }
  }

  // ═════════════ Aldeas: registro, reputación, alarma, oficios ═════════════
  /** Datos persistentes de la aldea `id` ("rx,rz"): {x,y,z,name,rep,found,alarm}. */
  villageInfo(id) {
    if (!id || !this.world) return null;
    let v = this.villages.get(id);
    if (!v) {
      const [rx, rz] = id.split(',').map(Number);
      const plan = villageAt(this.world.terrain, rx, rz);
      if (!plan) return null;
      const r = mulberry32((hash3(rx, 0, rz, this.world.seed) * 4294967296) >>> 0);
      v = { x: plan.x, y: plan.y, z: plan.z, name: villagerName(r) + ['vega', 'monte', 'llano', 'fuente', 'roble'][Math.floor(r() * 5)], rep: 0, found: false, alarm: 0 };
      this.villages.set(id, v);
    }
    return v;
  }
  villageReputation(id, delta) {
    const v = this.villageInfo(id);
    if (!v) return;
    v.rep = Math.max(-100, Math.min(100, v.rep + delta));
    if (delta < 0 && v.rep <= -30 && !v.warned) { v.warned = true; this.ui.toast(`Los habitantes de ${v.name} ya no confían en ti`); }
  }
  villageAlarm(id) { const v = id ? this.villages.get(id) : null; return !!v && v.alarm > this.playTime; }
  /** Campana: los aldeanos de la aldea más cercana se refugian en casa durante 30 s. */
  ringBell(x, y, z) {
    const plan = nearestVillage(this.world.terrain, x, z, 1);
    this.audio.play('bell', x + 0.5, y + 0.5, z + 0.5);
    if (!plan || Math.hypot(plan.x - x, plan.z - z) > 80) return;
    const v = this.villageInfo(plan.id);
    v.alarm = this.playTime + 30;
    this.ui.toast(`¡La campana de ${v.name} da la alarma! Los aldeanos se refugian`);
  }
  showVillageInfo(x, z) {
    const plan = nearestVillage(this.world.terrain, x, z, 1);
    if (!plan || Math.hypot(plan.x - x, plan.z - z) > 80) { this.ui.toast('Este atril no pertenece a ninguna aldea'); return; }
    const v = this.villageInfo(plan.id);
    const people = this.entities.count((e) => e.isVillager && e.village === plan.id);
    const rep = v.rep >= 20 ? 'te aprecian' : v.rep <= -30 ? 'desconfían de ti' : 'te tratan con normalidad';
    this.ui.toast(`Registro de ${v.name}: ${people} aldeanos cerca; ${rep} (reputación ${v.rep}).`, 5000);
  }
  /** Al colocar una estación de trabajo, un aldeano sin oficio cercano la adopta. */
  onWorkstationPlaced(x, y, z, id) {
    const b = Blocks.get(id);
    const key = b.family === 'custom' && b.oriented ? Blocks.get(b.famBase).key : b.key;
    const prof = PROFESSION_BY_STATION[key];
    if (!prof || !this.entities) return;
    let best = null, bd = 16;
    for (const e of this.entities.list) {
      if (!e.isVillager || e.removed || e.prof !== 'none') continue;
      const d = Math.hypot(e.x - x - 0.5, e.z - z - 0.5);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) { best.setProfession(prof, [x, y, z]); this.ui.toast(`${best.vname} ahora trabaja como ${best.displayName.split('(')[1].replace(')', '').toLowerCase()}`); }
  }
  /** Descubrimiento de aldeas cercanas y brújula. */
  _updateVillages(dt) {
    const p = this.player, terrain = this.world.terrain;
    this._villageTimer -= dt;
    if (this._villageTimer <= 0) {
      this._villageTimer = 2;
      const plan = nearestVillage(terrain, p.x, p.z, 1);
      if (plan && Math.hypot(plan.x - p.x, plan.z - p.z) < 64) {
        const v = this.villageInfo(plan.id);
        if (!v.found) { v.found = true; this.ui.centerMessage(`Aldea de ${v.name}`, 3500); this.achieve('aldea'); }
      }
    }
    this._compassTimer -= dt;
    if (this._compassTimer <= 0) {
      this._compassTimer = 0.5;
      const it = this.inventory.selectedItem();
      if (it && it.kind === 'compass') {
        const plan = nearestVillage(terrain, p.x, p.z, 6);
        if (plan) {
          const v = this.villageInfo(plan.id);
          const dx = plan.x - p.x, dz = plan.z - p.z, d = Math.round(Math.hypot(dx, dz));
          const ang = Math.atan2(dx, -dz); // 0 = Norte
          const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
          const dir = dirs[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
          this.ui.setCompass(d < 12 ? `🧭 Estás en ${v.name}` : `🧭 ${v.name}: ${d} m al ${dir}`);
        } else this.ui.setCompass('🧭 No hay aldeas en 1000 m');
      } else this.ui.setCompass(null);
    }
  }

  // ═════════════ Cambios de bloques ═════════════
  onBlockChange(x, y, z, old, nw) {
    const w = this.world;
    if (isContainerBlock(old) && !isContainerBlock(nw)) {
      const k = w.beKey(x, y, z);
      const be = w.blockEntities.get(k);
      if (be) {
        // si su pantalla está abierta se cierra antes (si no, se podrían sacar otra vez los objetos ya soltados)
        if (this.ui.screen && this.ui.screen.be === be) this.ui.closeScreen();
        for (const s of be.slots) if (s) this.dropItem(s, x + 0.5, y + 0.5, z + 0.5, 2);
        w.blockEntities.delete(k);
      }
    }
    if (this.fluids) this.fluids.onBlockChange(x, y, z);
    if (this.energy) this.energy.onBlockChange(x, y, z, old, nw);
    // Raíles: al poner o quitar uno, los vecinos se reorientan
    if ((isRail(old) !== isRail(nw) || (isRail(nw) && !isRail(old))) && !this._railFixing) {
      this._railFixing = true;
      try { updateRailsAround(w, x, y, z); } finally { this._railFixing = false; }
    }
    // Portales: romper el núcleo o el marco cierra el velo
    if (old === ID.PORTAL_CORE_ACTIVE && nw !== ID.PORTAL_CORE_ACTIVE) deactivatePortal(w, x, y, z);
    else if (old === ID.OBSIDIAN && nw !== ID.OBSIDIAN) {
      for (const [dx, dz] of PORTAL_RING) if (w.getBlock(x - dx, y, z - dz) === ID.PORTAL_CORE_ACTIVE) deactivatePortal(w, x - dx, y, z - dz);
    }
    this.queueUpdate(x, y, z);
    this.queueUpdate(x + 1, y, z); this.queueUpdate(x - 1, y, z); this.queueUpdate(x, y + 1, z); this.queueUpdate(x, y - 1, z); this.queueUpdate(x, y, z + 1); this.queueUpdate(x, y, z - 1);
  }
  queueUpdate(x, y, z) {
    const k = `${x},${y},${z}`;
    if (this.updateSet.has(k)) return;
    this.updateSet.add(k); this.updateQueue.push([x, y, z, k]);
  }
  processBlockUpdates() {
    let n = 0;
    const w = this.world;
    while (this.updateQueue.length && n < 160) {
      const [x, y, z, k] = this.updateQueue.shift(); this.updateSet.delete(k); n++;
      const id = w.getBlock(x, y, z);
      if (!id) continue;
      const b = Blocks.get(id);
      if (b.plantOn && !supportOk(w, x, y, z, id)) { this.breakNatural(x, y, z); continue; }
      if (b.gravity) {
        const below = w.getBlock(x, y - 1, z);
        if (below === 0 || B_FLUID[below] || (B_REPLACEABLE[below] && !B_SOLID[below])) {
          w.setBlock(x, y, z, 0);
          const f = new FallingBlock(this, id); f.setPos(x + 0.5, y, z + 0.5); this.entities.add(f);
        }
      }
    }
  }
  /** Rompe un bloque sin herramienta (pierde el soporte) y suelta sus objetos. */
  breakNatural(x, y, z) {
    const w = this.world;
    const id = w.getBlock(x, y, z); if (!id) return;
    const b = Blocks.get(id);
    for (const d of rollDrops(b.drops)) this.dropItem({ i: d.id, n: d.n, d: 0 }, x + 0.5, y + 0.5, z + 0.5);
    this.audio.blockSound('break', b.sound, x + 0.5, y + 0.5, z + 0.5);
    w.setBlock(x, y, z, 0);
  }

  tickBlockEntities(dt) {
    this._furnaceAcc += dt;
    if (this._furnaceAcc < 0.25) return;
    const step = this._furnaceAcc; this._furnaceAcc = 0;
    const w = this.world;
    for (const [k, be] of w.blockEntities) {
      if (be.type === 'alchemy') {
        const [x, , z] = k.split(',').map(Number);
        if (w.isLoaded(x, z)) tickAlchemy(be, step);
        continue;
      }
      if (be.type !== 'furnace') continue;
      const [x, y, z] = k.split(',').map(Number);
      if (!w.isLoaded(x, z)) continue;
      if (tickFurnace(be, step)) {
        const lit = be.extra.burn > 0;
        const cur = w.getBlock(x, y, z);
        if (cur === ID.FURNACE || cur === ID.FURNACE_LIT) w.setBlock(x, y, z, lit ? ID.FURNACE_LIT : ID.FURNACE);
      }
      // objetos fundidos → descubrimiento de recetas
      const out = be.slots[2];
      if (out) { const key = Items.get(out.i).key; if (!this.discovered.has(key)) this.onItemObtained(key); }
    }
  }

  // ═════════════ Interacción ═════════════
  _eyeRay() {
    const p = this.player, d = p.lookDir();
    return { ox: p.x, oy: p.eyeY - (p.stepSmooth || 0), oz: p.z, dx: d.x, dy: d.y, dz: d.z }; // mismo origen que la cámara
  }
  get reach() { return this.mode === 'creative' ? REACH_CREATIVE : REACH_SURVIVAL; }

  updateInteraction(dt) {
    const w = this.world, ctl = this.controls;
    const r = this._eyeRay();
    const canAct = this.state === 'playing' && ctl.locked && !this.survival.dead;
    let hit = canAct ? raycastBlocks(w, r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, this.reach) : null;
    const eh = canAct ? this.entities.raycast(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, this.reach, (e) => !e.burrowed && e !== this.riding) : null;
    let entityTarget = null;
    if (eh && (!hit || eh.dist < hit.dist)) { entityTarget = eh.entity; hit = null; }
    this.hit = hit; this.entityTarget = entityTarget;
    const stack = this.inventory.getSelected();
    this.attackCharge = Math.min(2, this.attackCharge + dt);
    this.useCooldown -= dt;
    // Romper (mantener)
    this.mining.update(dt, hit, canAct && ctl.mouse[0] && !entityTarget);
    if (canAct && ctl.mouse[0] && entityTarget) this.tryAttack(false);
    // Vista previa de colocación
    this.building.updatePreview(canAct ? hit : null, stack);
    // Mantener clic derecho: colocar bloques repetidamente / comer
    if (canAct && ctl.mouse[2]) {
      const it = stack ? Items.get(stack.i) : null;
      if (it && (it.food || it.drink)) { /* gestionado por updateEating */ }
      else if (it && it.kind === 'block' && this.useCooldown <= 0) { this.useItem(false); }
    }
    this.updateEating(dt, canAct && ctl.mouse[2]);
    // Mano / golpe visual
    if (this.mining.progress > 0 && this.mining.target) { this.handSwingAcc = (this.handSwingAcc || 0) + dt; if (this.handSwingAcc > 0.28) { this.handSwingAcc = 0; this.hand.swing(); } }
  }

  tryAttack(pressed) {
    const e = this.entityTarget;
    if (!e || this.mode === 'adventure' && false) return;
    const stack = this.inventory.getSelected();
    const it = stack ? Items.get(stack.i) : null;
    const tool = it && it.tool;
    const cd = tool ? tool.cooldown : 0.3;
    if (!pressed && this.attackCharge < cd) return;
    const charge = Math.min(1, this.attackCharge / Math.max(cd, 0.01));
    if (pressed && this.attackCharge < 0.15) return;
    const base = Math.max(0.5, (tool ? tool.damage : 1) + this.survival.effects.meleeBonus()); // fuerza / debilidad
    let dmg = base * (0.25 + 0.75 * charge * charge);
    const p = this.player;
    const crit = !p.onGround && p.vy < -0.5 && !p.inWater && charge > 0.9;
    if (crit) dmg *= 1.5;
    const sprint = p.sprinting;
    if (typeof e.hurt !== 'function') return;
    const ok = e.hurt(dmg, p.x, p.z, sprint ? 1.7 : 1, p);
    this.attackCharge = 0;
    this.hand.swing();
    if (ok) {
      if (crit) this.particles.emit(e.x, e.y + e.h * 0.7, e.z, 0xffe8a0, 8, 3);
      // Hoja prismática: cada cuatro golpes libera un anillo de esquirlas que daña a las criaturas cercanas
      if (it && it.key === 'prism_blade' && ++this.prismHits >= 4) {
        this.prismHits = 0;
        this.particles.emit(e.x, e.y + e.h * 0.5, e.z, 0x9af6ff, 20, 5, 1.2);
        this.audio.blockSound('break', 'glass', e.x, e.y + 1, e.z);
        for (const o of this.entities.list) {
          if (o === e || o.removed || !o.hurt || o.deathTime >= 0 || o.isVillager || o.isGolem || o.isVehicle || o.tamed || o.type === 'item' || o.type === 'projectile') continue;
          if (ANIMALS[o.type] && !o.isPylon) continue;
          if (Math.hypot(o.x - e.x, o.z - e.z) < 4.5) o.hurt(4, e.x, e.z, 0.5, p);
        }
      }
      if (this.mode !== 'creative' && tool) {
        const broke = this.inventory.damageSelected(it.tool.type === 'sword' ? 1 : 2);
        if (broke) { this.ui.toast('¡Se rompió ' + it.name.toLowerCase() + '!'); this.audio.play('toolbreak'); }
      }
      this.survival.addExhaustion(0.1);
    }
  }

  /** Clic derecho: interactuar con criatura, usar objeto o colocar bloque. */
  useItem(pressed) {
    const inv = this.inventory, stack = inv.getSelected();
    const it = stack ? Items.get(stack.i) : null;
    const p = this.player;
    // Aldeanos: comerciar
    const et = this.entityTarget;
    if (et && pressed && et.isVillager && et.deathTime < 0) {
      if (et.prof === 'none') { this.ui.toast(`${et.vname} no tiene oficio. Coloca una estación de trabajo libre cerca.`); return; }
      this._openScreen(openTradeScreen(this, et));
      return;
    }
    // Cuerda: atar / soltar animales
    if (et && pressed && et.attachLeash && et.deathTime < 0) {
      if (et.leash) { et.detachLeash(true); this.audio.play('leash', et.x, et.y, et.z); this.hand.swing(); return; }
      if (it && it.kind === 'rope' && et.leashable) {
        et.attachLeash('player');
        if (this.mode !== 'creative') inv.consumeSelected(1);
        this.audio.play('leash', et.x, et.y, et.z); this.hand.swing();
        return;
      }
    }
    // Alimentar / domesticar criaturas
    if (this.entityTarget && stack && this.entityTarget.feed && this.entityTarget.feed(stack)) {
      const e = this.entityTarget;
      if (this.mode !== 'creative') inv.consumeSelected(1);
      this.audio.play('eat', e.x, e.y, e.z); this.hand.swing();
      return;
    }
    // Fase 6: subir a un vehículo; poner vagonetas en raíles y barcas en el agua
    if (et && pressed && et.isVehicle && !et.removed) { this.mount(et); return; }
    if (it && pressed && it.kind === 'cart' && this.hit && isRail(this.hit.id)) {
      const c = new Minecart(this);
      const d = p.lookDir();
      if (c.placeOn(this.hit.x, this.hit.y, this.hit.z, facingFromVector(d.x, d.z))) {
        this.entities.add(c); c._sync();
        if (this.mode !== 'creative') inv.consumeSelected(1);
        this.audio.play('door_metal', c.x, c.y, c.z); this.hand.swing();
      } else c.dispose();
      return;
    }
    if (it && pressed && it.kind === 'boat') {
      const r = this._eyeRay();
      const wh = raycastBlocks(this.world, r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, this.reach, { fluids: true });
      // en el agua, o encima de un bloque con sitio libre (no sobre cofres, puertas o palancas: esos se usan)
      const hb = this.hit && Blocks.get(this.hit.id);
      const onLand = !!hb && this.hit.ny === 1 && !(hb.interact && !p.crouching) && !boxCollides(this.world, this.hit.x + 0.5, this.hit.y + 1.01, this.hit.z + 0.5, 1.3, 0.55);
      if (wh && (B_FLUID[wh.id] === 1 || onLand)) {
        const b = new Boat(this);
        const onWater = B_FLUID[wh.id] === 1;
        b.setPos(wh.x + 0.5, wh.y + (onWater ? 0.6 : 1), wh.z + 0.5); b.yaw = p.yaw;
        this.entities.add(b);
        if (this.mode !== 'creative') inv.consumeSelected(1);
        this.audio.play('splash', b.x, b.y, b.z); this.hand.swing();
        return;
      }
    }
    // Fase 4: objetos con uso propio
    if (it && pressed && this._useSpecial(it, et)) return;
    let fluidHit = null;
    if (it && (it.kind === 'bucket' || it.kind === 'bottle')) { const r = this._eyeRay(); fluidHit = raycastBlocks(this.world, r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, this.reach, { fluids: it.key === 'bucket' ? 'source' : true }); }
    if (it && it.kind === 'bottle' && pressed && fluidHit && B_FLUID[fluidHit.id] === 1 && !(this.hit && Blocks.get(this.hit.id).interact && this.hit.dist < fluidHit.dist)) {
      // Frasco de vidrio sobre el agua: se llena (sin gastar la fuente)
      inv.consumeSelected(1);
      const flask = { i: Items.id('water_flask'), n: 1, d: 0 };
      if (!inv.slots[inv.selected]) inv.slots[inv.selected] = flask;
      else { const rest = inv.add(flask); if (rest) this.dropItem(rest, p.x, p.y + 1, p.z); }
      this.audio.play('splash', fluidHit.x, fluidHit.y, fluidHit.z); this.hand.swing();
      return;
    }
    const did = this.building.use(this.hit, fluidHit, p.crouching, pressed);
    this.useCooldown = 0.22;
    if (did) this.hand.swing();
  }

  /**
   * Usos especiales (clic nuevo): bolas de nieve, cubo de agua sobre el Titán, Cristal vital y Báculo de raíces.
   * Devuelve true si se usó el objeto.
   */
  _useSpecial(it, et) {
    const inv = this.inventory, p = this.player, sv = this.survival;
    const onInteractive = this.hit && Blocks.get(this.hit.id).interact && !p.crouching;
    if (it.key === 'snowball' && !onInteractive) {
      throwSnowball(this);
      if (this.mode !== 'creative') inv.consumeSelected(1);
      this.hand.swing();
      return true;
    }
    if (it.key === 'water_bucket' && et && et.coolDown && et.deathTime < 0) {
      et.coolDown(8);
      if (this.mode !== 'creative') inv.slots[inv.selected] = { i: Items.id('bucket'), n: 1, d: 0 };
      this.audio.play('splash', et.x, et.y, et.z); this.hand.swing();
      return true;
    }
    if (it.kind === 'heart' && !onInteractive) {
      if (sv.maxHealth >= 40) { this.ui.toast('Ya tienes el máximo de corazones (20)'); return true; }
      sv.maxHealth += 2; sv.heal(2);
      if (this.mode !== 'creative') inv.consumeSelected(1);
      this.particles.emit(p.x, p.y + 1.2, p.z, 0xff4a6a, 16, 2);
      this.audio.play('levelup');
      this.ui.toast(`Ganas un corazón: ahora tienes ${sv.maxHealth / 2}`);
      this.achieve('vitalidad');
      return true;
    }
    if (it.tool && it.tool.type === 'scepter' && !onInteractive) {
      if (this.scepterCd > 0) return true;
      this.scepterCd = 0.7;
      const d = p.lookDir(), sp = 26;
      this.entities.add(new Missile(this, {
        x: p.x + d.x * 0.5, y: p.eyeY - 0.2, z: p.z + d.z * 0.5, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp,
        color: 0xb070ff, size: 0.3, gravity: 0, dmg: 8, owner: p, hitsPlayer: false, hitsMobs: true, kind: 'shadow', life: 2.5,
      }));
      this.audio.play('shoot');
      if (this.mode !== 'creative' && inv.damageSelected(1)) { this.ui.toast('¡Se rompió el Cetro del eclipse!'); this.audio.play('toolbreak'); }
      this.hand.swing();
      return true;
    }
    if (it.tool && it.tool.type === 'staff' && !onInteractive) {
      if (this.staffCd > 0) { this.ui.toast(`El báculo se está recargando (${Math.ceil(this.staffCd)} s)`, 1200); return true; }
      this.staffCd = 15;
      let n = 0;
      for (const e of this.entities.list) {
        if (e.removed || e.deathTime >= 0 || !(MONSTERS[e.type] || e.isBoss)) continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) > 8) continue;
        e.rooted = e.isBoss ? 1.5 : 4; n++;
        this.particles.emit(e.x, e.y + 0.4, e.z, 0x5aa840, 10, 2, 0.6);
      }
      sv.effects.add('regeneration', 6, 2);
      this.particles.emit(p.x, p.y + 0.3, p.z, 0x6ad040, 24, 3, 2);
      this.audio.play('magic');
      if (this.mode !== 'creative' && inv.damageSelected(5)) { this.ui.toast('¡Se rompió el báculo de raíces!'); this.audio.play('toolbreak'); }
      this.ui.toast(n ? `Las raíces atrapan a ${n} criatura${n > 1 ? 's' : ''}` : 'Las raíces te envuelven y te curan', 1500);
      this.hand.swing();
      return true;
    }
    return false;
  }

  beginEating() {
    const stack = this.inventory.getSelected();
    if (!stack || this.eating) return;
    const it = Items.get(stack.i);
    if (!it.food && !it.drink) return;
    if (it.food && !it.food.always && (this.mode === 'creative' || this.survival.hunger >= 20)) { if (this.mode !== 'creative') this.ui.toast('No tienes hambre'); return; }
    this.eating = { t: 0, dur: it.drink ? 1.2 : 1.4, slot: this.inventory.selected, last: 0 };
  }
  updateEating(dt, holding) {
    const e = this.eating;
    if (!e) return;
    const stack = this.inventory.slots[e.slot];
    const sIt = stack ? Items.get(stack.i) : null;
    if (!holding || this.inventory.selected !== e.slot || !stack || !(sIt.food || sIt.drink)) { this.eating = null; return; }
    e.t += dt;
    if (e.t - e.last > (sIt.drink ? 0.4 : 0.22)) { e.last = e.t; this.audio.play(sIt.drink ? 'drink' : 'eat'); if (!sIt.drink) this.particles.emit(this.player.x, this.player.eyeY - 0.3, this.player.z, sIt.key.includes('cooked') ? 0xb07a40 : 0xc04040, 2, 1.5, 0.3); }
    if (e.t >= e.dur) {
      const it = sIt;
      const sv = this.survival;
      if (it.food) { sv.eat(it); sv.applyEffects(it.food.effects); }
      if (it.drink) {
        const d = it.drink;
        sv.applyEffects(d.effects);
        if (d.heal) sv.heal(d.heal);
        if (d.cleanse) sv.effects.clearBad();
        if (d.extinguish) sv.fire = 0;
        if (it.key.startsWith('tonic_')) { this.achieve('alquimia'); this.audio.play('magic'); this.particles.emit(this.player.x, this.player.y + 1.4, this.player.z, 0xc070ff, 12, 1.6); }
      }
      if (this.mode !== 'creative') this.inventory.consumeSelected(1);
      const ret = it.food ? it.food.returns : it.drink.returns;
      if (ret && this.mode !== 'creative') { // el cuenco o el frasco vuelve a la mano (o al inventario)
        const back = { i: Items.id(ret), n: 1, d: 0 };
        if (!this.inventory.slots[e.slot]) this.inventory.slots[e.slot] = back;
        else { const rest = this.inventory.add(back); if (rest) this.dropItem(rest, this.player.x, this.player.y + 1, this.player.z); }
      }
      if (it.key === 'vegetable_stew') this.achieve('cocinero');
      if (it.food) this.audio.play('burp');
      this.eating = null;
      this.onItemObtained(it.key);
    }
  }

  // ═════════════ Bucle principal ═════════════
  start() {
    if (this.running) return;
    this.running = true; this._last = performance.now();
    const loop = () => {
      requestAnimationFrame(loop);
      const now = performance.now();
      let dt = (now - this._last) / 1000; this._last = now;
      this.frame(Math.min(dt, 0.1));
    };
    requestAnimationFrame(loop);
  }

  frame(dt) {
    this.elapsed += dt;
    const fs = this.frameStats; fs.acc += dt; fs.frames++;
    if (fs.acc >= 0.5) { fs.fps = Math.round(fs.frames / fs.acc); fs.frames = 0; fs.acc = 0; }
    const w = this.world;
    if (!w) { this.renderer.clear(); return; }
    const cam = this.camera;
    if (this.panorama) {
      const pn = this.pano;
      pn.angle += dt * 0.035;
      const camX = pn.x + Math.sin(pn.angle) * 46, camZ = pn.z + Math.cos(pn.angle) * 46;
      const camY = pn.y + 20 + Math.sin(this.elapsed * 0.15) * 3;
      this.player.x = camX; this.player.z = camZ; this.player.y = camY - this.player.eye;
      w.update(camX, camZ, 6);
      cam.position.set(camX, camY, camZ);
      cam.rotation.set(-0.3, pn.angle, 0);
      this._atmosphere(dt, 0);
      this.renderer.clear(); this.renderer.render(this.scene, cam);
      return;
    }
    const p = this.player, ctl = this.controls;
    const simulating = (this.state === 'playing' || this.state === 'screen' || this.state === 'dead') && !this.paused && !this.frozen;
    if (ctl.locked && this.state === 'playing') {
      const { dx, dy } = ctl.consumeLook();
      const k = 0.0022 * this.settings.sensitivity;
      p.yaw -= dx * k; p.pitch -= dy * k * (this.settings.invertY ? -1 : 1);
      p.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, p.pitch));
    } else ctl.consumeLook();

    if (simulating) this.simulate(dt);
    w.update(p.x, p.z, this.frozen ? 14 : 5);
    if (this.state !== 'loading') this.ui.update(dt);
    if (this.ui.screen && this.ui.screen.update) this.ui.screen.update(dt);

    this._atmosphere(dt, this.fovBoost);
    this._camera(dt);
    this.renderer.clear();
    this.renderer.render(this.scene, cam);
    // mano (solo en primera persona)
    if (this.cameraMode === 0 && this.hand && this.state !== 'menu') {
      const spd = Math.min(1, Math.hypot(p.vx, p.vz) / 5);
      this.handLight = this.lightAt(p.x, p.eyeY, p.z);
      this.hand.update(dt, this.inventory.getSelected(), p.onGround ? spd : 0, this.bobPhase, this.camera.aspect);
      this.hand.render(this.renderer);
    }
  }

  _atmosphere(dt, fovBoost) {
    const w = this.world, p = this.player;
    const atm = this.sky.update(this.time, this.camera, dt);
    this.sky.cloudsVisible = this.settings.clouds;
    const R = w.renderDistance * 16;
    let fogNear = R * 0.55, fogFar = R - 6, fogColor = atm.fog;
    const headFluid = this.panorama ? 0 : w.fluidAt(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
    this.headFluid = headFluid;
    const a = { ...atm };
    if (headFluid === 1) { const b = 0.4 + atm.day * 0.6; fogNear = 0.4; fogFar = 22; a.fog = [0.07 * b, 0.26 * b, 0.5 * b]; fogColor = a.fog; }
    else if (headFluid === 2) { fogNear = 0.1; fogFar = 3.5; a.fog = [0.7, 0.18, 0.04]; fogColor = a.fog; }
    const fx = !this.panorama && this.survival ? this.survival.effects : null;
    if (fx && fx.has('night_vision')) a.ambient = Math.max(a.ambient, 0.55);
    if (fx && fx.has('darkness')) { fogNear = 0.5; fogFar = Math.min(fogFar, 11); a.fog = [0.02, 0.02, 0.03]; fogColor = a.fog; }
    this.wr.setAtmosphere(a, fogNear, fogFar, this.settings.brightness, this.elapsed);
    this.renderer.setClearColor(new THREE.Color(fogColor[0], fogColor[1], fogColor[2]));
    this.camera.fov = this.settings.fov + fovBoost;
    this.camera.updateProjectionMatrix();
  }

  _camera(dt) {
    const p = this.player, cam = this.camera;
    // balanceo
    const speed = Math.hypot(p.vx, p.vz);
    if (p.onGround && speed > 0.5) this.bobPhase += dt * speed * 2.4;
    this.fovBoost += ((p.sprinting && speed > 3 ? 7 : 0) - this.fovBoost) * Math.min(1, dt * 8);
    let bobY = 0, roll = 0;
    if (this.settings.bobbing && this.cameraMode === 0) {
      const k = Math.min(1, speed / 5) * (p.onGround ? 1 : 0);
      bobY = Math.abs(Math.sin(this.bobPhase)) * 0.045 * k; roll = Math.sin(this.bobPhase) * 0.004 * k;
    }
    const look = p.lookDir();
    const ex = p.x, ey = p.eyeY + bobY - p.stepSmooth, ez = p.z; // stepSmooth: suaviza la subida de escalones
    if (this.cameraMode === 0) {
      cam.position.set(ex, ey, ez);
      if (this.shake > 0 && this.settings.bobbing) { const k = Math.min(1, this.shake) * 0.18; cam.position.x += (Math.random() - 0.5) * k; cam.position.y += (Math.random() - 0.5) * k; cam.position.z += (Math.random() - 0.5) * k; }
      cam.rotation.set(p.pitch, p.yaw, roll);
      if (this.avatar) this.avatar.root.visible = false;
    } else {
      const dir = this.cameraMode === 1 ? 1 : -1; // 1: detrás del jugador, -1: de frente
      const dist = 4;
      const bx = -look.x * dir, by = -look.y * dir, bz = -look.z * dir;
      const h = raycastBlocks(this.world, ex, ey, ez, bx, by, bz, dist + 0.3);
      const d = h ? Math.max(0.4, h.dist - 0.3) : dist;
      cam.position.set(ex + bx * d, ey + by * d, ez + bz * d);
      cam.rotation.set(this.cameraMode === 1 ? p.pitch : -p.pitch, this.cameraMode === 1 ? p.yaw : p.yaw + Math.PI, 0);
      if (this.avatar) { this.avatar.root.visible = true; this._animAvatar(dt); }
    }
    if (this.audio) this.audio.setListener(p.x, p.eyeY, p.z, p.yaw);
  }

  // ═════════════ Simulación ═════════════
  simulate(dt) {
    const p = this.player, w = this.world, ctl = this.controls;
    this.playTime += dt;
    this.time += dt / DAY_LENGTH;
    if (this.time >= 1) this.time -= 1;
    const move = (ctl.locked && this.state === 'playing') ? ctl.getMove() : { fwd: 0, strafe: 0, jump: false, sprint: false, crouch: false, crouchDown: false };
    p.autoJump = this.settings.autoJump;
    p.speedMul = this.survival.effects.speedMul(); // velocidad / lentitud
    if (this.riding) this._ride(dt, move);
    else p.update(dt, move, w, this.survival.canSprint);
    // pasos / aterrizaje
    if (p.onGround && p.moved > 0) {
      this.stepAcc += p.moved;
      if (this.stepAcc > (p.sprinting ? 2.6 : 1.9)) {
        this.stepAcc = 0;
        const id = w.getBlock(Math.floor(p.x), Math.floor(p.y - 0.2), Math.floor(p.z));
        this.audio.blockSound('step', B_SOUND[id] || 'stone', p.x, p.y, p.z);
      }
    }
    if (p.landed && p.landed.distance > 1.5 && !p.inWater) { const id = w.getBlock(Math.floor(p.x), Math.floor(p.y - 0.2), Math.floor(p.z)); this.audio.blockSound('place', B_SOUND[id] || 'stone', p.x, p.y, p.z); }
    if (p.inWater && !this._wasWater) this.audio.play('splash', p.x, p.y, p.z);
    this._wasWater = p.inWater;
    this.survival.update(dt);
    this.updateInteraction(dt);
    this.entities.update(dt);
    this.particles.update(dt);
    this.spawner.update(dt);
    this.ticks.update(dt);
    this.fluids.update(dt);
    this.energy.update(dt);
    this.tickBlockEntities(dt);
    this.processBlockUpdates();
    this._structMobs();
    if (this.dimension !== 'dark') this._updateVillages(dt); else this._updateDarkDimension(dt);
    this._updateBosses(dt);
    this._updatePortal(dt);
    this.audio.update(dt, this.sky.atm.day);
    // bioma actual
    this._biomeTimer -= dt;
    if (this._biomeTimer <= 0) {
      this._biomeTimer = 0.6;
      const b = w.terrain.biomeAt(Math.floor(p.x), Math.floor(p.z));
      if (b !== this.currentBiome) { this.currentBiome = b; this.ui.centerMessage(biomeName(b)); if (b === 11) this.achieve('volcan'); }
    }
    // autoguardado
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 30; this.saveGame(); }
    // los cultivos recogidos se descubren: trigo al romper
  }

  // ═════════════ Avatar en tercera persona ═════════════
  _buildAvatar() {
    const P = (name, size, center, color, o = {}) => ({ name, size, center, color, ...o });
    const m = buildModel([
      P('torso', [0.5, 0.7, 0.26], [0, 1.1, 0], '#3a6fc0', { pivot: [0, 1.1, 0] }),
      P('head', [0.46, 0.46, 0.46], [0, 1.68, 0], '#d8a67a', { pivot: [0, 1.5, 0] }),
      P('hair', [0.48, 0.18, 0.48], [0, 1.9, 0.02], '#4a3020', { pivot: [0, 1.5, 0], parent: 'head' }),
      P('armL', [0.18, 0.7, 0.18], [-0.34, 1.1, 0], '#d8a67a', { pivot: [-0.34, 1.42, 0] }),
      P('armR', [0.18, 0.7, 0.18], [0.34, 1.1, 0], '#d8a67a', { pivot: [0.34, 1.42, 0] }),
      P('legL', [0.22, 0.75, 0.24], [-0.13, 0.375, 0], '#2c3e6e', { pivot: [-0.13, 0.75, 0] }),
      P('legR', [0.22, 0.75, 0.24], [0.13, 0.375, 0], '#2c3e6e', { pivot: [0.13, 0.75, 0] }),
    ]);
    m.root.visible = false;
    this.scene.add(m.root);
    this.avatar = m; this._avatarPhase = 0;
  }
  _animAvatar(dt) {
    const p = this.player, a = this.avatar;
    a.root.position.set(p.x, p.y, p.z);
    a.root.rotation.y = p.yaw;
    const sp = Math.hypot(p.vx, p.vz);
    this._avatarPhase += sp * dt * 2.2;
    const s = Math.sin(this._avatarPhase) * Math.min(1, sp / 3) * 0.9;
    a.parts.legL.rotation.x = s; a.parts.legR.rotation.x = -s; a.parts.armL.rotation.x = -s; a.parts.armR.rotation.x = s;
    a.parts.head.rotation.x = p.pitch * 0.6;
    const l = this.lightAt(p.x, p.y + 1, p.z); a.mat.color.setScalar(l);
  }

  // ═════════════ Guardado ═════════════
  async saveGame(quiet = false, duringTravel = false) {
    if (!this.world || !this.meta || !this.store || this.saving || this.panorama) return;
    if (this._traveling && !duringTravel) return; // a mitad de viaje el jugador está esperando en el aire
    this.saving = true;
    try {
      const meta = this.meta, p = this.player;
      const sleeping = {};
      for (const [k, v] of this.sleeping) sleeping[k] = v.slice();
      for (const e of this.entities.list) {
        if (e.removed || !e.persistent) continue;
        const k = chunkKey(Math.floor(e.x / 16), Math.floor(e.z / 16));
        (sleeping[k] = sleeping[k] || []).push(e.serialize());
      }
      const be = {};
      for (const [k, v] of this.world.blockEntities) be[k] = v.serialize();
      meta.player = {
        x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, flying: p.flying,
        inv: this.inventory.serialize(), sv: this.survival.serialize(),
        discovered: [...this.discovered], ach: [...this.achievements], spawn: this.spawnPoint, stats: this.stats,
        best: this.bestiary.serialize(),
      };
      const D = this._dimData(meta);
      meta.time = this.time; meta.playTime = this.playTime; D.sleeping = sleeping; D.be = be;
      D.structDone = [...this.structDone]; meta.genVersion = GENERATOR_VERSION; meta.gameVersion = VERSION;
      meta.dim = this.dimension;
      meta.villages = Object.fromEntries(this.villages);
      meta.bossKills = this.bossKills;
      await this.world.saveModified();
      if (this.chunkStore) await this.chunkStore.flush();
      await this.store.putWorld(meta);
      if (!quiet) this.ui.toast('Partida guardada', 1200);
    } catch (e) {
      console.error('Error al guardar', e);
      this.ui.toast('⚠ No se pudo guardar la partida');
    } finally { this.saving = false; }
  }
}
void moveEntity; void addToSlots; void makeStack; void flowVector;
