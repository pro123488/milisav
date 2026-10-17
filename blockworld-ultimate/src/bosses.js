// Jefes: criaturas únicas que despiertan al ofrecer su objeto en un altar. Cada uno tiene historia, arena, invocación,
// fases (según la vida que le queda), ataques anunciados con partículas, una debilidad y recompensas propias.
// La barra de vida, la música de combate y el bestiario los gestiona el juego (game.js) a partir de BOSSES.
import * as THREE from 'three';
import { Mob, Entity } from './entities.js';
import { Items } from './items.js';
import { moveEntity, boxCollides } from './physics.js';
import { segmentBlocked } from './raycast.js';
import { SEA_LEVEL } from './config.js';

const P = (name, size, center, color, o = {}) => ({ name, size, center, color, ...o });
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const angleDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// ═════════════════════════ Definiciones ═════════════════════════
export const BOSSES = {
  forest_guardian: {
    key: 'forest_guardian', name: 'Guardián del Bosque Antiguo', short: 'Guardián del Bosque', hp: 300, w: 1.6, h: 4.4, speed: 1.7, armor: 0,
    altar: 'altar_forest', summon: 'ancient_seed', essence: 'essence_forest', unique: 'root_staff', achievement: 'jefe_bosque', shrine: 'bosque',
    phases: [0.5, 0.25], phaseNames: ['Despertar', 'Llamada del bosque', 'Furia de la savia'], color: 0x6ad040,
    music: { root: 98, tempo: 104, wave: 'triangle' },
    extraDrops: [{ item: 'apple', min: 3, max: 6 }, { item: 'sapling_oak', min: 2, max: 4 }, { item: 'fertilizer', min: 4, max: 8 }],
    lore: {
      historia: 'Cuando los primeros pobladores llegaron a los valles, plantaron un roble en el claro donde se cruzaban los ríos y le confiaron sus semillas. El árbol creció durante mil inviernos hasta que su corazón despertó: se arrancó del suelo para proteger el bosque de las hachas y, cansado, se hundió bajo un altar de piedra a esperar. Quien le ofrece una semilla ancestral pone a prueba su derecho a talar.',
      arena: 'Santuario del Bosque: un claro circular rodeado de pilares de corteza ancestral, en bosques templados, oscuros o selvas.',
      invocacion: 'Ofrece una Semilla ancestral en el Altar del bosque (mesa de trabajo: un brote de cada árbol, 2 manzanas y 2 de abono).',
      fases: ['Despertar: persigue y golpea con sus ramas; hace brotar raíces bajo tus pies.', 'Llamada del bosque (50 %): invoca Brotes espinosos y las raíces salen de tres en tres.', 'Furia de la savia (25 %): se mueve y ataca más rápido; cada brote vivo lo cura.'],
      ataques: ['Golpe de rama: barrido frontal (7).', 'Raíces: aviso de hojas en el suelo; lanzan por los aires y ralentizan (6).', 'Brotes espinosos: esbirros pequeños y rápidos.'],
      debilidad: 'Las hachas le hacen el doble de daño. Acaba con los brotes en la última fase o se curará.',
      recompensa: 'Báculo de raíces (inmoviliza a los enemigos cercanos y te regenera), Esencia del bosque, Cristal vital, manzanas, brotes y abono.',
    },
    model: () => [
      P('legL', [0.6, 1.4, 0.6], [-0.42, 0.7, 0], '#5a4630', { pivot: [-0.42, 1.4, 0], color2: '#3a2c1c' }),
      P('legR', [0.6, 1.4, 0.6], [0.42, 0.7, 0], '#5a4630', { pivot: [0.42, 1.4, 0], color2: '#3a2c1c' }),
      P('torso', [1.6, 1.7, 1.0], [0, 2.25, 0], '#6a5236', { pivot: [0, 1.4, 0], color2: '#4a3824' }),
      P('moss', [1.64, 0.32, 1.04], [0, 2.7, 0], '#4f8a3a', { pivot: [0, 1.4, 0], parent: 'torso' }),
      P('heart', [0.36, 0.36, 0.06], [0, 2.2, -0.52], '#9aff6a', { pivot: [0, 1.4, 0], parent: 'torso', emissive: true }),
      P('head', [1.0, 0.9, 0.9], [0, 3.55, 0], '#6a5236', { pivot: [0, 3.1, 0] }),
      P('eyeL', [0.18, 0.1, 0.04], [-0.24, 3.6, -0.46], '#c8ff7a', { pivot: [0, 3.1, 0], parent: 'head', emissive: true }),
      P('eyeR', [0.18, 0.1, 0.04], [0.24, 3.6, -0.46], '#c8ff7a', { pivot: [0, 3.1, 0], parent: 'head', emissive: true }),
      P('crown', [1.8, 0.7, 1.6], [0, 4.2, 0.1], '#3e7a2e', { pivot: [0, 3.1, 0], parent: 'head', color2: '#2e5a22' }),
      P('crown2', [1.0, 0.4, 1.0], [0.3, 4.65, 0.2], '#4f9a3a', { pivot: [0, 3.1, 0], parent: 'head' }),
      P('armL', [0.5, 1.9, 0.5], [-1.08, 2.05, 0], '#5a4630', { pivot: [-1.08, 2.95, 0] }),
      P('armR', [0.5, 1.9, 0.5], [1.08, 2.05, 0], '#5a4630', { pivot: [1.08, 2.95, 0] }),
      P('leafL', [0.8, 0.5, 0.8], [-1.08, 1.0, 0], '#3e7a2e', { pivot: [-1.08, 2.95, 0], parent: 'armL' }),
      P('leafR', [0.8, 0.5, 0.8], [1.08, 1.0, 0], '#3e7a2e', { pivot: [1.08, 2.95, 0], parent: 'armR' }),
    ],
  },
  crystal_colossus: {
    key: 'crystal_colossus', name: 'Coloso de Cristal', short: 'Coloso de Cristal', hp: 360, w: 2.0, h: 4.6, speed: 1.25, armor: 0.25,
    altar: 'altar_crystal', summon: 'geode_heart', essence: 'essence_crystal', unique: 'prism_blade', achievement: 'jefe_cristal', shrine: 'cristal',
    phases: [0.6, 0.25], phaseNames: ['Resonancia', 'Escudo prismático', 'Fractura'], color: 0x58d6e8,
    music: { root: 123, tempo: 96, wave: 'square' },
    extraDrops: [{ item: 'crystal_shard', min: 6, max: 12 }, { item: 'gold_ingot', min: 2, max: 5 }, { item: 'cave_crystal', min: 2, max: 4 }],
    lore: {
      historia: 'Cuando la montaña se enfrió, un rayo de luz quedó atrapado entre sus vetas. Durante siglos rebotó de cristal en cristal hasta que aprendió a moverse y se construyó un cuerpo con las geodas que encontró. Los mineros lo llamaban "el eco": se oía cantar bajo la roca. Se encerró en una gruta para que nadie rompiera su corazón de geoda.',
      arena: 'Gruta de cristal: una cueva esférica de geoda bajo montañas, llanuras, nieve o costas. Una torre de geoda con un farol marca el pozo de acceso.',
      invocacion: 'Ofrece un Corazón de geoda en el Altar de cristal (6 fragmentos de cristal, 2 cristales de cueva y 2 lingotes de oro).',
      fases: ['Resonancia: pisotones y ráfagas de esquirlas.', 'Escudo prismático (60 %): levanta 4 pilares de resonancia; mientras quede alguno apenas recibe daño.', 'Fractura (25 %): vuelve a levantar pilares y dispara esquirlas en todas direcciones.'],
      ataques: ['Pisotón: anillo de aviso alrededor; salta para esquivar la onda (8).', 'Ráfaga de esquirlas: abanico de proyectiles (4 cada uno).', 'Pilares de resonancia: protegen al coloso hasta que los rompes.'],
      debilidad: 'Los picos le hacen el doble de daño; las espadas rebotan en su cristal (60 %). Rompe los pilares para quitarle el escudo.',
      recompensa: 'Hoja prismática (espada que libera esquirlas cada cuatro golpes), Esencia cristalina, Cristal vital, cristal y oro.',
    },
    model: () => [
      P('legL', [0.7, 1.4, 0.7], [-0.5, 0.7, 0], '#6a6890', { pivot: [-0.5, 1.4, 0] }),
      P('legR', [0.7, 1.4, 0.7], [0.5, 0.7, 0], '#6a6890', { pivot: [0.5, 1.4, 0] }),
      P('torso', [2.0, 1.6, 1.2], [0, 2.2, 0], '#7a78a8', { pivot: [0, 1.4, 0], color2: '#5a5880' }),
      P('core', [0.6, 0.6, 0.08], [0, 2.3, -0.62], '#58f0ff', { pivot: [0, 1.4, 0], parent: 'torso', emissive: true }),
      P('spikeL', [0.4, 1.1, 0.4], [-0.8, 3.3, 0.2], '#9af6ff', { pivot: [0, 1.4, 0], parent: 'torso', emissive: true }),
      P('spikeR', [0.36, 0.9, 0.36], [0.7, 3.2, 0.3], '#9af6ff', { pivot: [0, 1.4, 0], parent: 'torso', emissive: true }),
      P('spikeB', [0.3, 0.8, 0.3], [0, 3.1, 0.5], '#c4f7ff', { pivot: [0, 1.4, 0], parent: 'torso', emissive: true }),
      P('head', [0.8, 0.7, 0.8], [0, 3.35, -0.1], '#8a88b8', { pivot: [0, 3.0, 0] }),
      P('eyeL', [0.16, 0.08, 0.04], [-0.18, 3.38, -0.52], '#e8ffff', { pivot: [0, 3.0, 0], parent: 'head', emissive: true }),
      P('eyeR', [0.16, 0.08, 0.04], [0.18, 3.38, -0.52], '#e8ffff', { pivot: [0, 3.0, 0], parent: 'head', emissive: true }),
      P('armL', [0.7, 1.9, 0.7], [-1.4, 2.05, 0], '#6a6890', { pivot: [-1.4, 2.9, 0] }),
      P('armR', [0.7, 1.9, 0.7], [1.4, 2.05, 0], '#6a6890', { pivot: [1.4, 2.9, 0] }),
      P('fistL', [0.95, 0.8, 0.95], [-1.4, 0.95, 0], '#58d6e8', { pivot: [-1.4, 2.9, 0], parent: 'armL', emissive: true }),
      P('fistR', [0.95, 0.8, 0.95], [1.4, 0.95, 0], '#58d6e8', { pivot: [1.4, 2.9, 0], parent: 'armR', emissive: true }),
    ],
  },
  deep_queen: {
    key: 'deep_queen', name: 'Reina de las Profundidades', short: 'Reina de las Profundidades', hp: 280, w: 2.0, h: 1.4, speed: 3.2, armor: 0, flying: true,
    altar: 'altar_tide', summon: 'tide_pearl', essence: 'essence_tide', unique: 'coral_crown', achievement: 'jefe_mar', shrine: 'mar',
    phases: [0.5, 0.25], phaseNames: ['Marea', 'Tinta abisal', 'Remolino'], color: 0x3a8ae0,
    music: { root: 87, tempo: 88, wave: 'sine' },
    extraDrops: [{ item: 'scute', min: 2, max: 4 }, { item: 'raw_fish', min: 4, max: 8 }, { item: 'sea_lantern', min: 2, max: 4 }],
    lore: {
      historia: 'Antes de que existieran las costas, la Reina gobernaba las fosas y cantaba a las mareas para que subieran y bajaran. Cuando perdió su perla, el mar se quedó quieto y ella se durmió en su templo, rodeada de faroles que nunca se apagan. Dicen los pescadores que, si le devuelves una perla de marea, despertará furiosa por haber dormido tanto.',
      arena: 'Templo sumergido: una plataforma de piedra marina con pilares y faroles en el fondo de los océanos profundos.',
      invocacion: 'Ofrece una Perla de marea en el Altar de las mareas (3 caparazones de río, 4 peces luminosos y 2 fragmentos de cristal). Lleva tónicos de branquias o la pelea será muy corta.',
      fases: ['Marea: nada en círculos, embiste y escupe veneno.', 'Tinta abisal (50 %): nubla tu vista con oscuridad e invoca medusas.', 'Remolino (25 %): gira sobre sí misma y te arrastra hacia ella.'],
      ataques: ['Embestida: se ilumina, se detiene y carga en línea recta (8).', 'Escupitajo venenoso: tres proyectiles que envenenan.', 'Tinta: oscuridad durante 8 segundos.', 'Remolino: te atrae hacia ella durante 3 segundos.'],
      debilidad: 'Si choca contra un muro durante una embestida queda aturdida y recibe el doble de daño. Fuera del agua se debilita.',
      recompensa: 'Corona de coral (casco que permite respirar bajo el agua), Esencia abisal, Cristal vital, caparazones, peces y faroles marinos.',
    },
    model: () => [
      P('body', [1.6, 0.9, 2.4], [0, 0.7, 0.2], '#2a6a8a', { color2: '#1a4a6a' }),
      P('belly', [1.2, 0.2, 2.0], [0, 0.28, 0.2], '#8ac8d8'),
      P('head', [1.1, 0.8, 1.0], [0, 0.85, -1.4], '#2f7a9a', { pivot: [0, 0.8, -0.9] }),
      P('crown1', [0.16, 0.5, 0.16], [-0.3, 1.45, -1.4], '#7af0ff', { pivot: [0, 0.8, -0.9], parent: 'head', emissive: true }),
      P('crown2', [0.16, 0.7, 0.16], [0, 1.55, -1.45], '#7af0ff', { pivot: [0, 0.8, -0.9], parent: 'head', emissive: true }),
      P('crown3', [0.16, 0.5, 0.16], [0.3, 1.45, -1.4], '#7af0ff', { pivot: [0, 0.8, -0.9], parent: 'head', emissive: true }),
      P('eyeL', [0.16, 0.12, 0.04], [-0.3, 0.95, -1.92], '#ffe14a', { pivot: [0, 0.8, -0.9], parent: 'head', emissive: true }),
      P('eyeR', [0.16, 0.12, 0.04], [0.3, 0.95, -1.92], '#ffe14a', { pivot: [0, 0.8, -0.9], parent: 'head', emissive: true }),
      P('wingL', [1.5, 0.1, 1.2], [-1.5, 0.75, 0], '#3a8aaa', { pivot: [-0.8, 0.75, 0] }),
      P('wingR', [1.5, 0.1, 1.2], [1.5, 0.75, 0], '#3a8aaa', { pivot: [0.8, 0.75, 0] }),
      P('tail1', [0.8, 0.6, 1.1], [0, 0.7, 1.9], '#2a6a8a', { pivot: [0, 0.7, 1.4] }),
      P('tail2', [0.5, 0.4, 1.0], [0, 0.7, 2.9], '#25607e', { pivot: [0, 0.7, 2.45], parent: 'tail1' }),
      P('fin', [1.4, 0.1, 0.6], [0, 0.7, 3.5], '#7af0ff', { pivot: [0, 0.7, 2.45], parent: 'tail1', emissive: true }),
      P('tentL', [0.16, 0.9, 0.16], [-0.35, 0.05, -1.3], '#4a9aba'),
      P('tentR', [0.16, 0.9, 0.16], [0.35, 0.05, -1.3], '#4a9aba'),
    ],
  },
  volcanic_titan: {
    key: 'volcanic_titan', name: 'Titán Volcánico', short: 'Titán Volcánico', hp: 440, w: 2.2, h: 5.2, speed: 1.05, armor: 0.2, fireImmune: true,
    altar: 'altar_ember', summon: 'eternal_ember', essence: 'essence_ember', unique: 'titan_hammer', achievement: 'jefe_titan', shrine: 'fuego',
    phases: [0.5, 0.2], phaseNames: ['Forja', 'Lluvia de meteoritos', 'Coraza de magma'], color: 0xff7a1a,
    music: { root: 73, tempo: 120, wave: 'sawtooth' },
    extraDrops: [{ item: 'obsidian', min: 3, max: 6 }, { item: 'gold_ingot', min: 3, max: 6 }, { item: 'raw_noctisite', min: 1, max: 3 }, { item: 'magma_brick', min: 4, max: 8 }],
    lore: {
      historia: 'Los forjadores eran gigantes que daban forma a las montañas a martillazos. Cuando el mundo estuvo terminado se marcharon, todos menos uno, que no quiso soltar su martillo. Se tumbó en una caldera bajo los desiertos y dejó que la lava lo cubriera. Una brasa eterna bastaría para reavivar su forja... y su mal genio.',
      arena: 'Caldera volcánica: una plataforma de roca volcánica rodeada por un foso de lava con cuatro puentes, en desiertos, mesetas y regiones volcánicas.',
      invocacion: 'Ofrece una Brasa eterna en el Altar de brasas (2 de vidrio volcánico, 6 de carbón y 4 lingotes de hierro). El tónico ignífugo es muy recomendable.',
      fases: ['Forja: martillazos y bolas de fuego.', 'Lluvia de meteoritos (50 %): círculos de aviso caen a tu alrededor; invoca diablillos de brasas.', 'Coraza de magma (20 %): golpearle cuerpo a cuerpo te prende fuego y se vuelve más rápido.'],
      ataques: ['Martillazo: aviso frente a él y golpe que quema (10).', 'Bola de fuego: estalla al tocar el suelo (6).', 'Meteoritos: impactos señalados con antelación (7).', 'Diablillos de brasas: esbirros que queman.'],
      debilidad: 'Enfriarlo: una bola de nieve lanzada o un cubo de agua lo deja enfriado unos segundos, con el doble de daño recibido y ataques más lentos.',
      recompensa: 'Martillo del Titán (pico que rompe zonas de 3×3), Esencia ígnea, Cristal vital, vidrio volcánico, oro y noctisita.',
    },
    model: () => [
      P('legL', [0.9, 1.8, 0.9], [-0.62, 0.9, 0], '#2c2226', { pivot: [-0.62, 1.8, 0] }),
      P('legR', [0.9, 1.8, 0.9], [0.62, 0.9, 0], '#2c2226', { pivot: [0.62, 1.8, 0] }),
      P('crackL', [0.92, 0.12, 0.92], [-0.62, 1.1, 0], '#ff6a1a', { pivot: [-0.62, 1.8, 0], parent: 'legL', emissive: true }),
      P('crackR', [0.92, 0.12, 0.92], [0.62, 1.1, 0], '#ff6a1a', { pivot: [0.62, 1.8, 0], parent: 'legR', emissive: true }),
      P('torso', [2.4, 2.0, 1.4], [0, 2.85, 0], '#3a2c30', { pivot: [0, 1.8, 0], color2: '#241a1c' }),
      P('chest', [1.0, 0.8, 0.08], [0, 3.0, -0.72], '#ff7a1a', { pivot: [0, 1.8, 0], parent: 'torso', emissive: true }),
      P('head', [1.0, 0.9, 1.0], [0, 4.3, -0.1], '#3a2c30', { pivot: [0, 3.85, 0] }),
      P('hornL', [0.2, 0.6, 0.2], [-0.45, 4.95, -0.1], '#1a1214', { pivot: [0, 3.85, 0], parent: 'head' }),
      P('hornR', [0.2, 0.6, 0.2], [0.45, 4.95, -0.1], '#1a1214', { pivot: [0, 3.85, 0], parent: 'head' }),
      P('eyeL', [0.2, 0.1, 0.04], [-0.22, 4.35, -0.62], '#ffd040', { pivot: [0, 3.85, 0], parent: 'head', emissive: true }),
      P('eyeR', [0.2, 0.1, 0.04], [0.22, 4.35, -0.62], '#ffd040', { pivot: [0, 3.85, 0], parent: 'head', emissive: true }),
      P('armL', [0.8, 2.4, 0.8], [-1.6, 2.6, 0], '#2c2226', { pivot: [-1.6, 3.7, 0] }),
      P('armR', [0.8, 2.4, 0.8], [1.6, 2.6, 0], '#2c2226', { pivot: [1.6, 3.7, 0] }),
      P('handle', [0.24, 0.24, 2.0], [1.6, 1.5, -0.8], '#5a4030', { pivot: [1.6, 3.7, 0], parent: 'armR' }),
      P('hammer', [1.0, 0.9, 0.9], [1.6, 1.5, -1.9], '#2a2226', { pivot: [1.6, 3.7, 0], parent: 'armR' }),
      P('hcrack', [1.02, 0.14, 0.92], [1.6, 1.5, -1.9], '#ff9a2a', { pivot: [1.6, 3.7, 0], parent: 'armR', emissive: true }),
    ],
  },
  sovereign: {
    key: 'sovereign', name: 'Soberano de la Dimensión Oscura', short: 'Soberano', hp: 600, w: 1.4, h: 3.4, speed: 3.2, armor: 0.2, flying: true, dark: true,
    altar: 'altar_sovereign', summon: 'sovereign_sigil', essence: 'shadow_shard', unique: 'eclipse_scepter', achievement: 'jefe_soberano', shrine: null,
    phases: [0.6, 0.3], phaseNames: ['Crepúsculo', 'Eclipse', 'Colapso'], color: 0xb070ff,
    music: { root: 65, tempo: 132, wave: 'sawtooth' },
    extraDrops: [{ item: 'heart_crystal', min: 1, max: 1 }, { item: 'noctisite_ingot', min: 4, max: 8 }, { item: 'shadow_shard', min: 6, max: 10 }],
    lore: {
      historia: 'Cuando los forjadores terminaron el mundo, quedó una sombra que ninguno quiso: la noche que sobraba. Se retiró a una dimensión sin sol, la llenó de islas y de hongos que brillan para no olvidar la luz, y se coronó Soberano. Desde su ciudadela empuja la oscuridad hacia el otro lado de los portales. Los cuatro guardianes del mundo eran los cerrojos que lo mantenían lejos; con sus esencias se abre la puerta.',
      arena: 'Ciudadela del Soberano: un zigurat de ladrillo umbrío de tres pisos sobre la isla más grande de la Dimensión Oscura, con columnas coronadas de cristales del vacío y el Trono en lo alto.',
      invocacion: 'Ofrece un Sello del Soberano en su Trono (6 fragmentos de sombra, 2 lingotes de noctisita y un Cristal vital). Para llegar a la Dimensión Oscura construye un portal: un Núcleo de portal rodeado de 8 bloques de vidrio volcánico, activado con la Llave umbría.',
      fases: ['Crepúsculo: lanza proyectiles de sombra que debilitan e invoca espectros.', 'Eclipse (60 %): se teletransporta por la arena, apaga la luz con oscuridad y dispara un rayo que se anuncia con una línea de partículas.', 'Colapso (30 %): columnas de vacío estallan bajo tus pies y lanza sombras en todas direcciones.'],
      ataques: ['Proyectiles de sombra (5, debilidad).', 'Espectros umbríos.', 'Rayo del eclipse: línea de aviso y golpe en línea recta (9, oscuridad).', 'Columnas de vacío: círculos de aviso (8, lanzan por los aires).'],
      debilidad: 'La luz lo quema: recibe un 50 % más de daño junto a antorchas, faroles y otras luces fuertes. La Hoja prismática le hace el doble.',
      recompensa: 'Cetro del eclipse (dispara proyectiles de sombra), dos Cristales vitales, noctisita, fragmentos de sombra y el final de la historia.',
    },
    model: () => [
      P('robe', [1.0, 1.6, 0.8], [0, 0.9, 0], '#1a1028', { color2: '#0c0814' }),
      P('torso', [1.1, 1.0, 0.7], [0, 2.1, 0], '#2a1a3a', { pivot: [0, 1.7, 0] }),
      P('gem', [0.3, 0.3, 0.06], [0, 2.2, -0.38], '#e8c0ff', { pivot: [0, 1.7, 0], parent: 'torso', emissive: true }),
      P('head', [0.6, 0.6, 0.6], [0, 2.95, 0], '#3a2a52', { pivot: [0, 2.65, 0] }),
      P('eyeL', [0.12, 0.06, 0.04], [-0.14, 2.98, -0.31], '#ffffff', { pivot: [0, 2.65, 0], parent: 'head', emissive: true }),
      P('eyeR', [0.12, 0.06, 0.04], [0.14, 2.98, -0.31], '#ffffff', { pivot: [0, 2.65, 0], parent: 'head', emissive: true }),
      P('crown1', [0.12, 0.4, 0.12], [-0.22, 3.4, 0], '#b070ff', { pivot: [0, 2.65, 0], parent: 'head', emissive: true }),
      P('crown2', [0.12, 0.55, 0.12], [0, 3.48, 0], '#b070ff', { pivot: [0, 2.65, 0], parent: 'head', emissive: true }),
      P('crown3', [0.12, 0.4, 0.12], [0.22, 3.4, 0], '#b070ff', { pivot: [0, 2.65, 0], parent: 'head', emissive: true }),
      P('armL', [0.3, 1.2, 0.3], [-0.72, 1.95, 0], '#2a1a3a', { pivot: [-0.72, 2.5, 0] }),
      P('armR', [0.3, 1.2, 0.3], [0.72, 1.95, 0], '#2a1a3a', { pivot: [0.72, 2.5, 0] }),
      P('cape', [1.3, 2.4, 0.08], [0, 1.5, 0.45], '#3a1a52', { pivot: [0, 2.6, 0.4] }),
      P('orb1', [0.3, 0.3, 0.3], [1.3, 2.4, 0], '#9af6ff', { pivot: [0, 2.4, 0], emissive: true }),
      P('orb2', [0.3, 0.3, 0.3], [-1.3, 2.4, 0], '#ff9af0', { pivot: [0, 2.4, 0], emissive: true }),
    ],
  },
};
for (const b of Object.values(BOSSES)) for (const k of [b.summon, b.essence, b.unique]) if (!Items.has(k)) throw new Error('Jefe ' + b.key + ': objeto desconocido ' + k);
export const BOSS_KEYS = Object.keys(BOSSES);
/** Los cuatro jefes del mundo normal (el logro «Leyenda viva» pide derrotarlos a todos). */
export const OVERWORLD_BOSSES = BOSS_KEYS.filter((k) => !BOSSES[k].dark);
/** Jefe que despierta la ofrenda `itemKey`, o null. */
export const bossForSummon = (itemKey) => BOSS_KEYS.find((k) => BOSSES[k].summon === itemKey) || null;

