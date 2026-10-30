/**
 * Tablero de seguimiento de créditos de vivienda — HomeBridge
 *
 * Un solo archivo React (JSX). Dependencias: react (>=18), lucide-react y Tailwind CSS.
 * La lectura de archivos .xlsx/.xls usa SheetJS, que se carga bajo demanda desde cdnjs
 * (no requiere instalación). Los CSV se procesan sin librerías externas.
 *
 * Los datos se guardan en el navegador (localStorage) para no perderlos al recargar.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Hourglass,
  Home,
  Pencil,
  PhoneCall,
  PhoneOff,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Send,
  Trash2,
  Upload,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Configuración                                                       */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'homebridge.creditos.v1';
const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const ESTADO_POR_DEFECTO = 'Pendientes por contactar';

// Las clases de Tailwind se escriben completas para que el compilador las detecte.
const ESTADOS = [
  { id: 'Contactados', icon: PhoneCall, card: 'bg-sky-50 text-sky-700 ring-sky-200', badge: 'bg-sky-100 text-sky-800', dot: 'bg-sky-500' },
  { id: 'Pendientes por contactar', icon: PhoneOff, card: 'bg-slate-50 text-slate-700 ring-slate-200', badge: 'bg-slate-200 text-slate-800', dot: 'bg-slate-500' },
  { id: 'Entregaron parte de docs', icon: FileText, card: 'bg-amber-50 text-amber-700 ring-amber-200', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  { id: 'Radicados', icon: Send, card: 'bg-indigo-50 text-indigo-700 ring-indigo-200', badge: 'bg-indigo-100 text-indigo-800', dot: 'bg-indigo-500' },
  { id: 'Negados', icon: XCircle, card: 'bg-rose-50 text-rose-700 ring-rose-200', badge: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500' },
  { id: 'Aprobados', icon: CheckCircle2, card: 'bg-emerald-50 text-emerald-700 ring-emerald-200', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  { id: 'En avalúo', icon: Home, card: 'bg-violet-50 text-violet-700 ring-violet-200', badge: 'bg-violet-100 text-violet-800', dot: 'bg-violet-500' },
  { id: 'En estudio de títulos', icon: Scale, card: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200', badge: 'bg-fuchsia-100 text-fuchsia-800', dot: 'bg-fuchsia-500' },
  { id: 'Pendientes por desembolso', icon: Clock, card: 'bg-orange-50 text-orange-700 ring-orange-200', badge: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
  { id: 'Por desembolsar', icon: Hourglass, card: 'bg-cyan-50 text-cyan-700 ring-cyan-200', badge: 'bg-cyan-100 text-cyan-800', dot: 'bg-cyan-500' },
  { id: 'Desembolsados', icon: Banknote, card: 'bg-green-50 text-green-700 ring-green-200', badge: 'bg-green-100 text-green-800', dot: 'bg-green-600' },
];
const ESTADO_MAP = Object.fromEntries(ESTADOS.map((e) => [e.id, e]));

// Campos del cliente: clave interna, etiqueta (también es el encabezado de la plantilla) y tipo.
const CAMPOS = [
  { key: 'fechaRegistro', label: 'Fecha de registro', type: 'date' },
  { key: 'nombre', label: 'Nombre completo', type: 'text', required: true },
  { key: 'cedula', label: 'Cédula / Documento', type: 'text', required: true },
  { key: 'telefono', label: 'Teléfono', type: 'text' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'proyecto', label: 'Proyecto inmobiliario', type: 'text' },
  { key: 'fechaEntrega', label: 'Fecha estimada de entrega', type: 'date' },
  { key: 'valorInmueble', label: 'Valor del inmueble', type: 'money' },
  { key: 'valorFinanciar', label: 'Valor a financiar', type: 'money' },
  { key: 'estado', label: 'Estado', type: 'estado' },
  { key: 'observacion', label: 'Observación / Notas', type: 'textarea' },
];

// Palabras con las que se reconoce automáticamente cada columna al importar.
const ALIAS_EXACTOS = {
  fechaRegistro: ['fechaderegistro', 'fecharegistro', 'fecha', 'fechaingreso', 'registro'],
  nombre: ['nombrecompleto', 'nombre', 'nombres', 'cliente', 'nombredelcliente'],
  cedula: ['ceduladocumento', 'cedula', 'documento', 'documentodeidentidad', 'cc', 'identificacion', 'nit'],
  telefono: ['telefono', 'celular', 'movil', 'tel', 'whatsapp'],
  email: ['email', 'correo', 'correoelectronico', 'mail', 'email'],
  proyecto: ['proyectoinmobiliario', 'proyecto'],
  fechaEntrega: ['fechaestimadadeentrega', 'fechadeentrega', 'fechaentrega', 'entrega'],
  valorInmueble: ['valordelinmueble', 'valorinmueble', 'valorvivienda', 'valorcomercial'],
  valorFinanciar: ['valorafinanciar', 'valorfinanciar', 'montocredito', 'valorcredito', 'valorfinanciado'],
  estado: ['estado', 'etapa', 'estadodelcredito'],
  observacion: ['observacionnotas', 'observacion', 'observaciones', 'notas', 'nota', 'comentarios'],
};
const ALIAS_PARCIALES = {
  fechaRegistro: ['registro'],
  fechaEntrega: ['entrega'],
  nombre: ['nombre', 'cliente'],
  cedula: ['cedula', 'documento', 'identific'],
  telefono: ['telefono', 'celular', 'movil'],
  email: ['email', 'correo', 'mail'],
  proyecto: ['proyecto'],
  valorInmueble: ['inmueble', 'vivienda', 'comercial'],
  valorFinanciar: ['financ', 'credito', 'prestamo'],
  estado: ['estado', 'etapa'],
  observacion: ['observ', 'nota', 'comentario'],
};

const PAGE_SIZES = [5, 10, 25, 50];

/* ------------------------------------------------------------------ */
/* Datos de prueba                                                     */
/* ------------------------------------------------------------------ */

const DATOS_INICIALES = [
  ['2026-08-01', 'Laura Marcela Gómez Ríos', '1032456789', '3104567890', 'laura.gomez@correo.com', 'Torres del Parque', '2027-06-30', 320000000, 224000000, 'Desembolsados', 'Desembolso realizado por Bancolombia.'],
  ['2026-08-04', 'Andrés Felipe Martínez', '80234567', '3159876543', 'andres.martinez@correo.com', 'Riomar 460', '2027-03-15', 450000000, 315000000, 'Por desembolsar', 'Escrituras firmadas, esperando giro.'],
  ['2026-08-07', 'Carolina Restrepo Vélez', '43567890', '3001234567', 'carolina.restrepo@correo.com', 'Villa Campestre', '2027-09-30', 580000000, 400000000, 'Pendientes por desembolso', 'Falta paz y salvo de administración.'],
  ['2026-08-10', 'Juan David Herrera', '1020345678', '3112345678', 'juan.herrera@correo.com', 'Torres del Parque', '2027-06-30', 298000000, 208600000, 'En estudio de títulos', 'Abogado del banco revisando folio.'],
  ['2026-08-12', 'María Fernanda Ospina', '52789012', '3209876543', 'mafe.ospina@correo.com', 'Altos de la Sabana', '2027-12-15', 365000000, 255500000, 'En avalúo', 'Visita del perito agendada.'],
  ['2026-08-15', 'Santiago Rojas Cárdenas', '1018765432', '3187654321', 'santiago.rojas@correo.com', 'Riomar 460', '2027-03-15', 470000000, 329000000, 'Aprobados', 'Aprobado por Davivienda a 20 años.'],
  ['2026-08-19', 'Valentina Castro Pérez', '1098123456', '3014567321', 'valentina.castro@correo.com', 'Mirador del Lago', '2028-02-28', 255000000, 178500000, 'Radicados', 'Radicado en Banco de Bogotá.'],
  ['2026-08-22', 'Camilo Andrés Torres', '79856321', '3123456789', 'camilo.torres@correo.com', 'Altos de la Sabana', '2027-12-15', 340000000, 238000000, 'Negados', 'Negado por capacidad de pago. Revisar codeudor.'],
  ['2026-09-02', 'Daniela Moreno Suárez', '1015678901', '3165432109', 'daniela.moreno@correo.com', 'Villa Campestre', '2027-09-30', 610000000, 427000000, 'Entregaron parte de docs', 'Falta certificado laboral y extractos.'],
  ['2026-09-08', 'Felipe Ramírez Londoño', '1036987654', '3176543210', 'felipe.ramirez@correo.com', 'Mirador del Lago', '2028-02-28', 268000000, 187600000, 'Contactados', 'Interesado, enviará documentos esta semana.'],
  ['2026-09-15', 'Natalia Jiménez Arango', '1144567890', '3045678901', 'natalia.jimenez@correo.com', 'Torres del Parque', '2027-06-30', 310000000, 217000000, 'Pendientes por contactar', 'Llegó por Instagram.'],
  ['2026-09-21', 'Sebastián Quintero Gil', '1053789012', '3138901234', 'sebastian.quintero@correo.com', 'Riomar 460', '2027-03-15', 495000000, 346500000, 'Contactados', 'Prefiere llamada en la tarde.'],
  ['2026-10-03', 'Isabella Valencia Mejía', '1001234987', '3051239876', 'isabella.valencia@correo.com', 'Altos de la Sabana', '2027-12-15', 355000000, 248500000, 'Pendientes por contactar', ''],
  ['2026-10-12', 'Mateo Salazar Duque', '1088456123', '3196547890', 'mateo.salazar@correo.com', 'Mirador del Lago', '2028-02-28', 275000000, 192500000, 'Radicados', 'Radicado en BBVA, respuesta en 5 días.'],
].map(([fechaRegistro, nombre, cedula, telefono, email, proyecto, fechaEntrega, valorInmueble, valorFinanciar, estado, observacion], i) => ({
  id: `demo-${i + 1}`,
  fechaRegistro, nombre, cedula, telefono, email, proyecto, fechaEntrega, valorInmueble, valorFinanciar, estado, observacion,
}));

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const moneyFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const compactFmt = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 });
const formatMoney = (n) => (Number.isFinite(n) ? moneyFmt.format(n) : '—');
const formatCompactMoney = (n) => `$${compactFmt.format(n || 0)}`;

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Minúsculas, sin tildes ni signos: "Cédula / Documento" -> "ceduladocumento".
const normalize = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const formatDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const pad2 = (n) => String(n).padStart(2, '0');
const isValidYMD = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

// Acepta YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, fechas de Excel (número de serie) y objetos Date.
function parseDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  if (typeof value === 'number' && value > 59 && value < 100000) {
    const dt = new Date(Math.round((value - 25569) * 86400 * 1000));
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return isValidYMD(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : '';
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    let [d, mo, y] = [+m[1], +m[2], +m[3]];
    if (y < 100) y += 2000;
    return isValidYMD(y, mo, d) ? `${y}-${pad2(mo)}-${pad2(d)}` : '';
  }
  if (/^\d+(\.\d+)?$/.test(s)) return parseDate(Number(s));
  return '';
}

// Acepta "$ 250.000.000", "250,000,000.50", "250000000", números, etc.
function parseMoney(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : 0;
  let s = String(value).replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot > -1 && lastComma > -1) {
    // El separador que aparece de último es el decimal.
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastDot > -1 || lastComma > -1) {
    const sep = lastDot > -1 ? '.' : ',';
    const parts = s.split(sep);
    // Varias apariciones o grupos de 3 dígitos => separador de miles.
    if (parts.length > 2 || parts[parts.length - 1].length === 3) s = parts.join('');
    else s = parts.join('.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// Devuelve el estado válido que corresponde al texto (o número 1-11), o null.
function matchEstado(value) {
  const v = normalize(value);
  if (!v) return null;
  const exact = ESTADOS.find((e) => normalize(e.id) === v);
  if (exact) return exact.id;
  if (/^\d+$/.test(v) && +v >= 1 && +v <= ESTADOS.length) return ESTADOS[+v - 1].id;
  const partial = ESTADOS.find((e) => {
    const n = normalize(e.id);
    return n.startsWith(v) || v.startsWith(n);
  });
  if (partial) return partial.id;
  if (v.includes('avaluo')) return 'En avalúo';
  if (v.includes('titulo')) return 'En estudio de títulos';
  if (v.includes('document') || v.includes('docs')) return 'Entregaron parte de docs';
  return null;
}

// Parser CSV con soporte de comillas, saltos de línea dentro de comillas y detección de separador (, ; tab).
function parseCSV(text) {
  const clean = text.replace(/^﻿/, '');
  let body = clean;
  let delimiter = null;
  const sepLine = clean.match(/^sep=(.)\r?\n/i);
  if (sepLine) {
    delimiter = sepLine[1];
    body = clean.slice(sepLine[0].length);
  }
  if (!delimiter) {
    const firstLine = body.split(/\r?\n/)[0] || '';
    const counts = [';', ',', '\t', '|'].map((d) => [d, firstLine.split(d).length - 1]);
    counts.sort((a, b) => b[1] - a[1]);
    delimiter = counts[0][1] > 0 ? counts[0][0] : ',';
  }
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inQuotes) {
      if (c === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

// Excel en español suele guardar CSV en Windows-1252; si no es UTF-8 válido se reintenta así.
function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

let sheetJSPromise = null;
function loadSheetJS() {
  if (typeof window !== 'undefined' && window.XLSX) return Promise.resolve(window.XLSX);
  if (!sheetJSPromise) {
    sheetJSPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SHEETJS_URL;
      script.async = true;
      script.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('SheetJS no disponible')));
      script.onerror = () => {
        sheetJSPromise = null;
        reject(new Error('No se pudo cargar el lector de Excel. Revisa tu conexión o usa un archivo CSV.'));
      };
      document.head.appendChild(script);
    });
  }
  return sheetJSPromise;
}

async function readSpreadsheet(file) {
  const buffer = await file.arrayBuffer();
  const isExcel = /\.(xlsx|xlsm|xls|ods)$/i.test(file.name);
  if (!isExcel) return parseCSV(decodeText(buffer));
  const XLSX = await loadSheetJS();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

// Empareja encabezados del archivo con campos del cliente. Devuelve { campo: índiceDeColumna | '' }.
function autoMap(headers) {
  const norm = headers.map(normalize);
  const used = new Set();
  const mapping = Object.fromEntries(CAMPOS.map((c) => [c.key, '']));
  for (const campo of CAMPOS) {
    const idx = norm.findIndex((h, i) => !used.has(i) && ALIAS_EXACTOS[campo.key].includes(h));
    if (idx > -1) {
      mapping[campo.key] = idx;
      used.add(idx);
    }
  }
  for (const campo of CAMPOS) {
    if (mapping[campo.key] !== '') continue;
    const idx = norm.findIndex((h, i) => !used.has(i) && ALIAS_PARCIALES[campo.key].some((a) => h.includes(a)));
    if (idx > -1) {
      mapping[campo.key] = idx;
      used.add(idx);
    }
  }
  return mapping;
}

// Convierte una fila del archivo en un cliente según el mapeo de columnas.
function rowToCliente(row, mapping) {
  const get = (key) => (mapping[key] === '' ? '' : row[mapping[key]] ?? '');
  const str = (key) => String(get(key) ?? '').trim();
  const estadoRaw = str('estado');
  const estado = matchEstado(estadoRaw);
  return {
    cliente: {
      fechaRegistro: parseDate(get('fechaRegistro')) || todayISO(),
      nombre: str('nombre'),
      cedula: str('cedula').replace(/\.0$/, ''),
      telefono: str('telefono').replace(/\.0$/, ''),
      email: str('email').toLowerCase(),
      proyecto: str('proyecto'),
      fechaEntrega: parseDate(get('fechaEntrega')),
      valorInmueble: parseMoney(get('valorInmueble')),
      valorFinanciar: parseMoney(get('valorFinanciar')),
      estado: estado || ESTADO_POR_DEFECTO,
      observacion: str('observacion'),
    },
    estadoInvalido: !!estadoRaw && !estado,
  };
}

const csvEscape = (v) => {
  const s = String(v ?? '');
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// CSV con separador ";" y BOM UTF-8: así Excel en español lo abre con columnas y tildes correctas.
function buildCSV(rows) {
  return '﻿' + rows.map((r) => r.map(csvEscape).join(';')).join('\r\n');
}

function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const clienteToRow = (c) => [
  c.fechaRegistro, c.nombre, c.cedula, c.telefono, c.email, c.proyecto, c.fechaEntrega,
  c.valorInmueble, c.valorFinanciar, c.estado, c.observacion,
];

function descargarPlantilla() {
  const rows = [
    CAMPOS.map((c) => c.label),
    ['2026-10-30', 'Ana María Pérez López', '1012345678', '3001112233', 'ana.perez@correo.com', 'Torres del Parque', '2027-06-30', 320000000, 224000000, 'Pendientes por contactar', 'Llegó por referido'],
    ['2026-10-30', 'Carlos Eduardo Ruiz', '79123456', '3104445566', 'carlos.ruiz@correo.com', 'Riomar 460', '2027-03-15', 450000000, 315000000, 'Radicados', 'Radicado en Davivienda'],
  ];
  downloadBlob(buildCSV(rows), 'plantilla_creditos_vivienda.csv', 'text/csv;charset=utf-8');
}

function loadClientes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* almacenamiento no disponible: se usan los datos de prueba */
  }
  return DATOS_INICIALES;
}

/* ------------------------------------------------------------------ */
/* Componentes de apoyo                                                */
/* ------------------------------------------------------------------ */

function EstadoBadge({ estado }) {
  const cfg = ESTADO_MAP[estado] || ESTADO_MAP[ESTADO_POR_DEFECTO];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${cfg.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {estado}
    </span>
  );
}

function Modal({ open, onClose, title, subtitle, children, footer, size = 'max-w-3xl' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="modal-title" className={`flex max-h-[95vh] w-full ${size} flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 id="modal-title" className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

const btn = {
  primary: 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  secondary: 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  danger: 'inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2',
};
const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

/* ------------------------------------------------------------------ */
/* Formulario de cliente                                               */
/* ------------------------------------------------------------------ */

const clienteVacio = () => ({
  fechaRegistro: todayISO(), nombre: '', cedula: '', telefono: '', email: '', proyecto: '',
  fechaEntrega: '', valorInmueble: '', valorFinanciar: '', estado: ESTADO_POR_DEFECTO, observacion: '',
});

function ClienteForm({ open, initial, clientes, proyectos, onCancel, onSave }) {
  const [form, setForm] = useState(clienteVacio);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...initial } : clienteVacio());
      setErrors({});
    }
  }, [open, initial]);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!form.nombre.trim()) e.nombre = 'El nombre es obligatorio.';
    if (!String(form.cedula).trim()) e.cedula = 'La cédula es obligatoria.';
    else if (clientes.some((c) => c.id !== initial?.id && String(c.cedula).trim() === String(form.cedula).trim()))
      e.cedula = 'Ya existe un cliente con esta cédula.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Correo no válido.';
    if (!form.fechaRegistro) e.fechaRegistro = 'Indica la fecha de registro.';
    const vi = parseMoney(form.valorInmueble);
    const vf = parseMoney(form.valorFinanciar);
    if (vi < 0) e.valorInmueble = 'Valor no válido.';
    if (vf < 0) e.valorFinanciar = 'Valor no válido.';
    if (vi > 0 && vf > vi) e.valorFinanciar = 'No puede superar el valor del inmueble.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    onSave({
      ...form,
      nombre: form.nombre.trim(),
      cedula: String(form.cedula).trim(),
      telefono: String(form.telefono).trim(),
      email: form.email.trim().toLowerCase(),
      proyecto: form.proyecto.trim(),
      observacion: form.observacion.trim(),
      valorInmueble: parseMoney(form.valorInmueble),
      valorFinanciar: parseMoney(form.valorFinanciar),
    });
  };

  const vi = parseMoney(form.valorInmueble);
  const vf = parseMoney(form.valorFinanciar);
  const porcentaje = vi > 0 ? Math.round((vf / vi) * 100) : null;

  const Field = ({ campo, children, className = '' }) => (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {campo.label}
        {campo.required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
      {errors[campo.key] && <span className="mt-1 block text-xs text-rose-600">{errors[campo.key]}</span>}
    </label>
  );
  const c = Object.fromEntries(CAMPOS.map((x) => [x.key, x]));
  const errCls = (key) => (errors[key] ? ' border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : '');

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={initial ? 'Editar cliente' : 'Nuevo cliente'}
      subtitle={initial ? initial.nombre : 'Registra un nuevo cliente en el seguimiento.'}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onCancel}>Cancelar</button>
          <button type="submit" form="cliente-form" className={btn.primary}>{initial ? 'Guardar cambios' : 'Crear cliente'}</button>
        </>
      }
    >
      <form id="cliente-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Field({ campo: c.nombre, className: 'sm:col-span-2', children: <input className={inputCls + errCls('nombre')} value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej. Laura Gómez Ríos" autoFocus /> })}
        {Field({ campo: c.cedula, children: <input className={inputCls + errCls('cedula')} value={form.cedula} onChange={(e) => set('cedula', e.target.value)} inputMode="numeric" placeholder="Ej. 1032456789" /> })}
        {Field({ campo: c.fechaRegistro, children: <input type="date" className={inputCls + errCls('fechaRegistro')} value={form.fechaRegistro} onChange={(e) => set('fechaRegistro', e.target.value)} /> })}
        {Field({ campo: c.telefono, children: <input type="tel" className={inputCls} value={form.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="Ej. 3104567890" /> })}
        {Field({ campo: c.email, children: <input type="email" className={inputCls + errCls('email')} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="correo@dominio.com" /> })}
        {Field({
          campo: c.proyecto,
          children: (
            <>
              <input list="proyectos-list" className={inputCls} value={form.proyecto} onChange={(e) => set('proyecto', e.target.value)} placeholder="Selecciona o escribe" />
              <datalist id="proyectos-list">{proyectos.map((p) => <option key={p} value={p} />)}</datalist>
            </>
          ),
        })}
        {Field({ campo: c.fechaEntrega, children: <input type="date" className={inputCls} value={form.fechaEntrega} onChange={(e) => set('fechaEntrega', e.target.value)} /> })}
        {Field({
          campo: c.valorInmueble,
          children: (
            <>
              <input className={inputCls + errCls('valorInmueble')} value={form.valorInmueble === '' ? '' : formatMoney(parseMoney(form.valorInmueble))} onChange={(e) => set('valorInmueble', e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="$ 0" />
            </>
          ),
        })}
        {Field({
          campo: c.valorFinanciar,
          children: (
            <>
              <input className={inputCls + errCls('valorFinanciar')} value={form.valorFinanciar === '' ? '' : formatMoney(parseMoney(form.valorFinanciar))} onChange={(e) => set('valorFinanciar', e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="$ 0" />
              {porcentaje !== null && vf > 0 && !errors.valorFinanciar && <span className="mt-1 block text-xs text-slate-500">Financia el {porcentaje}% del inmueble.</span>}
            </>
          ),
        })}
        {Field({
          campo: c.estado,
          className: 'sm:col-span-2',
          children: (
            <select className={inputCls} value={form.estado} onChange={(e) => set('estado', e.target.value)}>
              {ESTADOS.map((e, i) => <option key={e.id} value={e.id}>{i + 1}. {e.id}</option>)}
            </select>
          ),
        })}
        {Field({ campo: c.observacion, className: 'sm:col-span-2', children: <textarea rows={3} className={inputCls} value={form.observacion} onChange={(e) => set('observacion', e.target.value)} placeholder="Notas del seguimiento…" /> })}
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Importación masiva                                                  */
/* ------------------------------------------------------------------ */

function ImportModal({ open, onClose, onImport }) {
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [dataRows, setDataRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [mode, setMode] = useState('append');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const reset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setDataRows([]);
    setMapping({});
    setMode('append');
    setError('');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const handleFile = async (file) => {
    if (!file) return;
    if (!/\.(csv|txt|tsv|xlsx|xlsm|xls|ods)$/i.test(file.name)) {
      setError('Formato no soportado. Usa un archivo .csv, .xlsx o .xls.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const rows = await readSpreadsheet(file);
      if (rows.length < 2) throw new Error('El archivo no tiene filas de datos debajo de los encabezados.');
      const head = rows[0].map((h, i) => String(h ?? '').trim() || `Columna ${i + 1}`);
      setHeaders(head);
      setDataRows(rows.slice(1));
      setMapping(autoMap(head));
      setFileName(file.name);
      setStep('map');
    } catch (err) {
      setError(err.message || 'No se pudo leer el archivo.');
    } finally {
      setLoading(false);
    }
  };

  const procesados = useMemo(() => {
    if (step !== 'map') return [];
    return dataRows.map((r) => rowToCliente(r, mapping));
  }, [step, dataRows, mapping]);

  const validos = procesados.filter((p) => p.cliente.nombre && p.cliente.cedula);
  const omitidos = procesados.length - validos.length;
  const estadosInvalidos = validos.filter((p) => p.estadoInvalido).length;
  const faltanObligatorios = mapping.nombre === '' || mapping.cedula === '';

  const confirmar = () => onImport(validos.map((p) => p.cliente), mode);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="max-w-4xl"
      title="Carga masiva de clientes"
      subtitle={step === 'upload' ? 'Sube un archivo Excel (.xlsx, .xls) o CSV.' : `Archivo: ${fileName} · ${dataRows.length} filas detectadas`}
      footer={
        step === 'upload' ? (
          <>
            <button type="button" className={btn.secondary} onClick={onClose}>Cancelar</button>
            <button type="button" className={btn.secondary} onClick={descargarPlantilla}><Download className="h-4 w-4" />Descargar plantilla CSV</button>
          </>
        ) : (
          <>
            <button type="button" className={btn.secondary} onClick={reset}><RotateCcw className="h-4 w-4" />Elegir otro archivo</button>
            <button type="button" className={btn.primary} disabled={faltanObligatorios || validos.length === 0} onClick={confirmar}>
              <Upload className="h-4 w-4" />Importar {validos.length} {validos.length === 1 ? 'registro' : 'registros'}
            </button>
          </>
        )
      }
    >
      {step === 'upload' && (
        <div className="space-y-5">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50'}`}
          >
            <div className="mb-3 rounded-full bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <FileSpreadsheet className="h-8 w-8 text-blue-600" />
            </div>
            <p className="text-sm font-medium text-slate-800">{loading ? 'Leyendo archivo…' : 'Arrastra tu archivo aquí o haz clic para seleccionarlo'}</p>
            <p className="mt-1 text-xs text-slate-500">CSV (separado por coma o punto y coma), XLSX o XLS · se lee la primera hoja</p>
            <input ref={inputRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xlsm,.xls,.ods" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />{error}
            </div>
          )}
          <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
            <h3 className="text-sm font-semibold text-slate-800">Estructura esperada</h3>
            <p className="mt-1 text-xs text-slate-500">La primera fila debe tener los encabezados. Después podrás ajustar a qué campo corresponde cada columna.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {CAMPOS.map((c) => (
                <span key={c.key} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">{c.label}{c.required && <span className="text-rose-500"> *</span>}</span>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Fechas en formato <strong>AAAA-MM-DD</strong> o <strong>DD/MM/AAAA</strong>. Valores en pesos, con o sin puntos. Estados válidos:{' '}
              {ESTADOS.map((e) => e.id).join(', ')}.
            </p>
          </div>
        </div>
      )}

      {step === 'map' && (
        <div className="space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-slate-800">1. Relaciona las columnas</h3>
            <p className="mt-0.5 text-xs text-slate-500">Detectamos automáticamente las que coinciden. Los campos con * son obligatorios.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPOS.map((campo) => (
                <label key={campo.key} className="block">
                  <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
                    {campo.label}{campo.required && <span className="text-rose-500">*</span>}
                    {mapping[campo.key] !== '' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  </span>
                  <select
                    className={`${inputCls} ${campo.required && mapping[campo.key] === '' ? 'border-rose-400' : ''}`}
                    value={mapping[campo.key]}
                    onChange={(e) => setMapping((m) => ({ ...m, [campo.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
                  >
                    <option value="">— No importar —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-800">2. Vista previa</h3>
            <div className="mt-2 overflow-x-auto rounded-lg ring-1 ring-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50">
                  <tr>{['Nombre', 'Cédula', 'Proyecto', 'Valor inmueble', 'Valor a financiar', 'Estado'].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-slate-600">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {procesados.slice(0, 5).map(({ cliente, estadoInvalido }, i) => {
                    const invalido = !cliente.nombre || !cliente.cedula;
                    return (
                      <tr key={i} className={invalido ? 'bg-rose-50/60 text-rose-700' : ''}>
                        <td className="whitespace-nowrap px-3 py-2">{cliente.nombre || <em>Sin nombre</em>}</td>
                        <td className="whitespace-nowrap px-3 py-2">{cliente.cedula || <em>Sin cédula</em>}</td>
                        <td className="whitespace-nowrap px-3 py-2">{cliente.proyecto || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatMoney(cliente.valorInmueble)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatMoney(cliente.valorFinanciar)}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <EstadoBadge estado={cliente.estado} />
                          {estadoInvalido && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-500" aria-label="Estado no reconocido" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {procesados.length > 5 && <p className="mt-1 text-xs text-slate-500">Mostrando 5 de {procesados.length} filas.</p>}
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 ring-1 ring-emerald-200">{validos.length} listos para importar</span>
              {omitidos > 0 && <span className="rounded-full bg-rose-50 px-3 py-1 font-medium text-rose-700 ring-1 ring-rose-200">{omitidos} sin nombre o cédula (se omiten)</span>}
              {estadosInvalidos > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700 ring-1 ring-amber-200">{estadosInvalidos} con estado no reconocido → «{ESTADO_POR_DEFECTO}»</span>}
            </div>
            {faltanObligatorios && <p className="text-xs text-rose-600">Debes relacionar las columnas de Nombre completo y Cédula para continuar.</p>}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-800">3. ¿Cómo integrar los datos?</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {[
                ['append', 'Agregar y actualizar', 'Agrega los nuevos y actualiza los clientes que ya existen con la misma cédula.'],
                ['replace', 'Reemplazar todo', 'Borra la lista actual y deja solo los registros del archivo.'],
              ].map(([value, label, desc]) => (
                <label key={value} className={`flex cursor-pointer gap-3 rounded-lg p-3 ring-1 ${mode === value ? 'bg-blue-50 ring-blue-400' : 'ring-slate-200 hover:bg-slate-50'}`}>
                  <input type="radio" name="import-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-0.5 accent-blue-600" />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{label}</span>
                    <span className="block text-xs text-slate-500">{desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Tablero principal                                                   */
/* ------------------------------------------------------------------ */

const COLUMNAS = [
  { key: 'fechaRegistro', label: 'Registro' },
  { key: 'nombre', label: 'Cliente' },
  { key: 'telefono', label: 'Contacto' },
  { key: 'proyecto', label: 'Proyecto' },
  { key: 'fechaEntrega', label: 'Entrega' },
  { key: 'valorInmueble', label: 'Valor inmueble', numeric: true },
  { key: 'valorFinanciar', label: 'A financiar', numeric: true },
  { key: 'estado', label: 'Estado' },
  { key: 'observacion', label: 'Observación' },
];

export default function DashboardCreditos() {
  const [clientes, setClientes] = useState(loadClientes);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroProyecto, setFiltroProyecto] = useState('');
  const [sort, setSort] = useState({ key: 'fechaRegistro', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clientes));
    } catch {
      /* sin almacenamiento: los cambios duran mientras la página esté abierta */
    }
  }, [clientes]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Cualquier cambio de filtros vuelve a la primera página.
  useEffect(() => setPage(1), [busqueda, filtroEstado, filtroProyecto, pageSize]);

  const notify = (message, type = 'success') => setToast({ message, type, id: Date.now() });

  const proyectos = useMemo(
    () => [...new Set(clientes.map((c) => c.proyecto).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [clientes],
  );

  // Base para las tarjetas: aplica búsqueda y proyecto, pero no el estado, para ver la distribución completa.
  const baseFiltrada = useMemo(() => {
    const q = normalize(busqueda);
    return clientes.filter((c) => {
      if (filtroProyecto && c.proyecto !== filtroProyecto) return false;
      if (!q) return true;
      return normalize(c.nombre).includes(q) || normalize(c.cedula).includes(q) || normalize(c.proyecto).includes(q);
    });
  }, [clientes, busqueda, filtroProyecto]);

  const conteos = useMemo(() => {
    const out = Object.fromEntries(ESTADOS.map((e) => [e.id, 0]));
    baseFiltrada.forEach((c) => {
      if (out[c.estado] !== undefined) out[c.estado] += 1;
    });
    return out;
  }, [baseFiltrada]);

  const filtrados = useMemo(() => {
    const list = filtroEstado ? baseFiltrada.filter((c) => c.estado === filtroEstado) : baseFiltrada.slice();
    const { key, dir } = sort;
    const factor = dir === 'asc' ? 1 : -1;
    const estadoOrden = Object.fromEntries(ESTADOS.map((e, i) => [e.id, i]));
    list.sort((a, b) => {
      let va = a[key];
      let vb = b[key];
      if (key === 'estado') {
        va = estadoOrden[va] ?? 99;
        vb = estadoOrden[vb] ?? 99;
      }
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      if (!va && vb) return 1; // vacíos siempre al final
      if (va && !vb) return -1;
      return String(va ?? '').localeCompare(String(vb ?? ''), 'es', { numeric: true, sensitivity: 'base' }) * factor;
    });
    return list;
  }, [baseFiltrada, filtroEstado, sort]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagina = filtrados.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const resumen = useMemo(() => {
    const totalFinanciar = filtrados.reduce((s, c) => s + (Number(c.valorFinanciar) || 0), 0);
    const totalInmuebles = filtrados.reduce((s, c) => s + (Number(c.valorInmueble) || 0), 0);
    const desembolsado = filtrados.filter((c) => c.estado === 'Desembolsados').reduce((s, c) => s + (Number(c.valorFinanciar) || 0), 0);
    const decididos = baseFiltrada.filter((c) => c.estado !== 'Contactados' && c.estado !== 'Pendientes por contactar' && c.estado !== 'Entregaron parte de docs' && c.estado !== 'Radicados');
    const aprobadosOMas = decididos.filter((c) => c.estado !== 'Negados').length;
    const tasaAprobacion = decididos.length ? Math.round((aprobadosOMas / decididos.length) * 100) : null;
    return { totalFinanciar, totalInmuebles, desembolsado, tasaAprobacion };
  }, [filtrados, baseFiltrada]);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const abrirNuevo = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const abrirEditar = (c) => {
    setEditing(c);
    setFormOpen(true);
  };

  const guardarCliente = (data) => {
    if (editing) {
      setClientes((list) => list.map((c) => (c.id === editing.id ? { ...data, id: editing.id } : c)));
      notify(`Cliente «${data.nombre}» actualizado.`);
    } else {
      setClientes((list) => [{ ...data, id: uid() }, ...list]);
      notify(`Cliente «${data.nombre}» creado.`);
    }
    setFormOpen(false);
    setEditing(null);
  };

  const eliminarCliente = () => {
    setClientes((list) => list.filter((c) => c.id !== toDelete.id));
    notify(`Cliente «${toDelete.nombre}» eliminado.`);
    setToDelete(null);
  };

  const importar = (nuevos, mode) => {
    let creados = 0;
    let actualizados = 0;
    const base = mode === 'replace' ? [] : clientes.slice();
    const indexPorCedula = new Map(base.map((c, i) => [String(c.cedula).trim(), i]));
    for (const n of nuevos) {
      const key = String(n.cedula).trim();
      if (indexPorCedula.has(key)) {
        const i = indexPorCedula.get(key);
        base[i] = { ...base[i], ...n, id: base[i].id };
        actualizados += 1;
      } else {
        indexPorCedula.set(key, base.length);
        base.push({ ...n, id: uid() });
        creados += 1;
      }
    }
    setClientes(base);
    notify(`Importación completa: ${creados} ${creados === 1 ? 'nuevo' : 'nuevos'}${actualizados ? `, ${actualizados} ${actualizados === 1 ? 'actualizado' : 'actualizados'}` : ''}.`);
    setImportOpen(false);
    setFiltroEstado('');
    setFiltroProyecto('');
    setBusqueda('');
  };

  const exportarCSV = () => {
    if (!filtrados.length) return notify('No hay registros para exportar.', 'error');
    downloadBlob(buildCSV([CAMPOS.map((c) => c.label), ...filtrados.map(clienteToRow)]), `creditos_vivienda_${todayISO()}.csv`, 'text/csv;charset=utf-8');
    notify(`${filtrados.length === 1 ? 'Exportado 1 registro' : `Exportados ${filtrados.length} registros`} a CSV.`);
  };

  const exportarExcel = async () => {
    if (!filtrados.length) return notify('No hay registros para exportar.', 'error');
    try {
      const XLSX = await loadSheetJS();
      const ws = XLSX.utils.aoa_to_sheet([CAMPOS.map((c) => c.label), ...filtrados.map(clienteToRow)]);
      ws['!cols'] = [12, 28, 14, 14, 28, 22, 14, 16, 16, 24, 40].map((wch) => ({ wch }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `creditos_vivienda_${todayISO()}.xlsx`);
      notify(`${filtrados.length === 1 ? 'Exportado 1 registro' : `Exportados ${filtrados.length} registros`} a Excel.`);
    } catch (err) {
      notify(`${err.message} Se descargó en CSV.`, 'error');
      exportarCSV();
    }
  };

  const restaurarDemo = () => {
    setClientes(DATOS_INICIALES);
    setConfirmReset(false);
    setBusqueda('');
    setFiltroEstado('');
    setFiltroProyecto('');
    notify('Se restauraron los datos de prueba.');
  };

  const hayFiltros = busqueda || filtroEstado || filtroProyecto;
  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroEstado('');
    setFiltroProyecto('');
  };

  const SortIcon = ({ col }) => {
    if (sort.key !== col) return <ChevronsUpDown className="h-3.5 w-3.5 text-slate-300" />;
    return sort.dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5 text-blue-600" /> : <ChevronDown className="h-3.5 w-3.5 text-blue-600" />;
  };

  const desde = filtrados.length ? (currentPage - 1) * pageSize + 1 : 0;
  const hasta = Math.min(currentPage * pageSize, filtrados.length);

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 antialiased">
      {/* Encabezado */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Seguimiento de créditos de vivienda</h1>
              <p className="text-sm text-slate-500">{clientes.length} clientes registrados · {proyectos.length} proyectos</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.secondary} onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" />Cargar Excel/CSV</button>
            <button type="button" className={btn.secondary} onClick={descargarPlantilla}><FileSpreadsheet className="h-4 w-4" /><span className="hidden sm:inline">Descargar</span> plantilla CSV</button>
            <button type="button" className={btn.primary} onClick={abrirNuevo}><Plus className="h-4 w-4" />Nuevo cliente</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Resumen financiero */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Clientes en vista', value: filtrados.length.toLocaleString('es-CO'), hint: hayFiltros ? 'según filtros activos' : 'total', icon: Users, color: 'text-blue-600 bg-blue-50' },
            { label: 'Valor a financiar', value: formatCompactMoney(resumen.totalFinanciar), hint: formatMoney(resumen.totalFinanciar), icon: Wallet, color: 'text-indigo-600 bg-indigo-50' },
            { label: 'Desembolsado', value: formatCompactMoney(resumen.desembolsado), hint: formatMoney(resumen.desembolsado), icon: Banknote, color: 'text-green-600 bg-green-50' },
            { label: 'Tasa de aprobación', value: resumen.tasaAprobacion === null ? '—' : `${resumen.tasaAprobacion}%`, hint: 'sobre créditos con respuesta del banco', icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
          ].map(({ label, value, hint, icon: Icon, color }) => (
            <div key={label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                <span className={`rounded-lg p-1.5 ${color}`}><Icon className="h-4 w-4" /></span>
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500" title={hint}>{hint}</p>
            </div>
          ))}
        </section>

        {/* Tarjetas por estado */}
        <section aria-label="Clientes por estado">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Clientes por etapa</h2>
            {filtroEstado && (
              <button type="button" onClick={() => setFiltroEstado('')} className="text-xs font-medium text-blue-600 hover:underline">Ver todas las etapas</button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {ESTADOS.map((e, i) => {
              const Icon = e.icon;
              const active = filtroEstado === e.id;
              const total = baseFiltrada.length || 1;
              const pct = Math.round((conteos[e.id] / total) * 100);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setFiltroEstado(active ? '' : e.id)}
                  aria-pressed={active}
                  className={`group rounded-xl p-3 text-left ring-1 transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${e.card} ${active ? 'shadow-md ring-2 ring-offset-1' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="text-[10px] font-semibold opacity-60">{i + 1}</span>
                  </div>
                  <p className="mt-2 text-2xl font-bold tabular-nums">{conteos[e.id]}</p>
                  <p className="text-xs font-medium leading-tight">{e.id}</p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/70">
                    <div className={`h-full rounded-full ${e.dot}`} style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Filtros y tabla */}
        <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                className={`${inputCls} pl-9`}
                placeholder="Buscar por cédula, nombre o proyecto…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                aria-label="Buscar clientes"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:w-auto">
              <div className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select className={`${inputCls} pl-9 lg:w-56`} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} aria-label="Filtrar por estado">
                  <option value="">Todos los estados</option>
                  {ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.id} ({conteos[e.id]})</option>)}
                </select>
              </div>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select className={`${inputCls} pl-9 lg:w-52`} value={filtroProyecto} onChange={(e) => setFiltroProyecto(e.target.value)} aria-label="Filtrar por proyecto">
                  <option value="">Todos los proyectos</option>
                  {proyectos.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              {hayFiltros && <button type="button" className={btn.secondary} onClick={limpiarFiltros} title="Limpiar filtros"><X className="h-4 w-4" /><span className="lg:hidden xl:inline">Limpiar</span></button>}
              <button type="button" className={btn.secondary} onClick={exportarExcel} title="Exportar lista filtrada a Excel"><Download className="h-4 w-4" />Excel</button>
              <button type="button" className={btn.secondary} onClick={exportarCSV} title="Exportar lista filtrada a CSV"><Download className="h-4 w-4" />CSV</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {COLUMNAS.map((col) => (
                    <th key={col.key} scope="col" aria-sort={sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`whitespace-nowrap px-4 py-3 font-semibold text-slate-600 ${col.numeric ? 'text-right' : 'text-left'}`}>
                      <button type="button" onClick={() => toggleSort(col.key)} className={`inline-flex items-center gap-1 hover:text-slate-900 ${col.numeric ? 'flex-row-reverse' : ''}`}>
                        {col.label}<SortIcon col={col.key} />
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagina.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">{formatDate(c.fechaRegistro)}</td>
                    <td className="px-4 py-3">
                      <p className="whitespace-nowrap font-medium text-slate-900">{c.nombre}</p>
                      <p className="text-xs tabular-nums text-slate-500">C.C. {c.cedula}</p>
                    </td>
                    <td className="px-4 py-3">
                      {c.telefono ? <a href={`tel:${c.telefono}`} className="whitespace-nowrap tabular-nums text-slate-700 hover:text-blue-600">{c.telefono}</a> : <span className="text-slate-400">—</span>}
                      {c.email && <a href={`mailto:${c.email}`} className="block max-w-[200px] truncate text-xs text-slate-500 hover:text-blue-600" title={c.email}>{c.email}</a>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{c.proyecto || <span className="text-slate-400">—</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">{formatDate(c.fechaEntrega)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700">{formatMoney(c.valorInmueble)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium text-slate-900">{formatMoney(c.valorFinanciar)}</td>
                    <td className="px-4 py-3"><EstadoBadge estado={c.estado} /></td>
                    <td className="max-w-[240px] px-4 py-3 text-slate-600"><p className="line-clamp-2 text-xs" title={c.observacion}>{c.observacion || <span className="text-slate-400">—</span>}</p></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button type="button" onClick={() => abrirEditar(c)} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600" aria-label={`Editar ${c.nombre}`} title="Editar"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => setToDelete(c)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label={`Eliminar ${c.nombre}`} title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pagina.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNAS.length + 1} className="px-4 py-16 text-center">
                      <Search className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-2 font-medium text-slate-700">{clientes.length ? 'Ningún cliente coincide con los filtros' : 'Aún no hay clientes'}</p>
                      <p className="mt-1 text-sm text-slate-500">{clientes.length ? 'Prueba con otra búsqueda o limpia los filtros.' : 'Crea uno nuevo o carga un archivo Excel/CSV.'}</p>
                      {hayFiltros && <button type="button" className={`${btn.secondary} mt-4`} onClick={limpiarFiltros}>Limpiar filtros</button>}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span>Mostrando <strong className="text-slate-900">{desde}–{hasta}</strong> de <strong className="text-slate-900">{filtrados.length}</strong></span>
              <select className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Registros por página">
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} por página</option>)}
              </select>
            </div>
            <nav className="flex items-center gap-1" aria-label="Paginación">
              <button type="button" className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - currentPage) <= 1)
                .reduce((acc, n, idx, arr) => {
                  if (idx > 0 && n - arr[idx - 1] > 1) acc.push('…');
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === '…' ? (
                    <span key={`e${i}`} className="px-2 text-slate-400">…</span>
                  ) : (
                    <button key={n} type="button" onClick={() => setPage(n)} aria-current={n === currentPage ? 'page' : undefined} className={`min-w-[2.25rem] rounded-lg px-2 py-1.5 font-medium ${n === currentPage ? 'bg-blue-600 text-white' : 'hover:bg-slate-100'}`}>{n}</button>
                  ),
                )}
              <button type="button" className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent" onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></button>
            </nav>
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-2 pb-4 text-xs text-slate-500 sm:flex-row">
          <p>Los datos se guardan en este navegador. Exporta a Excel para tener una copia de respaldo.</p>
          <button type="button" onClick={() => setConfirmReset(true)} className="inline-flex items-center gap-1 hover:text-slate-700"><RotateCcw className="h-3.5 w-3.5" />Restaurar datos de prueba</button>
        </footer>
      </main>

      <ClienteForm
        open={formOpen}
        initial={editing}
        clientes={clientes}
        proyectos={proyectos}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSave={guardarCliente}
      />

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={importar} />

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        size="max-w-md"
        title="Eliminar cliente"
        footer={
          <>
            <button type="button" className={btn.secondary} onClick={() => setToDelete(null)}>Cancelar</button>
            <button type="button" className={btn.danger} onClick={eliminarCliente}><Trash2 className="h-4 w-4" />Eliminar</button>
          </>
        }
      >
        <p className="text-sm text-slate-600">¿Seguro que quieres eliminar a <strong className="text-slate-900">{toDelete?.nombre}</strong> (C.C. {toDelete?.cedula})? Esta acción no se puede deshacer.</p>
      </Modal>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        size="max-w-md"
        title="Restaurar datos de prueba"
        footer={
          <>
            <button type="button" className={btn.secondary} onClick={() => setConfirmReset(false)}>Cancelar</button>
            <button type="button" className={btn.danger} onClick={restaurarDemo}><RotateCcw className="h-4 w-4" />Restaurar</button>
          </>
        }
      >
        <p className="text-sm text-slate-600">Se reemplazará la lista actual ({clientes.length} clientes) por los {DATOS_INICIALES.length} registros de prueba. Exporta primero si quieres conservar tus datos.</p>
      </Modal>

      {toast && (
        <div key={toast.id} role="status" aria-live="polite" className={`fixed bottom-4 left-4 right-4 z-[60] mx-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-lg sm:left-auto sm:right-6 sm:mx-0 ${toast.type === 'error' ? 'bg-rose-600' : 'bg-slate-900'}`}>
          {toast.type === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />}
          <span className="flex-1">{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} className="opacity-70 hover:opacity-100" aria-label="Cerrar aviso"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
