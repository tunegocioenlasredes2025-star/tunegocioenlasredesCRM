/* ============================================================
   TNR · Reparación de `canalesContacto`
   ------------------------------------------------------------
   EL PROBLEMA
   La campaña de mail marcó a los prospectos cambiándoles el `estado`
   (con actualizarProspecto) en vez de usar registrarContacto(). Resultado:
   787 prospectos dicen "Contactado por mail" pero tienen `canalesContacto`
   vacío y `ultimoContacto` sin fecha.

   POR QUÉ IMPORTA
   `canalesContacto` es el campo sobre el que se apoya la supresión de las
   campañas. Si no se repara, esos 787 entran como "nunca contactados" y
   les llega un WhatsApp igual. Es el duplicado que el módulo tiene que evitar.

   QUÉ HACE
   Rellena `canalesContacto` y `ultimoContacto` deduciéndolos del `estado` y
   de la entrada del historial que registró el cambio. No toca ningún otro
   campo, no cambia estados y no pisa datos que ya existan.

   CÓMO SE USA
     node backfill-contactos.mjs             → simulacro, no escribe nada
     node backfill-contactos.mjs --aplicar   → escribe en Supabase

   Correrlo ANTES de auth-setup.sql (después de cerrar la base, la anon key
   ya no puede escribir y hay que hacerlo desde una sesión con login).
   ============================================================ */

import fs from 'fs';

const APLICAR = process.argv.includes('--aplicar');
// Los reportes van FUERA del repo: tienen telefonos de prospectos y el repo es publico.
const REPORTES = 'C:/TNR/Campanas-reportes/';
fs.mkdirSync(REPORTES, { recursive: true });
const ENDPOINT = 'https://oqhzonwrcldwtdfurhzj.supabase.co/rest/v1/prospectos';
const KEY = process.env.SUPABASE_KEY || (() => {
  const cfg = fs.readFileSync(new URL('./config.js', import.meta.url), 'utf8');
  return cfg.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/)[1];
})();
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

// El estado dice por qué canal se lo tocó. 'Contactado' a secas se toma como
// mail, que es el criterio que ya usa ESTADOS_LEGACY en data.js.
const CANAL_POR_ESTADO = [
  [/mail\s*\+\s*wsp|mail\s*\+\s*whatsapp/i, ['Mail', 'WhatsApp']],
  [/por\s*mail/i,                            ['Mail']],
  [/por\s*wsp|por\s*whatsapp/i,              ['WhatsApp']],
  [/por\s*ig|por\s*instagram/i,              ['Instagram']],
  [/^contactado$/i,                          ['Mail']],
];

function canalesDe(estado) {
  const e = String(estado || '').trim();
  for (const [re, canales] of CANAL_POR_ESTADO) if (re.test(e)) return canales;
  return null;
}

// La fecha del contacto quedó en la entrada del historial que registró
// el cambio de estado. Si no está, caemos a la creación del prospecto.
function fechaDe(p) {
  const h = Array.isArray(p.historial) ? p.historial : [];
  const cambio = h.find(x => x.tipo === 'Estado' && /→\s*Contactado/i.test(x.texto || ''));
  if (cambio && cambio.fecha) return { fecha: cambio.fecha, fuente: 'historial' };
  const ultima = h.find(x => x.fecha);
  if (ultima) return { fecha: ultima.fecha, fuente: 'ultima entrada del historial' };
  if (p.fechaCreacion) return { fecha: p.fechaCreacion, fuente: 'fecha de creacion' };
  return { fecha: '', fuente: 'sin fecha' };
}

async function traerTodos() {
  let filas = [], off = 0;
  while (true) {
    const r = await fetch(ENDPOINT + '?select=id,data', { headers: { ...H, Range: `${off}-${off + 999}` } });
    if (!r.ok) throw new Error('Lectura falló: ' + r.status + ' ' + await r.text());
    const b = await r.json();
    filas = filas.concat(b);
    if (b.length < 1000) break;
    off += 1000;
  }
  return filas;
}

const filas = await traerTodos();
const cambios = [];

for (const fila of filas) {
  const p = fila.data;
  const yaTiene = Array.isArray(p.canalesContacto) && p.canalesContacto.length > 0;
  if (yaTiene && p.ultimoContacto) continue;

  const canales = canalesDe(p.estado);
  if (!canales) continue;                       // nunca se lo contactó: no hay nada que reparar

  const { fecha, fuente } = fechaDe(p);
  const nuevo = { ...p };
  if (!yaTiene) nuevo.canalesContacto = canales;
  if (!p.ultimoContacto && fecha) nuevo.ultimoContacto = fecha;

  cambios.push({
    id: fila.id,
    empresa: p.empresa || p.nombre || '',
    estado: p.estado,
    canales: (nuevo.canalesContacto || []).join('+'),
    fecha: (nuevo.ultimoContacto || '').slice(0, 10),
    fuente,
    data: nuevo,
  });
}

console.log('Prospectos en la base:', filas.length);
console.log('A reparar:', cambios.length);
const porCanal = {}, porFuente = {};
for (const c of cambios) {
  porCanal[c.canales] = (porCanal[c.canales] || 0) + 1;
  porFuente[c.fuente] = (porFuente[c.fuente] || 0) + 1;
}
console.log('\n-- canal que se les asigna --');
Object.entries(porCanal).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + k + ': ' + v));
console.log('-- de dónde sale la fecha --');
Object.entries(porFuente).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + k + ': ' + v));

const csv = a => a.map(f => '"' + String(f ?? '').replace(/"/g, '""') + '"').join(',');
fs.writeFileSync(REPORTES + 'backfill-contactos-preview.csv',
  '﻿' + ['id,empresa,estado,canales,fecha,fuente']
    .concat(cambios.map(c => csv([c.id, c.empresa, c.estado, c.canales, c.fecha, c.fuente])))
    .join('\r\n'), 'utf8');
console.log('\nDetalle fila por fila en: ' + REPORTES + 'backfill-contactos-preview.csv');

if (!APLICAR) {
  console.log('\nSIMULACRO: no se escribió nada. Revisá el CSV y volvé a correr con --aplicar.');
  process.exit(0);
}

console.log('\nEscribiendo en Supabase…');
let ok = 0, mal = 0;
for (let i = 0; i < cambios.length; i += 5) {
  const tanda = cambios.slice(i, i + 5);
  const res = await Promise.allSettled(tanda.map(c =>
    fetch(`${ENDPOINT}?id=eq.${encodeURIComponent(c.id)}`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ data: c.data, updated_at: new Date().toISOString() }),
    }).then(async r => { if (!r.ok) throw new Error(r.status + ' ' + await r.text()); })
  ));
  res.forEach(r => { if (r.status === 'fulfilled') ok++; else { mal++; if (mal <= 3) console.error('  ', r.reason.message); } });
  if (i % 100 === 0) console.log(`  ${ok + mal}/${cambios.length}`);
  await new Promise(r => setTimeout(r, 120));   // el mismo respiro que usa sincronizarTodo()
}
console.log(`\nListo. Actualizados: ${ok} · Fallados: ${mal}`);