// ═════════════════════════ Proyectiles ═════════════════════════
const missileGeo = new THREE.BoxGeometry(1, 1, 1);
/**
 * Proyectil genérico. o: {x,y,z,vx,vy,vz,color,size,gravity,dmg,owner,life,hitsPlayer,hitsMobs,kind,onHit(m, target|null)}
 * Lo usan los jefes (esquirlas, veneno, bolas de fuego) y el jugador (bolas de nieve).
 */
export class Missile extends Entity {
  constructor(game, o) {
    super(game, 'projectile');
    Object.assign(this, { gravity: 4, dmg: 0, life: 6, hitsPlayer: true, hitsMobs: false, size: 0.25, color: 0xffffff, kind: 'shard' }, o);
    this.w = this.h = this.size;
    const m = new THREE.Mesh(missileGeo, new THREE.MeshBasicMaterial({ color: this.color })); m.userData.ownMat = true;
    m.scale.set(this.size, this.size, this.size * (this.kind === 'shard' ? 1.8 : 1));
    this.obj = new THREE.Group(); this.obj.add(m); game.scene.add(this.obj); this.mesh = m;
    this.obj.position.set(this.x, this.y, this.z);
    this._trail = 0;
  }
  update(dt) {
    const g = this.game;
    this.life -= dt; this.age += dt;
    if (this.life <= 0) { this.removed = true; return; }
    this.vy -= this.gravity * dt;
    if (this.homing && this.hitsPlayer) { // se curva poco a poco hacia el jugador
      const p = g.player, dx = p.x - this.x, dy = p.y + 1 - this.y, dz = p.z - this.z, d = Math.hypot(dx, dy, dz) || 1;
      const sp = Math.hypot(this.vx, this.vy, this.vz) || 1, k = Math.min(1, this.homing * dt);
      this.vx += (dx / d * sp - this.vx) * k; this.vy += (dy / d * sp - this.vy) * k; this.vz += (dz / d * sp - this.vz) * k;
    }
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt, nz = this.z + this.vz * dt;
    if (segmentBlocked(this.world, this.x, this.y, this.z, nx, ny, nz)) { this._hit(null); return; }
    // comprobación de impactos por tramos (a pocos FPS un proyectil rápido avanza más de un bloque por fotograma)
    const ox = this.x, oy = this.y, oz = this.z;
    const n = Math.max(1, Math.ceil(Math.hypot(nx - ox, ny - oy, nz - oz) / 0.4));
    for (let k = 1; k <= n; k++) {
      const t = k / n, px = ox + (nx - ox) * t, py = oy + (ny - oy) * t, pz = oz + (nz - oz) * t;
      this.x = px; this.y = py; this.z = pz;
      if (this._collide(px, py, pz)) return;
    }
    this.obj.position.set(nx, ny, nz);
    this.mesh.rotation.y = Math.atan2(this.vx, this.vz); this.mesh.rotation.x = -Math.atan2(this.vy, Math.hypot(this.vx, this.vz));
    this._trail -= dt;
    if (this._trail <= 0 && this.kind !== 'snow') { this._trail = 0.06; g.particles.emit(nx, ny, nz, this.color, 1, 0.4, 0.1); }
  }
  /** ¿Toca al jugador o a una criatura en (nx,ny,nz)? Aplica el impacto y devuelve true. */
  _collide(nx, ny, nz) {
    const g = this.game;
    if (this.hitsPlayer) {
      const p = g.player, r = 0.35 + this.size * 0.5;
      if (Math.abs(nx - p.x) < r && ny > p.y - 0.1 && ny < p.y + p.h + 0.1 && Math.abs(nz - p.z) < r) {
        if (this.dmg > 0) g.survival.damage(this.dmg, 'mob', this.owner || this);
        this._hit(p); return true;
      }
    }
    if (this.hitsMobs) {
      for (const e of g.entities.list) {
        if (e === this || e === this.owner || e.removed || !e.hurt || e.deathTime >= 0 || e.type === 'item' || e.type === 'projectile') continue;
        const hw = e.w / 2 + this.size * 0.5;
        if (Math.abs(nx - e.x) < hw && Math.abs(nz - e.z) < hw && ny > e.y - 0.1 && ny < e.y + e.h + 0.1) {
          if (this.dmg > 0 || this.kind === 'snow') e.hurt(this.dmg, this.x - this.vx, this.z - this.vz, this.kind === 'snow' ? 0.3 : 0.6, this.owner);
          this._hit(e); return true;
        }
      }
    }
    return false;
  }
  _hit(target) {
    this.removed = true;
    this.game.particles.emit(this.x, this.y, this.z, this.color, this.kind === 'fire' ? 18 : 6, this.kind === 'fire' ? 4 : 2.2);
    if (this.onHit) this.onHit(this, target);
  }
}

