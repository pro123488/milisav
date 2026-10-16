// Comercio con aldeanos: oficios, ofertas por nivel, experiencia, reposición y reputación.
// Lógica pura (sin DOM): la pantalla de comercio solo llama a estas funciones.
import { Items } from './items.js';
import { countInSlots, removeFromSlots, addToSlots } from './inventory.js';
import { cloneStack } from './items.js';

/** Moneda propia del juego. */
export const COIN = 'sun_coin';

/**
 * Oficios: estación de trabajo, colores del modelo y ofertas por nivel (1..3).
 * Oferta: { give: [[objeto, n], ...], get: [objeto, n], max: usos antes de reponer }
 */
export const PROFESSIONS = {
  farmer: {
    name: 'Granjero', station: 'compost_bin', robe: '#7a9a3a', hat: 'straw',
    levels: [
      [{ give: [['wheat', 18]], get: [COIN, 1], max: 12 }, { give: [['carrot', 20]], get: [COIN, 1], max: 12 }, { give: [[COIN, 1]], get: ['bread', 6], max: 12 }],
      [{ give: [['potato', 22]], get: [COIN, 1], max: 12 }, { give: [[COIN, 1]], get: ['tomato', 4], max: 8 }, { give: [[COIN, 1]], get: ['corn', 4], max: 8 }],
      [{ give: [['corn', 15]], get: [COIN, 1], max: 12 }, { give: [[COIN, 2]], get: ['vegetable_stew', 1], max: 6 }, { give: [[COIN, 1]], get: ['fertilizer', 6], max: 8 }],
    ],
  },
  blacksmith: {
    name: 'Herrero', station: 'anvil', robe: '#4a4a52', hat: 'none',
    levels: [
      [{ give: [['coal', 15]], get: [COIN, 1], max: 16 }, { give: [[COIN, 3]], get: ['iron_pickaxe', 1], max: 3 }, { give: [[COIN, 2]], get: ['iron_ingot', 3], max: 8 }],
      [{ give: [['iron_ingot', 4]], get: [COIN, 1], max: 12 }, { give: [[COIN, 6]], get: ['iron_chestplate', 1], max: 3 }, { give: [[COIN, 4]], get: ['iron_sword', 1], max: 3 }],
      [{ give: [['gold_ingot', 3]], get: [COIN, 1], max: 12 }, { give: [[COIN, 14]], get: ['crystal_pickaxe', 1], max: 2 }, { give: [[COIN, 3]], get: ['door_iron', 3], max: 4 }],
    ],
  },
  scholar: {
    name: 'Erudito', station: 'lectern', robe: '#6a4aa0', hat: 'cap',
    levels: [
      [{ give: [['paper', 20]], get: [COIN, 1], max: 12 }, { give: [[COIN, 1]], get: ['bookshelf', 1], max: 6 }, { give: [[COIN, 1]], get: ['torch', 12], max: 8 }],
      [{ give: [['book', 3]], get: [COIN, 1], max: 12 }, { give: [[COIN, 3]], get: ['crystal_lamp', 2], max: 6 }, { give: [[COIN, 2]], get: ['village_compass', 1], max: 3 }],
      [{ give: [['crystal_shard', 6]], get: [COIN, 1], max: 12 }, { give: [[COIN, 8]], get: ['raw_noctisite', 1], max: 2 }, { give: [[COIN, 2]], get: ['glass', 8], max: 8 }],
    ],
  },
  weaver: {
    name: 'Tejedor', station: 'loom', robe: '#c05a7a', hat: 'cap',
    levels: [
      [{ give: [['reed', 16]], get: [COIN, 1], max: 12 }, { give: [[COIN, 1]], get: ['rope', 3], max: 10 }, { give: [['leather', 6]], get: [COIN, 1], max: 12 }],
      [{ give: [[COIN, 2]], get: ['bed', 1], max: 4 }, { give: [[COIN, 3]], get: ['leather_chestplate', 1], max: 3 }, { give: [['feather', 8]], get: [COIN, 1], max: 12 }],
      [{ give: [[COIN, 2]], get: ['hay_bale', 4], max: 8 }, { give: [[COIN, 4]], get: ['leather_boots', 1], max: 3 }, { give: [[COIN, 1]], get: ['ladder', 6], max: 8 }],
    ],
  },
  fisher: {
    name: 'Pescador', station: 'barrel', robe: '#3a7aaa', hat: 'straw',
    levels: [
      [{ give: [['raw_fish', 8]], get: [COIN, 1], max: 12 }, { give: [[COIN, 1]], get: ['cooked_fish', 6], max: 10 }, { give: [['stick', 32]], get: [COIN, 1], max: 12 }],
      [{ give: [['scute', 2]], get: [COIN, 1], max: 8 }, { give: [[COIN, 2]], get: ['bucket', 1], max: 4 }, { give: [[COIN, 1]], get: ['barrel', 1], max: 4 }],
      [{ give: [[COIN, 3]], get: ['water_bucket', 1], max: 4 }, { give: [['clay_ball', 16]], get: [COIN, 1], max: 12 }, { give: [[COIN, 2]], get: ['salad', 2], max: 6 }],
    ],
  },
  healer: {
    name: 'Curandero', station: 'alchemy_table', robe: '#e0e0d0', hat: 'hood',
    levels: [
      [{ give: [['berries', 16]], get: [COIN, 1], max: 12 }, { give: [[COIN, 1]], get: ['bandage', 2], max: 10 }, { give: [['mushroom_glow', 4]], get: [COIN, 1], max: 12 }],
      [{ give: [['crystal_shard', 4]], get: [COIN, 1], max: 12 }, { give: [[COIN, 2]], get: ['mushroom_stew', 1], max: 6 }, { give: [[COIN, 1]], get: ['apple', 4], max: 10 }],
      [{ give: [['raw_noctisite', 1]], get: [COIN, 2], max: 6 }, { give: [[COIN, 3]], get: ['bandage', 6], max: 6 }, { give: [[COIN, 4]], get: ['crystal_shard', 6], max: 4 }],
    ],
  },
  none: { name: 'Aldeano', station: null, robe: '#8a6a4a', hat: 'none', levels: [] },
};
export const PROFESSION_BY_STATION = {};
for (const [k, p] of Object.entries(PROFESSIONS)) if (p.station) PROFESSION_BY_STATION[p.station] = k;

