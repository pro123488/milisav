// Inventario, pilas y contenedores. Toda la lógica de mover objetos vive aquí (pura y comprobable);
// la interfaz solo llama a estas funciones y vuelve a dibujar desde el modelo → no hay forma de duplicar objetos.
import { Items, cloneStack, maxDurability } from './items.js';

export const HOTBAR_SIZE = 9;
export const INV_SIZE = 36;

export const stackMax = (id) => (Items.get(id) ? Items.get(id).stack : 64);
export const isDamageable = (it) => !!(it && (it.tool || it.armor));
const sameKind = (a, b) => a && b && a.i === b.i && (a.d || 0) === (b.d || 0);

/** Intenta insertar `stack` en el array de huecos. Devuelve lo que NO cupo (o null). Modifica `slots`. */
export function addToSlots(slots, stack, from = 0, to = slots.length) {
  if (!stack || stack.n <= 0) return null;
  const max = stackMax(stack.i);
  let left = stack.n;
  if (max > 1) {
    for (let i = from; i < to && left > 0; i++) {
      const s = slots[i];
      if (s && sameKind(s, stack) && s.n < max) {
        const add = Math.min(max - s.n, left);
        s.n += add; left -= add;
      }
    }
  }
  for (let i = from; i < to && left > 0; i++) {
    if (!slots[i]) {
      const add = Math.min(max, left);
      slots[i] = { i: stack.i, n: add, d: stack.d || 0 };
      left -= add;
    }
  }
  return left > 0 ? { i: stack.i, n: left, d: stack.d || 0 } : null;
}

export function canFitInSlots(slots, stack, from = 0, to = slots.length) {
  if (!stack) return true;
  const copy = slots.slice(from, to).map(cloneStack);
  return addToSlots(copy, stack) === null;
}

export function countInSlots(slots, id) {
  let c = 0;
  for (const s of slots) if (s && s.i === id) c += s.n;
  return c;
}

export function removeFromSlots(slots, id, n) {
  if (countInSlots(slots, id) < n) return false;
  // Quitar primero de las pilas más pequeñas
  const idx = [];
  slots.forEach((s, i) => { if (s && s.i === id) idx.push(i); });
  idx.sort((a, b) => slots[a].n - slots[b].n);
  for (const i of idx) {
    if (n <= 0) break;
    const take = Math.min(slots[i].n, n);
    slots[i].n -= take; n -= take;
    if (slots[i].n <= 0) slots[i] = null;
  }
  return true;
}

/**
 * Clic sobre un hueco. cursor = pila en la mano ({i,n,d}|null). Devuelve el nuevo cursor.
 * rules: { canPlace(idx, stack)->bool, outputOnly(idx)->bool }
 */
export function clickSlot(slots, idx, cursor, button, rules = {}) {
  const slot = slots[idx];
  const canPlace = (st) => !rules.canPlace || rules.canPlace(idx, st);
  const outOnly = rules.outputOnly && rules.outputOnly(idx);

  if (outOnly) {
    // Solo se puede sacar. Si hay cursor del mismo tipo, se acumula hasta el máximo.
    if (!slot) return cursor;
    if (!cursor) { slots[idx] = null; return slot; }
    if (sameKind(cursor, slot) && cursor.n + slot.n <= stackMax(cursor.i)) {
      cursor.n += slot.n; slots[idx] = null;
    }
    return cursor;
  }

  if (button === 0) {
    if (!cursor) {
      if (slot) { slots[idx] = null; return slot; }
      return null;
    }
    if (!canPlace(cursor)) return cursor;
    if (!slot) { slots[idx] = cursor; return null; }
    if (sameKind(slot, cursor) && stackMax(slot.i) > 1) {
      const room = stackMax(slot.i) - slot.n;
      const mv = Math.min(room, cursor.n);
      slot.n += mv; cursor.n -= mv;
      return cursor.n > 0 ? cursor : null;
    }
    slots[idx] = cursor; // intercambio
    return slot;
  }
  // botón derecho
  if (!cursor) {
    if (!slot) return null;
    const take = Math.ceil(slot.n / 2);
    const picked = { i: slot.i, n: take, d: slot.d || 0 };
    slot.n -= take;
    if (slot.n <= 0) slots[idx] = null;
    return picked;
  }
  if (!canPlace(cursor)) return cursor;
  if (!slot) {
    slots[idx] = { i: cursor.i, n: 1, d: cursor.d || 0 };
    cursor.n -= 1;
    return cursor.n > 0 ? cursor : null;
  }
  if (sameKind(slot, cursor) && slot.n < stackMax(slot.i)) {
    slot.n += 1; cursor.n -= 1;
    return cursor.n > 0 ? cursor : null;
  }
  slots[idx] = cursor;
  return slot;
}

/** Mayús+clic: mueve la pila completa de slots[idx] a los rangos destino. Devuelve true si movió algo. */
export function shiftMove(slots, idx, targets) {
  const s = slots[idx];
  if (!s) return false;
  let rest = { i: s.i, n: s.n, d: s.d || 0 };
  const before = rest.n;
  for (const t of targets) {
    if (!rest) break;
    rest = addToSlots(t.slots, rest, t.from ?? 0, t.to ?? t.slots.length);
  }
  if (!rest) slots[idx] = null;
  else s.n = rest.n;
  return (rest ? rest.n : 0) !== before;
}