/** Lanza una bola de nieve desde el jugador (enfría al Titán Volcánico). */
export function throwSnowball(game) {
  const p = game.player, d = p.lookDir();
  const sp = 20;
  game.entities.add(new Missile(game, {
    x: p.x + d.x * 0.4, y: p.eyeY - 0.1, z: p.z + d.z * 0.4, vx: d.x * sp, vy: d.y * sp + 1.5, vz: d.z * sp,
    color: 0xeef4fb, size: 0.22, gravity: 14, dmg: 0, owner: p, hitsPlayer: false, hitsMobs: true, kind: 'snow', life: 4,
    onHit: (m, target) => { if (target && target.onSnowball) target.onSnowball(); },
  }));
  game.audio && game.audio.play('shoot');
}

// ═════════════════════════ Pilar de resonancia ═════════════════════════
const PYLON_DEF = {
  key: 'crystal_pylon', name: 'Pilar de resonancia', hp: 14, speed: 0, w: 0.9, h: 2.4, knockRes: 1,
  model: () => [
    P('base', [1.0, 0.4, 1.0], [0, 0.2, 0], '#5a5880'),
    P('crystal', [0.6, 1.8, 0.6], [0, 1.3, 0], '#9af6ff', { pivot: [0, 1.3, 0], emissive: true }),
    P('tip', [0.3, 0.4, 0.3], [0, 2.4, 0], '#e8ffff', { pivot: [0, 1.3, 0], parent: 'crystal', emissive: true }),
  ],
};
export class CrystalPylon extends Mob {
  constructor(game, boss) {
    super(game, PYLON_DEF);
    this.boss = boss; this.isPylon = true;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2.2, 0), new THREE.Vector3(0, 2.2, 0)]);
    this.beam = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9af6ff })); this.beam.userData.ownMat = true;
    this.obj.add(this.beam);
  }
  hurt(amount, sx, sz, knock, source) {
    if (this.deathTime >= 0 || this.hurtTime > 0.2) return false;
    this.hp -= amount; this.hurtTime = 0.3; this.lastHitBy = source;
    this.game.audio && this.game.audio.blockSound('break', 'glass', this.x, this.y + 1, this.z);
    this.game.particles.emit(this.x, this.y + 1.3, this.z, 0x9af6ff, 6, 2.5);
    if (this.hp <= 0) this.die(source);
    return true;
  }
  update(dt) {
    super.update(dt);
    if (this.removed || !this.obj) return;
    if (this.model.parts.crystal) this.model.parts.crystal.rotation.y += dt * 1.5;
    const b = this.boss;
    const pos = this.beam.geometry.attributes.position;
    if (b && !b.removed && b.deathTime < 0 && this.deathTime < 0) {
      pos.setXYZ(1, (b.x - this.x), b.y + b.h * 0.55 - this.y, (b.z - this.z));
      // el modelo gira con yaw: deshacer el giro para que el rayo apunte bien
      const c = Math.cos(-this.yaw), s = Math.sin(-this.yaw);
      const lx = pos.getX(1), lz = pos.getZ(1);
      pos.setXYZ(1, lx * c + lz * s, pos.getY(1), -lx * s + lz * c);
    } else pos.setXYZ(1, 0, 2.2, 0);
    pos.needsUpdate = true;
  }
  setTint(r, g, b) { super.setTint(Math.max(r, 0.6), Math.max(g, 0.6), Math.max(b, 0.6)); }
  get persistent() { return false; }
}

