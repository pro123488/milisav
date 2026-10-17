// Comandos de chat (T o /). Útiles para probar y para jugar libremente. Se pueden desactivar al crear el mundo.
import { Items, makeStack } from './items.js';
import { ANIMALS } from './animals.js';
import { MONSTERS } from './monsters.js';
import { GAMEMODE_NAMES, DIFFICULTY_NAMES } from './config.js';
import { nearestVillage } from './villages.js';
import { nearestShrine, SHRINE_TYPES } from './shrines.js';
import { BOSSES } from './bosses.js';
import { EFFECTS } from './effects.js';

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const MODE_ALIAS = { supervivencia: 'survival', survival: 'survival', s: 'survival', creativo: 'creative', creative: 'creative', c: 'creative', aventura: 'adventure', adventure: 'adventure', a: 'adventure' };
const DIFF_ALIAS = { pacifico: 'peaceful', peaceful: 'peaceful', facil: 'easy', easy: 'easy', normal: 'normal', dificil: 'hard', hard: 'hard' };
const TIME_ALIAS = { amanecer: 0.0, manana: 0.1, dia: 0.15, mediodia: 0.25, tarde: 0.36, atardecer: 0.46, noche: 0.62, medianoche: 0.75 };

export const COMMAND_HELP = [
  '/modo <supervivencia|creativo|aventura>', '/tiempo <amanecer|dia|mediodia|atardecer|noche|medianoche|0-1>', '/dar <objeto> [cantidad]',
  '/tp <x> <y> <z>', '/curar', '/matar', '/invocar <criatura>', '/dificultad <pacifico|facil|normal|dificil>', '/semilla', '/spawn', '/limpiar',
  '/guardar', '/bestiario', '/objetos [texto]', '/localizar aldea', '/localizar santuario [bosque|cristal|mar|fuego]',
  '/efecto <efecto> [segundos] [nivel] | /efecto limpiar', '/jefe <bosque|cristal|mar|fuego|soberano>',
  '/localizar ciudadela', '/dimension <normal|oscura>',
];
const SHRINE_ALIAS = { soberano: 'soberano', sovereign: 'soberano',  bosque: 'bosque', guardian: 'bosque', forest: 'bosque', cristal: 'cristal', coloso: 'cristal', crystal: 'cristal', mar: 'mar', reina: 'mar', marea: 'mar', sea: 'mar', fuego: 'fuego', titan: 'fuego', volcan: 'fuego', fire: 'fuego' };

function findItem(q) {
  const n = norm(q).replace(/\s+/g, '_');
  const all = Items.all();
  return all.find((i) => i.key === n) || all.find((i) => norm(i.name).replace(/\s+/g, '_') === n) || all.find((i) => i.key.includes(n)) || all.find((i) => norm(i.name).includes(norm(q)));
}

