// Mesa de alquimia: destila tónicos. Un ingrediente arriba y hasta tres frascos abajo; tras BREW_TIME segundos
// cada frasco válido se transforma y se gasta UNA unidad del ingrediente (como mucho tres tónicos por ingrediente).
// Lógica pura (sin DOM): la usan el juego, la pantalla y las pruebas de Node.
import { Items } from './items.js';

export const BREW_TIME = 10;
/** Huecos del contenedor de la mesa: 0 = ingrediente, 1..3 = frascos. */
export const ALCHEMY_SLOTS = 4;

/** base + ingrediente → resultado. */
export const BREWS = [
  { base: 'water_flask', ing: 'crystal_shard', out: 'tonic_base' },
  { base: 'tonic_base', ing: 'apple', out: 'tonic_healing' },
  { base: 'tonic_base', ing: 'berries', out: 'tonic_regeneration' },
  { base: 'tonic_base', ing: 'flint', out: 'tonic_strength' },
  { base: 'tonic_base', ing: 'feather', out: 'tonic_speed' },
  { base: 'tonic_base', ing: 'raw_copper', out: 'tonic_haste' },
  { base: 'tonic_base', ing: 'ash', out: 'tonic_fire' },
  { base: 'tonic_base', ing: 'raw_fish', out: 'tonic_water' },
  { base: 'tonic_base', ing: 'mushroom_glow', out: 'tonic_night' },
  { base: 'tonic_base', ing: 'scute', out: 'tonic_resistance' },
];
for (const b of BREWS) for (const k of [b.base, b.ing, b.out]) if (!Items.has(k)) throw new Error('Alquimia: objeto desconocido ' + k);

const key = (st) => (st ? Items.get(st.i).key : null);
/** Receta para un frasco y un ingrediente (por clave), o null. */
export function brewFor(baseKey, ingKey) { return BREWS.find((b) => b.base === baseKey && b.ing === ingKey) || null; }
/** ¿Sirve este objeto como ingrediente de alguna receta? */
export const isIngredient = (k) => BREWS.some((b) => b.ing === k);
/** ¿Sirve como frasco (base) de alguna receta? */
export const isBrewBase = (k) => BREWS.some((b) => b.base === k);

/** ¿Hay algo que destilar ahora mismo? */
export function canBrew(be) {
  const ing = key(be.slots[0]);
  if (!ing) return false;
  for (let i = 1; i <= 3; i++) if (be.slots[i] && be.slots[i].n === 1 && brewFor(key(be.slots[i]), ing)) return true;
  return false;
}

/** Avanza la destilación `dt` segundos. Devuelve true si terminó una tanda. */
export function tickAlchemy(be, dt) {
  const ex = be.extra || (be.extra = { brew: 0 });
  if (!canBrew(be)) { ex.brew = 0; return false; }
  ex.brew += dt;
  if (ex.brew < BREW_TIME) return false;
  ex.brew = 0;
  const ing = key(be.slots[0]);
  for (let i = 1; i <= 3; i++) {
    const st = be.slots[i];
    const r = st && st.n === 1 ? brewFor(key(st), ing) : null;
    if (r) be.slots[i] = { i: Items.id(r.out), n: 1, d: 0 };
  }
  be.slots[0].n--;
  if (be.slots[0].n <= 0) be.slots[0] = null;
  return true;
}