// ═════════════════════════ Base de los jefes ═════════════════════════
export class Boss extends Mob {
  constructor(game, def) {
    super(game, def);
    this.isBoss = true; this.noDespawn = true;
    this.home = null;            // posición del altar {x,y,z}
    this.phase = 1;              // 1..3
    this.intro = 2.6;            // segundos de aparición (invulnerable)
    this.transition = 0;         // pausa al cambiar de fase (invulnerable)
    this.atkCd = 2.2; this.action = null; this.awayTime = 0;
    this.shield = false; this.stun = 0; this.cool = 0; this.rage = 1;
    this.minions = []; this.summonCd = 6; this.hitCount = 0;
    this.knockRes = 1; this.stepHeight = 1.05;
    this._weakToastCd = 0;
  }
  get persistent() { return this.deathTime < 0 && !this.removed; }
  serialize() { return { t: this.type, x: this.x, y: this.y, z: this.z, hp: this.hp, vd: { home: this.home, phase: this.phase } }; }
  initFromData(vd) { if (vd) { this.home = vd.home || null; this.phase = vd.phase || 1; } this.intro = 0.5; }
  get frac() { return Math.max(0, this.hp / this.maxHp); }
  get phaseName() { return this.def.phaseNames[this.phase - 1] || ''; }

  // ── Daño ──
  /** Multiplicador del daño recibido según el arma del jugador, el escudo, el aturdimiento y el enfriamiento. */
  damageMultiplier(source) {
    const g = this.game;
    let m = 1 - (this.def.armor || 0);
    if (source === g.player) {
      const st = g.inventory.getSelected();
      const it = st ? Items.get(st.i) : null;
      m *= this.weakness(it);
    }
    if (this.shield) m *= 0.1;
    if (this.stun > 0) m *= 2;
    if (this.cool > 0) m *= 2;
    return m;
  }
  weakness() { return 1; }

  hurt(amount, sx, sz, knock = 1, source = null) {
    if (this.deathTime >= 0 || this.intro > 0 || this.transition > 0) return false;
    if (this.hurtTime > 0.2) return false;
    const g = this.game;
    const mul = this.damageMultiplier(source);
    this.hp -= amount * mul;
    this.hurtTime = 0.3; this.lastHitBy = source;
    g.audio && g.audio.play('hit', this.x, this.y + 1, this.z);
    this._weakToastCd -= 1;
    if (mul >= 1.5) g.particles.emit(this.x, this.y + this.h * 0.6, this.z, 0xfff07a, 10, 3);
    else if (mul <= 0.25) { g.particles.emit(this.x, this.y + this.h * 0.6, this.z, 0x9aa0b0, 6, 2); if (this._weakToastCd <= 0) { this._weakToastCd = 6; g.ui.toast(this.shield ? 'El escudo desvía el golpe: rompe los pilares de resonancia' : 'Apenas le haces daño'); } }
    this.onBossHurt && this.onBossHurt(amount * mul, source);
    if (this.hp <= 0) { this.hp = 0; this.die(source); return true; }
    this._checkPhase();
    return true;
  }

  _checkPhase() {
    const th = this.def.phases;
    let ph = 1;
    for (let i = 0; i < th.length; i++) if (this.frac <= th[i]) ph = i + 2;
    if (ph > this.phase) {
      this.phase = ph;
      this.action = null; this.transition = 1.4; this.atkCd = 1.6;
      const g = this.game;
      g.ui.centerMessage(`${this.def.short}: ${this.phaseName}`);
      g.audio && g.audio.play('roar', this.x, this.y, this.z);
      g.particles.emit(this.x, this.y + this.h * 0.5, this.z, this.def.color, 30, 5, 1.5);
      g.shake = Math.max(g.shake || 0, 0.5);
      this.onPhase && this.onPhase(ph);
    }
  }

  die(source) {
    if (this.deathTime >= 0) return;
    this.deathTime = 0; this.action = null;
    const g = this.game;
    g.audio && g.audio.play('roar', this.x, this.y, this.z);
    for (const m of this.minions) if (!m.removed) { m.removed = true; g.particles.emit(m.x, m.y + 0.5, m.z, 0xaaaaaa, 8, 2); }
    g.mobKilled && g.mobKilled(this, source);
  }

  /** Recompensas al terminar la animación de muerte. */
  _reward() {
    const g = this.game, def = this.def;
    const x = this.x, y = this.y + 1, z = this.z;
    const drop = (key, n) => { if (n > 0) g.dropItem({ i: Items.id(key), n, d: 0 }, x, y, z, 2.4); };
    const first = !(g.bossKills && g.bossKills[def.key]);
    drop('heart_crystal', 1);
    drop(def.essence, 1);
    if (first || Math.random() < 0.3) drop(def.unique, 1);
    drop('sun_coin', 8 + Math.floor(Math.random() * 7));
    for (const d of def.extraDrops || []) drop(d.item, d.min + Math.floor(Math.random() * (d.max - d.min + 1)));
    g.onBossDefeated && g.onBossDefeated(this);
  }