/** Ejecuta un comando. Devuelve el texto de respuesta. */
export function runCommand(game, line) {
  const text = line.trim().replace(/^\//, '');
  if (!text) return '';
  const [cmdRaw, ...args] = text.split(/\s+/);
  const cmd = norm(cmdRaw);
  const p = game.player;
  if (!game.meta.commands && cmd !== 'ayuda') return 'Los comandos están desactivados en este mundo.';
  switch (cmd) {
    case 'ayuda': case 'help': return 'Comandos: ' + COMMAND_HELP.join('  ·  ');
    case 'modo': case 'gamemode': {
      const m = MODE_ALIAS[norm(args[0] || '')];
      if (!m) return 'Uso: /modo <supervivencia|creativo|aventura>';
      game.setMode(m); return `Modo de juego: ${GAMEMODE_NAMES[m]}`;
    }
    case 'dificultad': case 'difficulty': {
      const d = DIFF_ALIAS[norm(args[0] || '')];
      if (!d) return 'Uso: /dificultad <pacifico|facil|normal|dificil>';
      game.setDifficulty(d); return `Dificultad: ${DIFFICULTY_NAMES[d]}`;
    }
    case 'tiempo': case 'time': {
      const a = norm(args.filter((x) => x !== 'set').join(' '));
      let v = TIME_ALIAS[a];
      if (v === undefined) { const f = parseFloat(a); if (!Number.isNaN(f)) v = ((f % 1) + 1) % 1; }
      if (v === undefined) return 'Uso: /tiempo <amanecer|dia|mediodia|atardecer|noche|medianoche|0-1>';
      game.time = v; return 'Hora cambiada.';
    }
    case 'dar': case 'give': {
      if (!args.length) return 'Uso: /dar <objeto> [cantidad]';
      let n = 1; const last = args[args.length - 1];
      if (/^\d+$/.test(last) && args.length > 1) { n = Math.min(2304, parseInt(last, 10)); args.pop(); }
      const it = findItem(args.join(' '));
      if (!it) return 'No existe ese objeto. Prueba /objetos <texto>.';
      let left = n;
      while (left > 0) { const k = Math.min(left, it.stack); const rest = game.inventory.add(makeStack(it.id, k)); left -= k; if (rest) { game.dropFromPlayer(rest); } }
      game.onItemObtained(it.key);
      return `Recibes ${n} × ${it.name}`;
    }
    case 'objetos': case 'items': {
      const q = norm(args.join(' '));
      const list = Items.all().filter((i) => !q || norm(i.name).includes(q) || i.key.includes(q)).slice(0, 14).map((i) => i.key);
      return list.length ? list.join(', ') : 'Sin coincidencias.';
    }
    case 'tp': case 'teleport': {
      if (args.length < 3) return 'Uso: /tp <x> <y> <z>';
      const rel = (a, cur) => (a.startsWith('~') ? cur + (parseFloat(a.slice(1)) || 0) : parseFloat(a));
      const x = rel(args[0], p.x), y = rel(args[1], p.y), z = rel(args[2], p.z);
      if ([x, y, z].some(Number.isNaN)) return 'Coordenadas no válidas.';
      p.teleport(x, y, z); return `Teletransportado a ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`;
    }
    case 'spawn': { game.teleportToSpawn(); return 'Teletransportado al punto de reaparición.'; }
    case 'curar': case 'heal': game.survival.health = game.survival.maxHealth; game.survival.hunger = 20; game.survival.saturation = 20; return 'Salud y hambre restauradas.';
    case 'matar': case 'kill': game.survival.dead = false; game.survival.health = 0; game.survival.die('cmd'); return '';
    case 'limpiar': case 'clear': game.inventory.takeAll(); return 'Inventario vaciado.';
    case 'semilla': case 'seed': return `Semilla: ${game.meta.seedText || game.meta.seed} (${game.meta.seed})`;
    case 'guardar': case 'save': game.saveGame(); return 'Partida guardada.';
    case 'invocar': case 'summon': {
      const key = norm(args.join('_'));
      const all = { ...ANIMALS, ...MONSTERS };
      const k = Object.keys(all).find((x) => x === key || norm(all[x].name).replace(/\s+/g, '_') === key || x.includes(key));
      if (!k) return 'Criaturas: ' + Object.values(all).map((d) => d.key).join(', ');
      const d = p.lookDir();
      const m = game.spawnMob(k, p.x + d.x * 3, p.y + 0.5, p.z + d.z * 3);
      return m ? `Invocado: ${all[k].name}` : 'No se pudo invocar.';
    }
    case 'localizar': case 'locate': {
      if (/^ciudadela|citadel/.test(norm(args[0] || ''))) {
        if (game.dimension !== 'dark') return 'La Ciudadela del Soberano está en la Dimensión Oscura.';
        const a = game.world.terrain.citadelAltar();
        return `Ciudadela del Soberano: trono en ${a.x}, ${a.y}, ${a.z} (a ${Math.round(Math.hypot(a.x - p.x, a.z - p.z))} bloques)`;
      }
      if (game.dimension === 'dark') return 'En la Dimensión Oscura no hay aldeas ni santuarios. Prueba /localizar ciudadela.';
      if (/^santuario|shrine|jefe/.test(norm(args[0] || ''))) {
        const type = args[1] ? SHRINE_ALIAS[norm(args[1])] : null;
        if (args[1] && !type) return 'Uso: /localizar santuario [bosque|cristal|mar|fuego]';
        const sh = nearestShrine(game.world.terrain, p.x, p.z, type, 10);
        if (!sh) return 'No hay santuarios de ese tipo en 2000 bloques a la redonda.';
        const where = sh.type === 'cristal' ? `pozo de acceso en ${sh.x + 9}, ${sh.surface + 1}, ${sh.z}; altar a ${sh.y + 1} de altura` : `altar en ${sh.x}, ${sh.y + 1}, ${sh.z}`;
        return `${sh.name} (${BOSSES[sh.boss].short}): ${where} (a ${Math.round(Math.hypot(sh.x - p.x, sh.z - p.z))} bloques)`;
      }
      if (!/^aldea|village/.test(norm(args[0] || ''))) return 'Uso: /localizar aldea | /localizar santuario [bosque|cristal|mar|fuego]';
      const v = nearestVillage(game.world.terrain, p.x, p.z, 8);
      if (!v) return 'No hay aldeas en 1300 bloques a la redonda.';
      const info = game.villageInfo(v.id);
      return `Aldea de ${info.name} en ${v.x}, ${v.y + 1}, ${v.z} (a ${Math.round(Math.hypot(v.x - p.x, v.z - p.z))} bloques)`;
    }
    case 'bestiario': if (game.openBestiary) { setTimeout(() => game.openBestiary(), 0); return 'Abriendo el bestiario (tecla B).'; } return 'Animales: ' + Object.values(ANIMALS).map((d) => d.name).join(', ') + '. Monstruos: ' + Object.values(MONSTERS).map((d) => `${d.name} (amenaza ${d.threat})`).join(', ');
    case 'dimension': case 'dimensión': {
      const a = norm(args[0] || '');
      const t = /^oscura|dark|umbr/.test(a) ? 'dark' : /^normal|mundo|overworld/.test(a) ? 'overworld' : null;
      if (!t) return 'Uso: /dimension <normal|oscura>';
      if (t === game.dimension) return 'Ya estás en esa dimensión.';
      game.travel(t);
      return t === 'dark' ? 'Viajando a la Dimensión Oscura…' : 'Volviendo al mundo normal…';
    }
    case 'efecto': case 'effect': {
      const fx = game.survival.effects;
      const a0 = norm(args[0] || '');
      if (a0 === 'limpiar' || a0 === 'clear') { fx.clear(); return 'Efectos eliminados.'; }
      const id = Object.keys(EFFECTS).find((k) => k === a0 || norm(EFFECTS[k].name).replace(/\s+/g, '_') === a0 || norm(EFFECTS[k].name).startsWith(a0.replace(/_/g, ' ')));
      if (!id) return 'Efectos: ' + Object.keys(EFFECTS).join(', ');
      const sec = Math.max(1, Math.min(3600, parseFloat(args[1]) || 60)), lvl = Math.max(1, Math.min(5, parseInt(args[2], 10) || 1));
      fx.add(id, sec, lvl); fx.list.get(id).time = sec; fx.list.get(id).level = lvl;
      return `Efecto: ${EFFECTS[id].name} ${lvl} durante ${sec} s`;
    }
    case 'jefe': case 'boss': {
      const type = SHRINE_ALIAS[norm(args[0] || '')];
      if (!type) return 'Uso: /jefe <bosque|cristal|mar|fuego|soberano>';
      const key = type === 'soberano' ? 'sovereign' : SHRINE_TYPES[type].boss;
      const d = p.lookDir();
      const m = game.summonBoss(key, Math.floor(p.x + d.x * 8), Math.floor(p.y), Math.floor(p.z + d.z * 8));
      return m ? `¡${BOSSES[key].name} despierta!` : 'No se pudo invocar.';
    }
    default: return `Comando desconocido: ${cmdRaw}. Escribe /ayuda`;
  }
}
