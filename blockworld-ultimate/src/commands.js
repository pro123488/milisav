// Comandos de chat (T o /). Útiles para probar y para jugar libremente. Se pueden desactivar al crear el mundo.
import { Items, makeStack } from './items.js';
import { ANIMALS } from './animals.js';
import { MONSTERS } from './monsters.js';
import { GAMEMODE_NAMES, DIFFICULTY_NAMES } from './config.js';

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const MODE_ALIAS = { supervivencia: 'survival', survival: 'survival', s: 'survival', creativo: 'creative', creative: 'creative', c: 'creative', aventura: 'adventure', adventure: 'adventure', a: 'adventure' };
const DIFF_ALIAS = { pacifico: 'peaceful', peaceful: 'peaceful', facil: 'easy', easy: 'easy', normal: 'normal', dificil: 'hard', hard: 'hard' };
const TIME_ALIAS = { amanecer: 0.0, manana: 0.1, dia: 0.15, mediodia: 0.25, tarde: 0.36, atardecer: 0.46, noche: 0.62, medianoche: 0.75 };

export const COMMAND_HELP = [
  '/modo <supervivencia|creativo|aventura>', '/tiempo <amanecer|dia|mediodia|atardecer|noche|medianoche|0-1>', '/dar <objeto> [cantidad]',
  '/tp <x> <y> <z>', '/curar', '/matar', '/invocar <criatura>', '/dificultad <pacifico|facil|normal|dificil>', '/semilla', '/spawn', '/limpiar',
  '/guardar', '/bestiario', '/objetos [texto]',
];

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
    case 'bestiario': return 'Animales: ' + Object.values(ANIMALS).map((d) => d.name).join(', ') + '. Monstruos: ' + Object.values(MONSTERS).map((d) => `${d.name} (amenaza ${d.threat})`).join(', ');
    default: return `Comando desconocido: ${cmdRaw}. Escribe /ayuda`;
  }
}