  /** El jugador se ha ido o ha muerto: el jefe vuelve a dormir y deja la ofrenda en el altar. */
  sleepAgain() {
    const g = this.game, h = this.home;
    this.removed = true;
    for (const m of this.minions) if (!m.removed) m.removed = true;
    if (h) g.dropItem({ i: Items.id(this.def.summon), n: 1, d: 0 }, h.x + 0.5, h.y + 1.2, h.z + 0.5, 0.3);
    g.ui.toast(`${this.def.short} vuelve a dormir: la ofrenda ha quedado sobre el altar`, 4000);
    g.onBossSlept && g.onBossSlept(this);
  }

  // ── Ayudas para los ataques ──
  get target() { return this.game.player; }
  face(x, z) { this.targetYaw = Math.atan2(-(x - this.x), -(z - this.z)); }
  forward(d = 1) { return [this.x - Math.sin(this.yaw) * d, this.z - Math.cos(this.yaw) * d]; }
  moveToward(tx, tz, mul = 1) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    this.wishX = (dx / d) * mul; this.wishZ = (dz / d) * mul;
    return d;
  }
  /** Anillo de partículas en el suelo (aviso de un ataque de área). */
  ring(x, y, z, r, color, n = 10) {
    const pt = this.game.particles;
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; pt.emit(x + Math.cos(a) * r, y + 0.15, z + Math.sin(a) * r, color, 1, 0.4, 0.1); }
  }
  /** Daño de área al jugador. o: {launch, fire, effect:[id,s,lvl], ground (solo si está en el suelo), dy} */
  aoe(x, y, z, r, dmg, o = {}) {
    const g = this.game, p = g.player;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > r || Math.abs(p.y - y) > (o.dy ?? 2.5)) return false;
    if (o.ground && !p.onGround) return false;
    const hit = g.survival.damage(dmg, 'mob', { x, z });
    if (hit) {
      if (o.launch) p.vy = Math.max(p.vy, o.launch);
      if (o.fire && !g.survival.effects.has('fire_resistance')) g.survival.fire = Math.max(g.survival.fire, o.fire);
      if (o.effect) g.survival.effects.add(o.effect[0], o.effect[1], o.effect[2] || 1);
    }
    return hit;
  }
  shoot(o) { const m = new Missile(this.game, { owner: this, ...o }); this.game.entities.add(m); return m; }
  /** Dispara hacia (tx,ty,tz) con rapidez sp; spread en radianes. */
  shootAt(tx, ty, tz, sp, o = {}, spread = 0) {
    const sx = o.x ?? this.x, sy = o.y ?? this.y + this.h * 0.7, sz = o.z ?? this.z;
    let dx = tx - sx, dy = ty - sy, dz = tz - sz; const d = Math.hypot(dx, dy, dz) || 1;
    dx /= d; dy /= d; dz /= d;
    if (spread) { const a = Math.atan2(dx, dz) + spread; const h = Math.hypot(dx, dz); dx = Math.sin(a) * h; dz = Math.cos(a) * h; }
    const lift = (o.gravity ?? 4) * d / sp * 0.5; // compensa la caída
    return this.shoot({ x: sx, y: sy, z: sz, vx: dx * sp, vy: dy * sp + lift, vz: dz * sp, ...o });
  }
  spawnMinion(key, x, z) {
    const g = this.game;
    const y = this.home ? this.home.y + 1.2 : this.y + 0.5;
    const m = g.spawnMob(key, x, Math.max(y, this.y + 0.2), z);
    if (!m) return null;
    m.bossMinion = true; m.boss = this; m.noDespawn = true;
    this.minions.push(m);
    g.particles.emit(x, m.y + 0.5, z, this.def.color, 12, 2.5);
    return m;
  }
  aliveMinions() { this.minions = this.minions.filter((m) => !m.removed && m.deathTime < 0); return this.minions.length; }

  // ── Bucle ──
  update(dt) {
    this.age += dt;
    const g = this.game, w = this.world;
    if (this.deathTime >= 0) { this._updateDeath(dt); return; }
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    if (!this.home) this.home = { x: Math.floor(this.x), y: Math.floor(this.y), z: Math.floor(this.z) };
    if (this.intro > 0) { this._updateIntro(dt); return; }
    this.wishX = this.wishZ = 0; this.wantJump = false; this.flyTargetVy = 0;
    this.stun = Math.max(0, this.stun - dt); this.cool = Math.max(0, this.cool - dt); this.transition = Math.max(0, this.transition - dt);
    this.summonCd -= dt;
    this.always && this.always(dt);
    const p = g.player;
    // ¿Se ha ido el jugador?
    const pd = Math.hypot(p.x - this.home.x, p.z - this.home.z);
    if (g.survival.dead || pd > 44 || Math.abs(p.y - this.home.y) > 40) { this.awayTime += dt; if (this.awayTime > 10) { this.sleepAgain(); return; } }
    else this.awayTime = 0;
    if (this.stun > 0) { if (Math.random() < 0.2) g.particles.emit(this.x, this.y + this.h + 0.2, this.z, 0xfff07a, 1, 1); }
    else if (this.transition <= 0) {
      this.atkCd -= dt * this.rage * (this.cool > 0 ? 0.6 : 1);
      if (this.action) { this.action.t += dt; this.runAction(this.action, dt); if (this.action && this.action.t >= this.action.dur) this.action = null; }
      else this.behave(dt, p);
    }
    if (this.removed) return;
    if (this.rooted > 0) { this.rooted -= dt; this.wishX = this.wishZ = 0; if (Math.random() < 0.2) g.particles.emit(this.x, this.y + 0.3, this.z, 0x5aa840, 2, 1); }
    const fl = w.fluidAt(Math.floor(this.x), Math.floor(this.y + this.h * 0.4), Math.floor(this.z));
    this.inWater = fl === 1; this.inLava = fl === 2;
    if (!this.dashing) {
      const spd = this.speed * (this.rage > 1 ? this.rage : 1) * (this.cool > 0 ? 0.7 : 1);
      const acc = (this.def.flying ? 12 : this.onGround ? 24 : 8) * dt;
      this.vx = approach(this.vx, this.wishX * spd, acc); this.vz = approach(this.vz, this.wishZ * spd, acc);
      if (this.def.flying) this.vy = approach(this.vy, this.flyTargetVy || 0, 10 * dt);
      else if (this.inWater || this.inLava) { this.vy -= 12 * dt; this.vy = Math.max(this.vy, -4); }
      else { this.vy -= 30 * dt; if (this.vy < -40) this.vy = -40; }
    }
    const px = this.x, pz = this.z;
    moveEntity(w, this, this.vx * dt, this.vy * dt, this.vz * dt);
    if ((this.hitX || this.hitZ) && this.onGround && (this.wishX || this.wishZ) && !this.def.flying) {
      const wl = Math.hypot(this.wishX, this.wishZ) || 1;
      if (!boxCollides(w, this.x + (this.wishX / wl) * 0.5, this.y + 1.05, this.z + (this.wishZ / wl) * 0.5, this.w, this.h)) this.vy = 9.5;
    }
    if (this.dashing && (this.hitX || this.hitZ)) this.onDashBlocked && this.onDashBlocked();
    const moved = Math.hypot(this.x - px, this.z - pz);
    this.walkAmt = approach(this.walkAmt, Math.min(1, moved / Math.max(dt, 1e-3) / Math.max(0.5, this.speed)), 6 * dt);
    this.walkPhase += moved * 2.0;
    if (!this.dashing && (this.wishX || this.wishZ) && !this.action) this.targetYaw = Math.atan2(-this.wishX, -this.wishZ);
    this.yaw += clamp(angleDiff(this.yaw, this.targetYaw), -5 * dt, 5 * dt);
    this._sync();
    this.obj.rotation.y = this.yaw; this.obj.rotation.z = 0;
    this.animate(dt);
    this._tint();
  }
  _tint() {
    const l = Math.max(0.6, this.game.lightAt(this.x, this.y + this.h * 0.5, this.z));
    if (this.hurtTime > 0) this.setTint(1, 0.4, 0.4);
    else if (this.shield) this.setTint(l * 0.6, l * 0.9, 1);
    else if (this.cool > 0) this.setTint(l * 0.6, l * 0.75, l);
    else if (this.stun > 0) this.setTint(l, l, l * 0.6);
    else this.setTint(l, l, l);
  }
  _updateIntro(dt) {
    const g = this.game, p = g.player;
    this.intro -= dt;
    this.face(p.x, p.z); this.yaw += clamp(angleDiff(this.yaw, this.targetYaw), -4 * dt, 4 * dt);
    const k = Math.max(0, this.intro) / 2.6;
    this._sync();
    this.obj.position.y = this.y - k * this.h * 0.9;
    this.obj.rotation.y = this.yaw;
    if (Math.random() < 0.6) g.particles.emit(this.x + (Math.random() - 0.5) * this.w * 2, this.y + 0.3, this.z + (Math.random() - 0.5) * this.w * 2, this.def.color, 2, 3, 0.4);
    this.animate(dt);
    this._tint();
    if (this.intro <= 0) { g.audio && g.audio.play('roar', this.x, this.y, this.z); g.shake = Math.max(g.shake || 0, 0.6); }
  }
  _updateDeath(dt) {
    const g = this.game;
    this.deathTime += dt;
    this._sync();
    this.obj.position.y = this.y - Math.max(0, this.deathTime - 1) * 1.2;
    this.obj.rotation.z = Math.sin(this.deathTime * 34) * 0.04;
    this.setTint(1, 0.55 + 0.45 * Math.sin(this.deathTime * 20), 0.5);
    if (Math.random() < 0.5) g.particles.emit(this.x + (Math.random() - 0.5) * this.w * 2, this.y + Math.random() * this.h, this.z + (Math.random() - 0.5) * this.w * 2, this.def.color, 3, 3);
    if (this.deathTime > 2.4 && !this._looted) { this._looted = true; this._reward(); this.removed = true; g.particles.emit(this.x, this.y + this.h / 2, this.z, 0xffffff, 40, 6, 2); g.audio && g.audio.play('boom', this.x, this.y, this.z); }
  }
  setTint(r, g, b) { this.model.mat.color.setRGB(r, g, b); }

  /** Mantenerse dentro de la arena: devuelve true si está volviendo al centro. */
  leash(radius) {
    if (!this.home) return false;
    const d = Math.hypot(this.x - (this.home.x + 0.5), this.z - (this.home.z + 0.5));
    if (d > radius) { this.moveToward(this.home.x + 0.5, this.home.z + 0.5, 1); return true; }
    return false;
  }
  behave() {}
  runAction() {}
}