/** Experiencia necesaria para pasar del nivel n al n+1. */
export const LEVEL_XP = [0, 8, 24];
export const MAX_LEVEL = 3;

/** Estado de comercio de un aldeano: {prof, level, xp, uses: {key: n}} */
export function newTradeState(prof) { return { prof, level: 1, xp: 0, uses: {} }; }

/** Ofertas disponibles con su clave estable ("nivel:índice"). `rep` < 0 encarece las compras con monedas. */
export function offersFor(state, rep = 0) {
  const P = PROFESSIONS[state.prof];
  if (!P) return [];
  const out = [];
  for (let L = 0; L < Math.min(state.level, P.levels.length); L++) {
    P.levels[L].forEach((o, i) => {
      const key = `${L + 1}:${i}`;
      const give = o.give.map(([k, n]) => [k, k === COIN && rep < 0 ? n + Math.min(3, Math.ceil(-rep / 10)) : n]);
      out.push({ key, level: L + 1, give, get: o.get, max: o.max, used: state.uses[key] || 0 });
    });
  }
  return out;
}

/** ¿Tiene el jugador lo que pide la oferta? */
export function canTrade(offer, slots) {
  if (offer.used >= offer.max) return false;
  return offer.give.every(([k, n]) => countInSlots(slots, Items.id(k)) >= n);
}

/**
 * Ejecuta un trato: quita lo que se da y añade lo que se recibe (solo si cabe). Actualiza usos y experiencia.
 * Devuelve {ok, reason?, levelUp?}.
 */
export function executeTrade(state, offer, slots) {
  if (offer.used >= offer.max) return { ok: false, reason: 'Esta oferta se ha agotado hasta mañana.' };
  if (!canTrade(offer, slots)) return { ok: false, reason: 'No tienes lo necesario.' };
  const out = Items.get(offer.get[0]);
  const sim = slots.map(cloneStack);
  for (const [k, n] of offer.give) removeFromSlots(sim, Items.id(k), n);
  if (addToSlots(sim, { i: out.id, n: offer.get[1], d: 0 })) return { ok: false, reason: 'No hay espacio en el inventario.' };
  for (const [k, n] of offer.give) removeFromSlots(slots, Items.id(k), n);
  addToSlots(slots, { i: out.id, n: offer.get[1], d: 0 });
  state.uses[offer.key] = (state.uses[offer.key] || 0) + 1;
  offer.used = state.uses[offer.key];
  state.xp += offer.level;
  let levelUp = false;
  while (state.level < MAX_LEVEL && state.level < (PROFESSIONS[state.prof].levels.length) && state.xp >= LEVEL_XP[state.level]) { state.level++; levelUp = true; }
  return { ok: true, levelUp };
}

/** Reposición diaria (al amanecer o al trabajar en su estación). */
export function restock(state) { state.uses = {}; }

// ── Nombres de aldeanos (sílabas propias) ──
const SYL_A = ['Ma', 'Lo', 'Te', 'Ri', 'Sa', 'Bel', 'Or', 'Ina', 'Ca', 'Fe', 'Mi', 'Ro', 'Du', 'Ve', 'Al', 'Ne'];
const SYL_B = ['ren', 'lia', 'mon', 'sa', 'ro', 'dia', 'tor', 'nel', 'ra', 'vio', 'lin', 'ca', 'mar', 'zo', 'ta', 'bel'];
export function villagerName(rng) { return SYL_A[Math.floor(rng() * SYL_A.length)] + SYL_B[Math.floor(rng() * SYL_B.length)]; }
