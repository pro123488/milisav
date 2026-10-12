// Constantes globales de BLOCKWORLD ULTIMATE.
// Cambiar CHUNK_SIZE / WORLD_HEIGHT / SEA_LEVEL rompe la compatibilidad de los mundos guardados.

export const GAME_NAME = 'BLOCKWORLD ULTIMATE';
export const VERSION = '0.1.0 (Fase 1)';
/** Se guarda con cada mundo. Si cambia el generador, los chunks sin modificar se regenerarían distinto. */
export const GENERATOR_VERSION = 1;

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 128;
export const SEA_LEVEL = 40;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_AREA * WORLD_HEIGHT;

/** Alcance de interacción del jugador (bloques). */
export const REACH_SURVIVAL = 5;
export const REACH_CREATIVE = 8;

/** Duración de un día completo en segundos reales. */
export const DAY_LENGTH = 1200;

export const DEFAULT_SETTINGS = {
  renderDistance: 6,     // en chunks
  fov: 75,
  sensitivity: 1.0,
  masterVolume: 0.7,
  musicVolume: 0.35,
  brightness: 1.0,
  autoJump: true,
  bobbing: true,
  clouds: true,
  particles: true,
  showFps: false,
  invertY: false,
  fancyLeaves: false,
};

export const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'];
export const DIFFICULTY_NAMES = { peaceful: 'Pacífico', easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };
export const GAMEMODES = ['survival', 'creative', 'adventure'];
export const GAMEMODE_NAMES = { survival: 'Supervivencia', creative: 'Creativo', adventure: 'Aventura' };

export const WORLD_TYPES = {
  normal:   { name: 'Normal (todos los biomas)' },
  amplified:{ name: 'Montañoso (relieve exagerado)' },
  islands:  { name: 'Archipiélago (islas y mar)' },
  flat:     { name: 'Superplano (para construir)' },
};

/** Tamaño del mundo: lado en bloques (0 = infinito). */
export const WORLD_SIZES = {
  infinite: { name: 'Infinito', size: 0 },
  large:    { name: 'Grande (1024×1024)', size: 1024 },
  medium:   { name: 'Mediano (512×512)', size: 512 },
  small:    { name: 'Pequeño (256×256)', size: 256 },
};