// ═════════════════════════ Guardián del Bosque Antiguo ═════════════════════════
class ForestGuardian extends Boss {
  weakness(it) { return it && it.tool && it.tool.type === 'axe' ? 2 : 1; }
  onPhase(ph) { if (ph >= 3) this.rage = 1.35; this.summonCd = 0.5; }
  behave(dt, p) {
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    // Fase 3: los brotes vivos lo curan
    if (this.phase >= 3) {
      const n = this.aliveMinions();
      if (n) { this.hp = Math.min(this.maxHp, this.hp + 1.2 * n * dt); if (Math.random() < 0.15) this.game.particles.emit(this.x, this.y + 2.2, this.z, 0x9aff6a, 2, 1.5); }
    }
    if (!this.leash(19)) { if (dist > 2.6) this.moveToward(p.x, p.z, 1); else this.face(p.x, p.z); }
    if (this.atkCd > 0) return;
    if (dist < 3.6) { this.action = { id: 'slam', t: 0, dur: 1.1, tele: 0.65 }; this.atkCd = 1.7; }
    else if (this.phase >= 2 && this.summonCd <= 0 && this.aliveMinions() < 4) { this.action = { id: 'call', t: 0, dur: 1.2 }; this.summonCd = 16; this.atkCd = 1.5; }
    else {
      const tg = [[p.x, p.z]];
      if (this.phase >= 2) { const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz) || 1; tg.push([p.x - dz / d * 2.6, p.z + dx / d * 2.6], [p.x + dz / d * 2.6, p.z - dx / d * 2.6]); }
      this.action = { id: 'roots', t: 0, dur: 1.4, tele: 1.0, targets: tg.map(([x, z]) => [x, Math.floor(p.y), z]) };
      this.atkCd = 2.6;
    }
  }
  runAction(a) {
    const g = this.game, p = g.player;
    if (a.id === 'slam') {
      this.face(p.x, p.z);
      const [fx, fz] = this.forward(1.8);
      if (a.t < a.tele) { if (Math.random() < 0.5) this.ring(fx, this.y, fz, 2.4, 0x6ad040, 3); }
      else if (!a.done) { a.done = true; this.aoe(fx, this.y, fz, 2.6, 7, { launch: 5 }); g.audio && g.audio.play('boom', fx, this.y, fz); g.particles.emit(fx, this.y + 0.3, fz, 0x6a5236, 14, 4, 1.2); }
    } else if (a.id === 'roots') {
      if (a.t < a.tele) { for (const t of a.targets) if (Math.random() < 0.7) this.ring(t[0], t[1], t[2], 1.5, 0x5aa840, 2); }
      else if (!a.done) {
        a.done = true;
        for (const t of a.targets) {
          this.aoe(t[0], t[1], t[2], 1.6, 6, { launch: 10, effect: ['slowness', 3, 2] });
          g.particles.emit(t[0], t[1] + 0.5, t[2], 0x6a5236, 16, 6, 0.6);
          g.particles.emit(t[0], t[1] + 0.8, t[2], 0x4f8a3a, 8, 5, 0.6);
        }
        g.audio && g.audio.blockSound('break', 'wood', a.targets[0][0], a.targets[0][1], a.targets[0][2]);
      }
    } else if (a.id === 'call') {
      if (a.t >= 0.6 && !a.done) {
        a.done = true;
        for (let i = 0; i < 3; i++) { const ang = this.yaw + (i - 1) * 1.2; this.spawnMinion('thorn_sprout', this.x - Math.sin(ang) * 2.5, this.z - Math.cos(ang) * 2.5); }
        g.audio && g.audio.play('roar', this.x, this.y, this.z);
      }
    }
  }
  animate() {
    const pt = this.model.parts, a = this.action;
    const s = Math.sin(this.walkPhase) * 0.6 * this.walkAmt;
    pt.legL.rotation.x = s; pt.legR.rotation.x = -s;
    let arm = -s * 0.5;
    if (a && a.id === 'slam') arm = a.t < a.tele ? -2.4 * (a.t / a.tele) : -2.4 + Math.min(1, (a.t - a.tele) * 6) * 2.6;
    if (a && (a.id === 'roots' || a.id === 'call')) arm = -1.2 - Math.sin(a.t * 10) * 0.3;
    pt.armL.rotation.x = arm; pt.armR.rotation.x = a && a.id !== 'slam' ? arm : (a ? arm : s * 0.5);
    pt.head.rotation.y = Math.sin(this.age * 0.7) * 0.15;
  }
}

// ═════════════════════════ Coloso de Cristal ═════════════════════════
class CrystalColossus extends Boss {
  constructor(game, def) { super(game, def); this.pylons = []; }
  weakness(it) {
    const t = it && it.tool;
    if (t && t.type === 'pickaxe') return 2;
    if (t && t.type === 'sword') return 0.6;
    return 1;
  }
  onPhase(ph) {
    if (ph >= 2) this.raisePylons(ph === 2 ? 4 : 3);
    if (ph >= 3) this.rage = 1.4;
  }
  raisePylons(n) {
    const g = this.game, h = this.home || { x: Math.floor(this.x), y: Math.floor(this.y), z: Math.floor(this.z) };
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const x = h.x + 0.5 + Math.cos(a) * 7, z = h.z + 0.5 + Math.sin(a) * 7;
      const py = new CrystalPylon(g, this);
      py.setPos(x, h.y + 1.5, z);
      g.entities.add(py);
      this.pylons.push(py);
      g.particles.emit(x, h.y + 1.5, z, 0x9af6ff, 16, 4);
    }
    this.shield = true;
    g.ui.toast('¡Pilares de resonancia! Rómpelos para quitarle el escudo', 3500);
  }
  /** El escudo depende de los pilares vivos (se comprueba en cada fotograma, también durante ataques y pausas). */
  always() {
    this.pylons = this.pylons.filter((q) => !q.removed && q.deathTime < 0);
    this.shield = this.pylons.length > 0;
  }
  behave(dt, p) {
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    if (!this.leash(15)) { if (dist > 3.2) this.moveToward(p.x, p.z, 1); else this.face(p.x, p.z); }
    if (this.atkCd > 0) return;
    if (dist < 5.5 && Math.random() < 0.65) { this.action = { id: 'stomp', t: 0, dur: 1.4, tele: 0.95 }; this.atkCd = 2.3; }
    else { this.action = { id: 'volley', t: 0, dur: 1.1, tele: 0.55 }; this.atkCd = 2.9; }
  }
  runAction(a) {
    const g = this.game, p = g.player;
    if (a.id === 'stomp') {
      if (a.t < a.tele) { this.ring(this.x, this.y, this.z, 5, 0x58d6e8, 4); this.ring(this.x, this.y, this.z, 2.5, 0x58d6e8, 2); }
      else if (!a.done) {
        a.done = true;
        this.aoe(this.x, this.y, this.z, 5.2, 8, { launch: 7, ground: true });
        g.audio && g.audio.play('boom', this.x, this.y, this.z); g.shake = Math.max(g.shake || 0, 0.45);
        for (let r = 1.5; r <= 5; r += 1.2) this.ring(this.x, this.y, this.z, r, 0x9af6ff, 10);
      }
    } else if (a.id === 'volley') {
      this.face(p.x, p.z);
      if (a.t >= a.tele && !a.done) {
        a.done = true;
        const o = { color: 0x58d6e8, size: 0.28, gravity: 2, dmg: 4, kind: 'shard' };
        for (let i = -2; i <= 2; i++) this.shootAt(p.x, p.y + 1, p.z, 16, o, i * 0.16);
        if (this.phase >= 3) for (let i = 0; i < 8; i++) { const ang = (i / 8) * Math.PI * 2; this.shoot({ ...o, x: this.x, y: this.y + 2.2, z: this.z, vx: Math.sin(ang) * 12, vy: 1, vz: Math.cos(ang) * 12 }); }
        g.audio && g.audio.blockSound('break', 'glass', this.x, this.y + 2, this.z);
      }
    }
  }
  animate() {
    const pt = this.model.parts, a = this.action;
    const s = Math.sin(this.walkPhase) * 0.5 * this.walkAmt;
    pt.legL.rotation.x = s; pt.legR.rotation.x = -s;
    let al = -s * 0.4, ar = s * 0.4;
    if (a && a.id === 'stomp') { const k = a.t < a.tele ? a.t / a.tele : 1 - Math.min(1, (a.t - a.tele) * 5); al = ar = -2.6 * k; }
    if (a && a.id === 'volley') { ar = -1.6; al = -0.4; }
    pt.armL.rotation.x = al; pt.armR.rotation.x = ar;
    if (pt.core) pt.core.scale.setScalar(1 + Math.sin(this.age * 6) * 0.12 + (this.shield ? 0.3 : 0));
  }
}

