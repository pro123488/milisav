// Efectos de estado del jugador (tónicos de la mesa de alquimia, comidas especiales y ataques de jefes).
// Lógica pura: guarda {nivel, segundos} por efecto; la supervivencia, el movimiento y el combate consultan los niveles.

export const EFFECTS = {
  regeneration: { name: 'Regeneración', color: '#e8609a', good: true, desc: 'Recupera salud poco a poco' },
  strength: { name: 'Fuerza', color: '#d0453a', good: true, desc: '+3 de daño cuerpo a cuerpo por nivel' },
  speed: { name: 'Velocidad', color: '#7ac8ff', good: true, desc: '+20 % de velocidad por nivel' },
  haste: { name: 'Prisa minera', color: '#e8c84a', good: true, desc: '+25 % de velocidad al romper por nivel' },
  resistance: { name: 'Resistencia', color: '#9a9cb0', good: true, desc: '−20 % de daño recibido por nivel' },
  fire_resistance: { name: 'Resistencia al fuego', color: '#ff9a3a', good: true, desc: 'Inmune al fuego y a la lava' },
  water_breathing: { name: 'Respiración acuática', color: '#3a7ae0', good: true, desc: 'No te ahogas bajo el agua' },
  night_vision: { name: 'Visión nocturna', color: '#6a6af0', good: true, desc: 'Ves en la oscuridad' },
  slowness: { name: 'Lentitud', color: '#5a6a7a', good: false, desc: '−15 % de velocidad por nivel' },
  poison: { name: 'Veneno', color: '#5aa83a', good: false, desc: 'Pierdes salud (nunca por debajo de medio corazón)' },
  darkness: { name: 'Oscuridad', color: '#3a3448', good: false, desc: 'La visión se reduce a pocos bloques' },
  weakness: { name: 'Debilidad', color: '#707070', good: false, desc: '−2 de daño cuerpo a cuerpo por nivel' },
};
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

export class Effects {
  constructor() { this.list = new Map(); }

  /** Aplica un efecto: se queda el de mayor nivel (y, a igual nivel, el que dura más). */
  add(id, seconds, level = 1) {
    if (!EFFECTS[id]) return false;
    const cur = this.list.get(id);
    if (!cur || cur.level < level || (cur.level === level && cur.time < seconds)) { this.list.set(id, { level, time: seconds }); return true; }
    return false;
  }
  has(id) { return this.list.has(id); }
  level(id) { const e = this.list.get(id); return e ? e.level : 0; }
  remove(id) { this.list.delete(id); }
  clear() { this.list.clear(); }
  /** Quita los efectos negativos (leche de cabra... aquí: vendas y tónico de cura). */
  clearBad() { for (const id of [...this.list.keys()]) if (!EFFECTS[id].good) this.list.delete(id); }

  /** Avanza los temporizadores; devuelve los efectos que acaban de terminar. */
  update(dt) {
    const ended = [];
    for (const [id, e] of this.list) {
      e.time -= dt;
      if (e.time <= 0) { this.list.delete(id); ended.push(id); }
    }
    return ended;
  }

  /** Multiplicador de velocidad de movimiento. */
  speedMul() { return Math.max(0.3, 1 + 0.2 * this.level('speed') - 0.15 * this.level('slowness')); }
  /** Daño extra cuerpo a cuerpo. */
  meleeBonus() { return 3 * this.level('strength') - 2 * this.level('weakness'); }
  /** Factor de daño recibido (resistencia). */
  damageFactor() { return Math.max(0.2, 1 - 0.2 * this.level('resistance')); }
  /** Multiplicador de velocidad al romper bloques. */
  miningMul() { return 1 + 0.25 * this.level('haste'); }

  serialize() { return [...this.list].map(([id, e]) => [id, e.level, Math.round(e.time * 10) / 10]); }
  load(arr) { this.list.clear(); for (const [id, level, time] of arr || []) if (EFFECTS[id] && time > 0) this.list.set(id, { level, time }); }
}