/** Doble clic: recoge al cursor todas las pilas iguales hasta llenarlo. */
export function collectToCursor(slotsList, cursor) {
  if (!cursor) return cursor;
  const max = stackMax(cursor.i);
  for (const slots of slotsList) {
    for (let i = 0; i < slots.length && cursor.n < max; i++) {
      const s = slots[i];
      if (s && sameKind(s, cursor)) {
        const take = Math.min(max - cursor.n, s.n);
        cursor.n += take; s.n -= take;
        if (s.n <= 0) slots[i] = null;
      }
    }
  }
  return cursor;
}

export class Inventory {
  constructor() {
    this.slots = new Array(INV_SIZE).fill(null);   // 0-8 barra rápida, 9-35 mochila
    this.armor = new Array(4).fill(null);          // casco, peto, grebas, botas
    this.selected = 0;
    this.cursor = null;                            // pila "en la mano" mientras se mueven objetos con el ratón
  }

  get hotbar() { return this.slots.slice(0, HOTBAR_SIZE); }
  getSelected() { return this.slots[this.selected]; }
  selectedItem() { const s = this.slots[this.selected]; return s ? Items.get(s.i) : null; }

  /** Añade una pila: primero a pilas existentes, luego huecos libres (barra rápida primero). Devuelve el resto. */
  add(stack) { return addToSlots(this.slots, stack); }
  canFit(stack) { return canFitInSlots(this.slots, stack); }
  count(id) { return countInSlots(this.slots, id); }
  remove(id, n) { return removeFromSlots(this.slots, id, n); }

  /** Consume 1 unidad de la pila seleccionada. */
  consumeSelected(n = 1) {
    const s = this.slots[this.selected];
    if (!s) return false;
    s.n -= n;
    if (s.n <= 0) this.slots[this.selected] = null;
    return true;
  }

  /** Aplica desgaste a la herramienta seleccionada. Devuelve true si se rompió. */
  damageSelected(amount = 1) {
    const s = this.slots[this.selected];
    if (!s) return false;
    const it = Items.get(s.i);
    if (!it || !it.tool) return false;
    s.d = (s.d || 0) + amount;
    if (s.d >= maxDurability(it)) { this.slots[this.selected] = null; return true; }
    return false;
  }

  /** Reduce el daño por armadura. Devuelve el daño final. Desgasta las piezas. */
  armorDefense() {
    let d = 0;
    for (const s of this.armor) if (s) { const it = Items.get(s.i); if (it && it.armor) d += it.armor.defense; }
    return d;
  }
  damageArmor(amount) {
    for (let k = 0; k < this.armor.length; k++) {
      const s = this.armor[k];
      if (!s) continue;
      const it = Items.get(s.i);
      s.d = (s.d || 0) + Math.max(1, Math.floor(amount / 4));
      if (s.d >= maxDurability(it)) this.armor[k] = null;
    }
  }

  /** Mueve todo el contenido (para soltar al morir). Devuelve la lista de pilas y vacía el inventario. */
  takeAll() {
    const out = [];
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i]) { out.push(this.slots[i]); this.slots[i] = null; }
    for (let i = 0; i < this.armor.length; i++) if (this.armor[i]) { out.push(this.armor[i]); this.armor[i] = null; }
    if (this.cursor) { out.push(this.cursor); this.cursor = null; }
    return out;
  }

  /** Total de objetos (para pruebas de conservación). */
  totalItems() {
    let t = 0;
    for (const s of this.slots) if (s) t += s.n;
    for (const s of this.armor) if (s) t += s.n;
    if (this.cursor) t += this.cursor.n;
    return t;
  }

  serialize() {
    const ser = (s) => (s ? [s.i, s.n, s.d || 0] : 0);
    return { slots: this.slots.map(ser), armor: this.armor.map(ser), selected: this.selected, cursor: ser(this.cursor) };
  }
  static deserialize(o) {
    const inv = new Inventory();
    const de = (v) => (v && Items.get(v[0]) ? { i: v[0], n: v[1], d: v[2] || 0 } : null);
    if (o) {
      (o.slots || []).forEach((v, i) => { if (i < INV_SIZE) inv.slots[i] = de(v); });
      (o.armor || []).forEach((v, i) => { if (i < 4) inv.armor[i] = de(v); });
      inv.selected = Math.max(0, Math.min(8, o.selected || 0));
      inv.cursor = de(o.cursor);
    }
    return inv;
  }
}

/** Contenedor genérico (cofre, horno…): solo un array de huecos. */
export class Container {
  constructor(size, type = 'chest') { this.type = type; this.slots = new Array(size).fill(null); }
  serialize() { return { type: this.type, slots: this.slots.map((s) => (s ? [s.i, s.n, s.d || 0] : 0)), ...(this.extra ? { extra: this.extra } : {}) }; }
  static deserialize(o) {
    const c = new Container((o && o.slots ? o.slots.length : 27), o ? o.type : 'chest');
    if (o) {
      o.slots.forEach((v, i) => { c.slots[i] = v && Items.get(v[0]) ? { i: v[0], n: v[1], d: v[2] || 0 } : null; });
      if (o.extra) c.extra = o.extra;
    }
    return c;
  }
}