// ═════════════════════════ Reina de las Profundidades ═════════════════════════
class DeepQueen extends Boss {
  constructor(game, def) { super(game, def); this.orbit = Math.random() * 6.28; this.inkCd = 10; this.whirlCd = 6; }
  weakness() { return this.inWater ? 1 : 1.5; }
  onPhase(ph) { if (ph >= 3) this.rage = 1.25; this.summonCd = 0.5; }
  onDashBlocked() {
    const g = this.game;
    this.dashing = false; this.action = null; this.vx = this.vz = 0;
    this.stun = 2.6;
    g.audio && g.audio.play('boom', this.x, this.y, this.z); g.shake = Math.max(g.shake || 0, 0.3);
    g.particles.emit(this.x, this.y + 0.8, this.z, 0xfff07a, 16, 4);
    g.ui.toast('¡La Reina está aturdida!', 1500);
  }
  behave(dt, p) {
    const g = this.game, h = this.home;
    // fuera del agua se debilita
    if (!this.inWater) { this._dry = (this._dry || 0) + dt; if (this._dry > 1) { this._dry = 0; this.hp -= 2; this._checkPhase(); if (this.hp <= 0) { this.die(null); return; } } }
    this.inkCd -= dt; this.whirlCd -= dt;
    this.orbit += dt * 0.6;
    let tx = p.x + Math.cos(this.orbit) * 6, tz = p.z + Math.sin(this.orbit) * 6;
    // dentro de la arena
    if (h) { const dx = tx - (h.x + 0.5), dz = tz - (h.z + 0.5), d = Math.hypot(dx, dz); if (d > 17) { tx = h.x + 0.5 + dx / d * 17; tz = h.z + 0.5 + dz / d * 17; } }
    const top = Math.max(h ? h.y + 2 : this.y, SEA_LEVEL - 2);
    const ty = clamp(p.y + 1.2, h ? h.y + 1.5 : p.y, top);
    this.moveToward(tx, tz, 1);
    this.flyTargetVy = clamp((ty - this.y) * 2, -3, 3);
    if (this.atkCd > 0) return;
    const dist = Math.hypot(p.x - this.x, p.y - this.y, p.z - this.z);
    if (this.phase >= 3 && this.whirlCd <= 0) { this.action = { id: 'whirl', t: 0, dur: 3 }; this.whirlCd = 14; this.atkCd = 1.5; }
    else if (this.phase >= 2 && this.inkCd <= 0) { this.action = { id: 'ink', t: 0, dur: 1.2, tele: 0.8 }; this.inkCd = 20; this.atkCd = 1.2; }
    else if (this.phase >= 2 && this.summonCd <= 0 && this.aliveMinions() < 3) { this.action = { id: 'call', t: 0, dur: 0.8 }; this.summonCd = 18; this.atkCd = 1; }
    else if (dist < 18 && Math.random() < 0.55) { this.action = { id: 'charge', t: 0, dur: 2.2, tele: 0.9 }; this.atkCd = 2.4; }
    else { this.action = { id: 'spit', t: 0, dur: 0.9, tele: 0.4 }; this.atkCd = 2.2; }
  }
  runAction(a, dt) {
    const g = this.game, p = g.player;
    if (a.id === 'charge') {
      if (a.t < a.tele) {
        this.face(p.x, p.z); this.vx *= 0.9; this.vz *= 0.9; this.vy *= 0.9;
        if (Math.random() < 0.5) g.particles.emit(this.x, this.y + 0.8, this.z, 0x7af0ff, 2, 1.5);
        return;
      }
      if (!a.dir) {
        const dx = p.x - this.x, dy = p.y + 0.8 - (this.y + 0.7), dz = p.z - this.z, d = Math.hypot(dx, dy, dz) || 1;
        a.dir = [dx / d, dy / d, dz / d]; this.dashing = true;
        g.audio && g.audio.play('splash', this.x, this.y, this.z);
      }
      const sp = 15;
      this.vx = a.dir[0] * sp; this.vy = a.dir[1] * sp; this.vz = a.dir[2] * sp;
      this.targetYaw = Math.atan2(-a.dir[0], -a.dir[2]);
      if (Math.hypot(p.x - this.x, p.y + 0.8 - (this.y + 0.7), p.z - this.z) < 1.9 && !a.hit) { a.hit = true; this.aoe(this.x, this.y, this.z, 3, 8, { launch: 6, dy: 4 }); }
      if (a.t >= a.tele + 1.1) { this.dashing = false; a.t = a.dur; }
    } else if (a.id === 'spit') {
      this.face(p.x, p.z);
      if (a.t >= a.tele && !a.done) {
        a.done = true;
        const o = { color: 0x7ae05a, size: 0.32, gravity: 0, dmg: 3, kind: 'poison', onHit: (m, t) => { if (t === p) g.survival.effects.add('poison', 6, 1); } };
        for (let i = -1; i <= 1; i++) this.shootAt(p.x, p.y + 1, p.z, 12, o, i * 0.2);
      }
    } else if (a.id === 'ink') {
      if (a.t < a.tele) { g.particles.emit(this.x, this.y + 0.8, this.z, 0x1a1428, 4, 3, 1); }
      else if (!a.done) {
        a.done = true;
        g.particles.emit(this.x, this.y + 0.8, this.z, 0x1a1428, 40, 7, 3);
        if (Math.hypot(p.x - this.x, p.y - this.y, p.z - this.z) < 16 && g.mode !== 'creative') { g.survival.effects.add('darkness', 8, 1); g.ui.toast('La tinta abisal te nubla la vista', 2000); }
      }
    } else if (a.id === 'call') {
      if (!a.done) { a.done = true; for (let i = 0; i < 2; i++) this.spawnMinion('tide_jelly', this.x + (i ? 2 : -2), this.z + 1); }
    } else if (a.id === 'whirl') {
      this.yaw += dt * 9; this.targetYaw = this.yaw;
      const dx = this.x - p.x, dy = this.y - p.y, dz = this.z - p.z, d = Math.hypot(dx, dy, dz) || 1;
      if (d < 22 && g.mode !== 'creative') { p.vx += dx / d * 16 * dt; p.vz += dz / d * 16 * dt; p.vy += dy / d * 6 * dt; }
      if (Math.random() < 0.6) this.ring(this.x, this.y, this.z, 2 + Math.random() * 4, 0x7af0ff, 2);
      if (d < 2.4 && !a.hit) { a.hit = true; this.aoe(this.x, this.y, this.z, 3, 6, { dy: 4 }); }
    }
  }
  animate() {
    const pt = this.model.parts;
    const f = Math.sin(this.age * (this.dashing ? 16 : 5)) * 0.5;
    pt.wingL.rotation.z = f; pt.wingR.rotation.z = -f;
    pt.tail1.rotation.y = Math.sin(this.age * 3) * 0.35; pt.tail2.rotation.y = Math.sin(this.age * 3 + 1) * 0.4;
    pt.tentL.rotation.x = Math.sin(this.age * 4) * 0.3; pt.tentR.rotation.x = -Math.sin(this.age * 4) * 0.3;
    this.obj.rotation.x = this.dashing ? -0.2 : 0;
  }
}

// ═════════════════════════ Titán Volcánico ═════════════════════════
class VolcanicTitan extends Boss {
  constructor(game, def) { super(game, def); this.meteorCd = 4; }
  weakness() { return 1; }
  onPhase(ph) { if (ph >= 3) this.rage = 1.3; this.summonCd = 0.5; }
  /** Bolas de nieve y cubos de agua lo enfrían. */
  onSnowball() { this.coolDown(6); }
  coolDown(sec) {
    const g = this.game;
    const was = this.cool > 0;
    this.cool = Math.max(this.cool, sec);
    g.particles.emit(this.x, this.y + this.h * 0.6, this.z, 0xdde8f0, 20, 3, 1.5);
    g.audio && g.audio.play('fizz', this.x, this.y + 2, this.z);
    if (!was) g.ui.toast('¡El Titán se ha enfriado! Recibe el doble de daño', 2200);
  }
  onBossHurt(dmg, source) {
    const g = this.game;
    if (this.phase >= 3 && source === g.player && this.cool <= 0 && !g.survival.effects.has('fire_resistance')) g.survival.fire = Math.max(g.survival.fire, 3);
  }
  behave(dt, p) {
    this.meteorCd -= dt;
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    if (this.cool > 0 && Math.random() < 0.2) this.game.particles.emit(this.x, this.y + this.h, this.z, 0xdde8f0, 1, 1.5);
    if (!this.leash(16)) { if (dist > 3.4) this.moveToward(p.x, p.z, 1); else this.face(p.x, p.z); }
    if (this.atkCd > 0) return;
    if (this.phase >= 2 && this.summonCd <= 0 && this.aliveMinions() < 3) { this.action = { id: 'call', t: 0, dur: 1 }; this.summonCd = 20; this.atkCd = 1.2; }
    else if (this.phase >= 2 && this.meteorCd <= 0) {
      const strikes = [];
      for (let i = 0; i < 6; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 4; strikes.push({ x: p.x + Math.cos(a) * r, y: Math.floor(p.y), z: p.z + Math.sin(a) * r, at: 0.3 + i * 0.45, done: false }); }
      this.action = { id: 'meteors', t: 0, dur: 4.2, strikes }; this.meteorCd = 12; this.atkCd = 2;
    }
    else if (dist < 4.5) { this.action = { id: 'hammer', t: 0, dur: 1.5, tele: 1.0 }; this.atkCd = 2.2; }
    else { this.action = { id: 'fireball', t: 0, dur: 0.9, tele: 0.5 }; this.atkCd = 3.2; }
  }
  explode(x, y, z, r, dmg) {
    const g = this.game;
    this.aoe(x, y, z, r, dmg, { fire: 3, launch: 4 });
    g.particles.emit(x, y + 0.5, z, 0xff7a1a, 18, 5, 0.8); g.particles.emit(x, y + 0.5, z, 0x3a2c30, 10, 3, 0.8);
    g.audio && g.audio.play('boom', x, y, z);
  }
  runAction(a) {
    const g = this.game, p = g.player;
    if (a.id === 'hammer') {
      this.face(p.x, p.z);
      const [fx, fz] = this.forward(2.6);
      if (a.t < a.tele) { if (Math.random() < 0.6) this.ring(fx, this.y, fz, 3, 0xff7a1a, 3); }
      else if (!a.done) { a.done = true; this.aoe(fx, this.y, fz, 3.2, 10, { fire: 4, launch: 6 }); g.shake = Math.max(g.shake || 0, 0.6); g.audio && g.audio.play('boom', fx, this.y, fz); g.particles.emit(fx, this.y + 0.3, fz, 0xff9a2a, 22, 5, 1.5); }
    } else if (a.id === 'fireball') {
      this.face(p.x, p.z);
      if (a.t >= a.tele && !a.done) {
        a.done = true;
        const [hx, hz] = this.forward(1.5);
        this.shootAt(p.x, p.y + 0.5, p.z, 13, { x: hx, y: this.y + 4, z: hz, color: 0xff7a1a, size: 0.6, gravity: 8, dmg: 0, kind: 'fire', onHit: (m) => this.explode(m.x, m.y, m.z, 2.4, 6) });
        g.audio && g.audio.play('shoot', this.x, this.y + 3, this.z);
      }
    } else if (a.id === 'meteors') {
      for (const s of a.strikes) {
        if (s.done) continue;
        if (a.t < s.at + 1.2) { if (a.t >= s.at && Math.random() < 0.7) this.ring(s.x, s.y, s.z, 1.8, 0xff5a10, 3); }
        else { s.done = true; this.explode(s.x, s.y, s.z, 1.9, 7); }
      }
    } else if (a.id === 'call') {
      if (!a.done && a.t > 0.5) { a.done = true; for (let i = 0; i < 2; i++) this.spawnMinion('ember_imp', this.x + (i ? 2.5 : -2.5), this.z + 1); }
    }
  }
  animate() {
    const pt = this.model.parts, a = this.action;
    const s = Math.sin(this.walkPhase) * 0.5 * this.walkAmt;
    pt.legL.rotation.x = s; pt.legR.rotation.x = -s;
    let ar = s * 0.4, al = -s * 0.4;
    if (a && a.id === 'hammer') ar = a.t < a.tele ? -2.8 * (a.t / a.tele) : -2.8 + Math.min(1, (a.t - a.tele) * 7) * 3.1;
    if (a && a.id === 'fireball') al = -1.8;
    if (a && a.id === 'meteors') { al = ar = -2.6; }
    pt.armR.rotation.x = ar; pt.armL.rotation.x = al;
    const glow = this.cool > 0 ? 0.3 : 1;
    if (pt.chest) pt.chest.scale.setScalar(glow * (1 + Math.sin(this.age * 4) * 0.08));
  }
}

