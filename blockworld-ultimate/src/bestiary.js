// Bestiario: fichas de todas las criaturas (animales, monstruos, habitantes de las aldeas y jefes) con su historia.
// Una ficha se desbloquea al ver a la criatura de cerca; las muertes se cuentan aparte. Lógica pura (sin DOM).
import { ANIMALS } from './animals.js';
import { MONSTERS } from './monsters.js';
import { VILLAGE_MOBS } from './villagers.js';
import { BOSSES } from './bosses.js';

/** Historias breves de las criaturas que no son jefes (los jefes tienen su ficha completa en bosses.js). */
export const LORE = {
  prairie_bovid: 'Rumiante tranquilo de las llanuras. Se deja guiar con trigo y da cuero y carne. Los aldeanos dicen que muge más fuerte antes de una tormenta.',
  forest_boar: 'Cerdo de pelo hirsuto que hoza entre las raíces. Le encantan las zanahorias y las papas.',
  mountain_bird: 'Ave pequeña de las cumbres. Anida en los riscos y deja caer plumas al echar a volar.',
  crystal_fox: 'Zorro asustadizo cuyo pelaje brilla como el cristal. Con paciencia y bayas se puede domesticar, y entonces te sigue a todas partes.',
  river_turtle: 'Tortuga de las orillas. Muda el caparazón de vez en cuando y deja escamas que sirven para ofrendas y tónicos.',
  glow_fish: 'Pez que brilla en el agua oscura. Su carne es comestible y es ingrediente de los tónicos de branquias.',
  mist_deer: 'Ciervo que aparece entre la niebla de los bosques. Huye en cuanto te acercas corriendo.',
  night_stalker: 'Sombra con forma humana que vaga de noche y por las cuevas. El sol la quema; las puertas cerradas la detienen.',
  cave_bat: 'Murciélago de las cuevas oscuras. Ataca en vuelos erráticos y huye tras cada mordisco.',
  mud_golem: 'Montón de barro de los pantanos al que dio vida una tormenta. Lento pero muy resistente.',
  ruin_guardian: 'Constructo de piedra rúnica que sigue vigilando ruinas y templos olvidados. No se aleja de lo que protege.',
  obsidian_skeleton: 'Esqueleto de vidrio volcánico que dispara esquirlas desde lejos. Se esconde en cuevas profundas.',
  sand_devourer: 'Gusano que acecha bajo la arena del desierto y emerge cuando pasas por encima.',
  volcano_beast: 'Bestia de roca fundida de las regiones volcánicas. Su mordisco quema.',
  thorn_sprout: 'Brote que el Guardián del Bosque arranca de la tierra para defenderse. Mientras vive, alimenta a su señor con savia.',
  tide_jelly: 'Medusa que acompaña a la Reina de las Profundidades. Su roce envenena.',
  ember_imp: 'Chispa del martillo del Titán que cobró vida. Quema al tocar y no teme a la lava.',
  shade_wraith: 'Jirón de noche con alas que caza en la Dimensión Oscura. Su toque debilita los brazos de quien lo recibe.',
  void_crawler: 'Reptador de muchas patas que recorre las islas umbrías y se cuela por las cavernas. Lleva fragmentos de sombra en el lomo.',
  umbral_sentinel: 'Guardia de piedra umbría que el Soberano dejó en sus ruinas y en las escalinatas de su ciudadela. No abandona su puesto.',
  lumen_moth: 'Polilla que brilla en la penumbra de la Dimensión Oscura. Se acerca a quien lleva rodajas de hongo.',
  villager: 'Habitante de las aldeas. Trabaja en su oficio de día, duerme en su cama de noche y comercia con monedas de sol.',
  stone_guardian: 'Gólem de piedra que protege cada aldea de los monstruos nocturnos. No ataca a quien no ataca a los aldeanos.',
};

/** Fichas en orden: jefes, monstruos, animales y aldea. */
export function bestiaryEntries() {
  const out = [];
  for (const d of Object.values(BOSSES)) out.push({ key: d.key, name: d.name, cat: 'Jefe', hp: d.hp, boss: d });
  for (const d of Object.values(MONSTERS)) out.push({ key: d.key, name: d.name, cat: d.minion ? 'Esbirro' : 'Monstruo', hp: d.hp, threat: d.threat, habitat: d.habitat, lore: LORE[d.key] || '' });
  for (const d of Object.values(ANIMALS)) out.push({ key: d.key, name: d.name, cat: 'Animal', hp: d.hp, habitat: d.habitat || '', lore: LORE[d.key] || '' });
  for (const d of Object.values(VILLAGE_MOBS)) out.push({ key: d.key, name: d.name, cat: 'Aldea', hp: d.hp, lore: LORE[d.key] || '' });
  return out;
}

/** Registro del jugador: criaturas vistas y muertes por tipo. */
export class Bestiary {
  constructor() { this.seen = new Set(); this.kills = {}; }
  see(key) { if (this.seen.has(key)) return false; this.seen.add(key); return true; }
  kill(key) { this.seen.add(key); this.kills[key] = (this.kills[key] || 0) + 1; }
  serialize() { return { s: [...this.seen], k: this.kills }; }
  static load(o) { const b = new Bestiary(); if (o) { b.seen = new Set(o.s || []); b.kills = { ...(o.k || {}) }; } return b; }
}