// ═════════════════════════ Soberano de la Dimensión Oscura ═════════════════════════
class Sovereign extends Boss {
  constructor(game, def) { super(game, def); this.orbit = Math.random() * 6.28; this.blinkCd = 6; this.pillarCd = 4; }
  /** Recibe más daño cerca de la luz de bloques (antorchas, faroles) y con la Hoja prismática. */
  weakness(it) { return it && it.key === 'prism_blade' ? 2 : 1; }
  inLight() {
    const w = this.world, x = Math.floor(this.x), z = Math.floor(this.z);
    for (const y of [Math.floor(this.y), Math.floor(this.y + this.h * 0.5), Math.floor(this.y + this.h)]) if (w.getBlockLight && w.getBlockLight(x, y, z) >= 10) return true;
    return false;
  }
  damageMultiplier(source) { return super.damageMultiplier(source) * (this.inLight() ? 1.5 : 1); }
  onPhase(ph) { if (ph >= 3) this.rage = 1.3; this.summonCd = 0.5; }
  blink() {
    const g = this.game, h = this.home;
    if (!h) return;
    g.particles.emit(this.x, this.y + this.h * 0.5, this.z, 0xb070ff, 20, 4, 1);
    const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 5;
    this.setPos(h.x + 0.5 + Math.cos(a) * r, h.y + 3 + Math.random() * 3, h.z + 0.5 + Math.sin(a) * r);
    this.vx = this.vy = this.vz = 0;
    g.particles.emit(this.x, this.y + this.h * 0.5, this.z, 0xb070ff, 20, 4, 1);
    g.audio && g.audio.play('magic', this.x, this.y, this.z);
  }
  behave(dt, p) {
    const h = this.home;
    this.blinkCd -= dt; this.pillarCd -= dt;
    this.orbit += dt * 0.5;
    let tx = (h ? h.x + 0.5 : p.x) + Math.cos(this.orbit) * 7, tz = (h ? h.z + 0.5 : p.z) + Math.sin(this.orbit) * 7;
    const ty = (h ? h.y : p.y) + 4 + Math.sin(this.age * 0.8) * 1.5;
    this.moveToward(tx, tz, 0.8);
    this.flyTargetVy = clamp((ty - this.y) * 2, -3, 3);
    this.face(p.x, p.z);
    if (this.phase >= 2 && this.blinkCd <= 0) { this.blinkCd = 7; this.blink(); }
    if (this.atkCd > 0) return;
    if (this.summonCd <= 0 && this.aliveMinions() < 3) { this.action = { id: 'call', t: 0, dur: 1 }; this.summonCd = 20; this.atkCd = 1.2; }
    else if (this.phase >= 3 && this.pillarCd <= 0) {
      const strikes = [];
      for (let i = 0; i < 5; i++) { const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 1.5 + Math.random() * 3.5; strikes.push({ x: p.x + Math.cos(a) * r, y: Math.floor(p.y), z: p.z + Math.sin(a) * r, at: 0.2 + i * 0.35 }); }
      this.action = { id: 'pillars', t: 0, dur: 3.6, strikes }; this.pillarCd = 9; this.atkCd = 1.6;
    } else if (this.phase >= 2 && Math.random() < 0.45) {
      this.action = { id: 'beam', t: 0, dur: 1.6, tele: 1.2, from: [this.x, this.y + this.h * 0.6, this.z], to: [p.x, p.y + 1, p.z] }; this.atkCd = 2.6;
    } else { this.action = { id: 'bolts', t: 0, dur: 0.9, tele: 0.45 }; this.atkCd = 2.0; }
  }
  runAction(a) {
    const g = this.game, p = g.player;
    if (a.id === 'bolts') {
      if (a.t >= a.tele && !a.done) {
        a.done = true;
        const o = { color: 0xb070ff, size: 0.34, gravity: 0, dmg: 5, kind: 'shadow', homing: 1.4, life: 5, onHit: (m, t) => { if (t === p) g.survival.effects.add('weakness', 6, 1); } };
        const n = this.phase >= 3 ? 5 : 3;
        for (let i = 0; i < n; i++) this.shootAt(p.x, p.y + 1, p.z, 9, o, (i - (n - 1) / 2) * 0.35);
        if (this.phase >= 3) for (let i = 0; i < 8; i++) { const ang = (i / 8) * Math.PI * 2; this.shoot({ ...o, homing: 0, x: this.x, y: this.y + 2, z: this.z, vx: Math.sin(ang) * 8, vy: -1, vz: Math.cos(ang) * 8 }); }
        g.audio && g.audio.play('shoot', this.x, this.y, this.z);
      }
    } else if (a.id === 'beam') {
      const [ax, ay, az] = a.from, [bx, by, bz] = a.to;
      if (a.t < a.tele) {
        // línea de aviso
        for (let k = 0; k < 4; k++) { const t = Math.random(); g.particles.emit(ax + (bx - ax) * t * 1.6, ay + (by - ay) * t * 1.6, az + (bz - az) * t * 1.6, 0xe8c0ff, 1, 0.2, 0.05); }
      } else if (!a.done) {
        a.done = true;
        // distancia del jugador al rayo (segmento prolongado)
        const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz || 1;
        const px = p.x - ax, py = p.y + 1 - ay, pz = p.z - az;
        const t = Math.max(0, Math.min(1.8, (px * dx + py * dy + pz * dz) / L2));
        const d = Math.hypot(px - dx * t, py - dy * t, pz - dz * t);
        if (d < 1.4 && g.mode !== 'creative') { if (g.survival.damage(9, 'magic', { x: ax, z: az })) g.survival.effects.add('darkness', 5, 1); }
        for (let k = 0; k <= 20; k++) { const s2 = k / 20 * 1.8; g.particles.emit(ax + dx * s2, ay + dy * s2, az + dz * s2, 0xb070ff, 2, 1.2, 0.2); }
        g.audio && g.audio.play('boom', bx, by, bz);
      }
    } else if (a.id === 'pillars') {
      for (const s of a.strikes) {
        if (s.done) continue;
        if (a.t < s.at + 1.1) { if (a.t >= s.at && Math.random() < 0.7) this.ring(s.x, s.y, s.z, 1.6, 0xb070ff, 3); }
        else {
          s.done = true; this.aoe(s.x, s.y, s.z, 1.7, 8, { launch: 9 });
          g.particles.emit(s.x, s.y + 1, s.z, 0x2a1a3a, 16, 6, 0.6); g.particles.emit(s.x, s.y + 1, s.z, 0xb070ff, 10, 5, 0.6);
          g.audio && g.audio.play('boom', s.x, s.y, s.z);
        }
      }
    } else if (a.id === 'call') {
      if (!a.done && a.t > 0.5) { a.done = true; for (let i = 0; i < 2; i++) this.spawnMinion('shade_wraith', this.x + (i ? 2 : -2), this.z + 1); }
    }
  }
  animate() {
    const pt = this.model.parts, a = this.action;
    const f = Math.sin(this.age * 2) * 0.15;
    pt.armL.rotation.x = a ? -1.6 : f; pt.armR.rotation.x = a ? -1.6 : -f;
    pt.cape.rotation.x = 0.15 + Math.sin(this.age * 3) * 0.08;
    // los orbes giran alrededor del Soberano (su pivote está en el eje del cuerpo)
    pt.orb1.rotation.y = this.age * 1.6; pt.orb2.rotation.y = this.age * 1.6;
    pt.orb1.position.y = 2.4 + Math.sin(this.age * 2.1) * 0.3; pt.orb2.position.y = 2.4 - Math.sin(this.age * 2.1) * 0.3;
  }
}

const CLASSES = { forest_guardian: ForestGuardian, crystal_colossus: CrystalColossus, deep_queen: DeepQueen, volcanic_titan: VolcanicTitan, sovereign: Sovereign };
export function createBoss(game, key) {
  const C = CLASSES[key];
  return C ? new C(game, BOSSES[key]) : null;
}
