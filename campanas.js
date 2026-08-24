/* ============================================================
   TNR · Campañas de WhatsApp — capa de datos
   ------------------------------------------------------------
   Habla con las tablas nuevas (campanas, campana_destinatarios,
   plantillas, mensajes, supresiones) y arma el segmento a partir
   de los prospectos que ya tiene cargados data.js.

   A diferencia del resto del CRM, acá NO se baja la colección
   entera al navegador: una campaña puede tener 1.400 filas y se
   piden de a pedazos, filtradas por la base.

   Requiere: config.js, tel.js, data.js (window.DB).
   ============================================================ */
(function () {
  'use strict';

  const REST = window.SUPABASE_URL ? window.SUPABASE_URL + '/rest/v1/' : '';
  const KEY = window.SUPABASE_ANON_KEY || '';
  const HEAD = {
    apikey: KEY,
    Authorization: 'Bearer ' + KEY,
    'Content-Type': 'application/json',
  };

  // Marca para los excluidos que no tienen un número usable: la columna
  // telefono no admite vacío y no se puede repetir dentro de una campaña.
  const SIN_NUMERO = 'sin-numero:';

  const ESTADOS_CAMPANA = ['borrador', 'programada', 'en_curso', 'pausada', 'completada', 'cancelada'];

  const ESTADOS_DEST = {
    pendiente:  { label: 'Pendiente',  color: '#8b94a8' },
    enviando:   { label: 'Enviando',   color: '#3fb5ee' },
    enviado:    { label: 'Enviado',    color: '#1C9FE2' },
    entregado:  { label: 'Entregado',  color: '#1466bd' },
    leido:      { label: 'Leído',      color: '#7c5cff' },
    respondido: { label: 'Respondió',  color: '#3ecf8e' },
    fallido:    { label: 'Falló',      color: '#ff5d6c' },
    suprimido:  { label: 'Excluido',   color: '#607699' },
  };

  // Las variables que se pueden meter en un mensaje. Salen del prospecto
  // real: si mañana se agrega un campo al CRM, se agrega acá y listo.
  const VARIABLES = [
    { id: 'nombre',   label: 'Nombre',   de: p => p.nombre || '' },
    { id: 'empresa',  label: 'Empresa',  de: p => p.empresa || p.nombre || '' },
    { id: 'rubro',    label: 'Rubro',    de: p => p.rubro || '' },
    { id: 'ciudad',   label: 'Ciudad',   de: p => p.ciudad || '' },
    { id: 'servicio', label: 'Servicio', de: p => (p.servicios && p.servicios[0]) || '' },
  ];

  const MOTIVOS_SUPRESION = {
    no_contactar:   'Está en la lista de no contactar',
    sin_numero:     'El teléfono no sirve para WhatsApp',
    sin_whatsapp:   'Ya se comprobó que no tiene WhatsApp',
    cerrado:        'El prospecto ya está Ganado o Perdido',
    reciente:       'Se lo contactó hace poco',
    duplicado:      'Otro prospecto tiene el mismo número',
  };

  /* ---------- Utilidades ---------- */

  function uid(prefijo) {
    return prefijo + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function hayNube() { return !!(REST && KEY); }

  function esSinNumero(telefono) { return String(telefono || '').indexOf(SIN_NUMERO) === 0; }

  async function pedir(ruta, opciones) {
    if (!hayNube()) throw new Error('La base no está configurada');
    const r = await fetch(REST + ruta, Object.assign({ headers: HEAD }, opciones || {}));
    if (!r.ok) {
      const detalle = await r.text();
      // El error más probable al principio: todavía no se corrió campanas-setup.sql.
      if (r.status === 404 || /does not exist|schema cache/i.test(detalle)) {
        throw new Error('FALTAN_TABLAS');
      }
      throw new Error('La base rechazó la operación (' + r.status + '): ' + detalle.slice(0, 200));
    }
    if (r.status === 204) return null;
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  }

  async function rpc(fn, args) {
    return pedir('rpc/' + fn, { method: 'POST', body: JSON.stringify(args || {}) });
  }

  /* ---------- Campañas ---------- */

  async function listar() {
    return (await pedir('campanas?select=*&order=creada_en.desc')) || [];
  }

  async function obtener(id) {
    const r = await pedir('campanas?select=*&id=eq.' + encodeURIComponent(id));
    return (r && r[0]) || null;
  }

  async function crear(datos) {
    const fila = Object.assign({
      id: uid('CMP'),
      nombre: 'Campaña sin nombre',
      estado: 'borrador',
      criterio: {},
      canal: 'prueba',
      cupo_diario: 50,
      intervalo_seg: 45,
      ventana_desde: '09:00',
      ventana_hasta: '18:00',
      dias_semana: [1, 2, 3, 4, 5],
      creada_por: 'Mateo',
    }, datos);
    const r = await pedir('campanas', {
      method: 'POST',
      headers: Object.assign({}, HEAD, { Prefer: 'return=representation' }),
      body: JSON.stringify(fila),
    });
    return r[0];
  }

  async function actualizar(id, cambios) {
    cambios = Object.assign({}, cambios, { actualizada_en: new Date().toISOString() });
    const r = await pedir('campanas?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: Object.assign({}, HEAD, { Prefer: 'return=representation' }),
      body: JSON.stringify(cambios),
    });
    return r[0];
  }

  async function eliminar(id) {
    // Los destinatarios se van solos por el on delete cascade.
    await pedir('campanas?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  }

  // Contadores por estado, calculados por la base. No baja las filas.
  async function resumen(id) {
    const filas = (await rpc('campana_resumen', { p_campana: id })) || [];
    const out = { total: 0 };
    Object.keys(ESTADOS_DEST).forEach(k => { out[k] = 0; });
    filas.forEach(f => { out[f.estado] = Number(f.total); out.total += Number(f.total); });
    // "Alcanzables" = a los que efectivamente se les va a mandar algo.
    out.alcanzables = out.total - out.suprimido;
    return out;
  }

  // Contadores de todas las campañas en una sola consulta.
  // → { campanaId: {total, enviado, respondido, ...} }
  async function resumenTodas() {
    const filas = (await rpc('campanas_resumen_todas')) || [];
    const out = {};
    filas.forEach(f => {
      const r = out[f.campana_id] || (out[f.campana_id] = { total: 0 });
      r[f.estado] = Number(f.total);
      r.total += Number(f.total);
    });
    Object.values(out).forEach(r => {
      Object.keys(ESTADOS_DEST).forEach(k => { if (r[k] == null) r[k] = 0; });
      r.alcanzables = r.total - r.suprimido;
    });
    return out;
  }

  /* ---------- Destinatarios ---------- */

  async function destinatarios(campanaId, opciones) {
    const o = opciones || {};
    const desde = (o.pagina || 0) * (o.porPagina || 50);
    const hasta = desde + (o.porPagina || 50) - 1;
    let ruta = 'campana_destinatarios?select=*&campana_id=eq.' + encodeURIComponent(campanaId);
    if (o.estado) ruta += '&estado=eq.' + encodeURIComponent(o.estado);
    ruta += '&order=id.asc';
    return (await pedir(ruta, { headers: Object.assign({}, HEAD, { Range: desde + '-' + hasta }) })) || [];
  }

  /* ---------- Plantillas ---------- */

  async function plantillas() {
    return (await pedir('plantillas?select=*&archivada=is.false&order=creada_en.desc')) || [];
  }

  async function guardarPlantilla(datos) {
    const nueva = !datos.id;
    const fila = Object.assign({ id: uid('PLT'), nombre: 'Plantilla', bloques: [], variables: [] }, datos);
    if (nueva) {
      const r = await pedir('plantillas', {
        method: 'POST',
        headers: Object.assign({}, HEAD, { Prefer: 'return=representation' }),
        body: JSON.stringify(fila),
      });
      return r[0];
    }
    const r = await pedir('plantillas?id=eq.' + encodeURIComponent(fila.id), {
      method: 'PATCH',
      headers: Object.assign({}, HEAD, { Prefer: 'return=representation' }),
      body: JSON.stringify(fila),
    });
    return r[0];
  }

  async function archivarPlantilla(id) {
    await pedir('plantillas?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', body: JSON.stringify({ archivada: true }),
    });
  }

  /* ---------- Supresiones ---------- */

  async function supresiones() {
    const filas = (await pedir('supresiones?select=telefono,motivo')) || [];
    const mapa = new Map();
    filas.forEach(f => mapa.set(f.telefono, f.motivo));
    return mapa;
  }

  async function suprimir(telefono, motivo, origen) {
    await pedir('supresiones', {
      method: 'POST',
      headers: Object.assign({}, HEAD, { Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify({ telefono: telefono, motivo: motivo, origen: origen || 'manual' }),
    });
  }

  /* ---------- Mensajes ---------- */

  // Si una variable queda vacía, el texto no puede terminar en "Hola , somos
  // de TNR": se juntan los espacios y se pega la puntuación que quedó suelta.
  // La misma limpieza está en el motor de envío, así lo que se ve en la vista
  // previa es exactamente lo que le llega a la persona.
  function limpiar(texto) {
    return String(texto || '')
      .replace(/\(\s*\)/g, '')          // parentesis que quedaron vacios
      .replace(/[ 	]{2,}/g, ' ')        // espacios de mas
      .replace(/[ 	]+([,.;:!?])/g, '$1') // puntuacion que quedo suelta
      .trim();
  }

  function reemplazarVariables(texto, prospecto) {
    const resuelto = String(texto || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (todo, clave) => {
      const v = VARIABLES.find(x => x.id === clave);
      return v ? (v.de(prospecto) || '') : todo;
    });
    return limpiar(resuelto);
  }

  // Qué variables usa un texto, y cuáles de esas le faltan al prospecto.
  function variablesDe(texto) {
    const encontradas = [];
    String(texto || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (t, c) => { if (encontradas.indexOf(c) < 0) encontradas.push(c); return t; });
    return encontradas;
  }

  function faltantes(texto, prospecto) {
    return variablesDe(texto).filter(c => {
      const v = VARIABLES.find(x => x.id === c);
      return !v || !String(v.de(prospecto) || '').trim();
    });
  }

  function textoPlano(plantilla) {
    if (!plantilla) return '';
    const bloques = plantilla.bloques || [];
    return bloques.filter(b => b.tipo === 'texto').map(b => b.contenido).join('\n\n');
  }

  /* ---------- Armado del segmento ----------
     Toma los filtros de la pantalla y devuelve a quién se le manda y a
     quién no, con el motivo. Es la única parte que decide destinatarios:
     el motor después no vuelve a elegir, sólo ejecuta.
  ---------------------------------------------------------------- */

  function pasaFiltro(p, c) {
    if (c.tipo && (p.tipo || '') !== c.tipo) return false;
    if (c.subtipo && (p.subtipo || '') !== c.subtipo) return false;
    if (c.rubro && (p.rubro || '') !== c.rubro) return false;
    if (c.ciudad && (p.ciudad || '') !== c.ciudad) return false;
    if (c.prioridad && (p.prioridad || '') !== c.prioridad) return false;
    if (c.estado && (p.estado || '') !== c.estado) return false;
    if (c.segmento && (p.segmento || '') !== c.segmento) return false;
    if (c.soloSinContactar) {
      const canales = p.canalesContacto || [];
      if (canales.length) return false;
      if (/^Contactado/i.test(String(p.estado || ''))) return false;
    }
    if (c.sinWhatsAppPrevio) {
      if ((p.canalesContacto || []).indexOf('WhatsApp') >= 0) return false;
    }
    return true;
  }

  function diasDesde(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  /* criterio: { tipo, ciudad, rubro, prioridad, soloSinContactar, diasMinimos, ... }
     Devuelve { incluidos: [{prospecto, telefono, variables}], excluidos: [{prospecto, motivo}] } */
  async function armarSegmento(criterio, plantillaTexto) {
    const c = criterio || {};
    const dias = c.diasMinimos == null ? 30 : Math.max(7, Number(c.diasMinimos));
    const noContactar = await supresiones().catch(() => new Map());

    const incluidos = [], excluidos = [];
    const yaVisto = new Map();   // teléfono → prospecto que se lo quedó

    (DB.getProspectos() || []).forEach(p => {
      if (!pasaFiltro(p, c)) return;

      const tel = window.TEL.deProspecto(p);

      if (!tel.ok) return excluidos.push({ prospecto: p, motivo: MOTIVOS_SUPRESION.sin_numero, detalle: tel.motivo });

      const sup = noContactar.get(tel.e164);
      if (sup) return excluidos.push({ prospecto: p, motivo: sup === 'sin_whatsapp' ? MOTIVOS_SUPRESION.sin_whatsapp : MOTIVOS_SUPRESION.no_contactar });

      if (['Ganado', 'Perdido'].indexOf(p.estado) >= 0) return excluidos.push({ prospecto: p, motivo: MOTIVOS_SUPRESION.cerrado });

      const d = diasDesde(p.ultimoContacto);
      if (d != null && d < dias) return excluidos.push({ prospecto: p, motivo: MOTIVOS_SUPRESION.reciente, detalle: 'hace ' + d + ' días' });

      if (yaVisto.has(tel.e164)) {
        const dueño = yaVisto.get(tel.e164);
        return excluidos.push({ prospecto: p, motivo: MOTIVOS_SUPRESION.duplicado, detalle: 'mismo número que ' + (dueño.empresa || dueño.nombre) });
      }
      yaVisto.set(tel.e164, p);

      const variables = {};
      VARIABLES.forEach(v => { variables[v.id] = v.de(p); });

      incluidos.push({
        prospecto: p,
        telefono: tel.e164,
        variables: variables,
        faltantes: plantillaTexto ? faltantes(plantillaTexto, p) : [],
      });
    });

    return { incluidos: incluidos, excluidos: excluidos, diasMinimos: dias };
  }

  /* Congela el segmento en la base. De acá en adelante la campaña tiene
     su lista propia: si después cambia un prospecto, no se le mueve. */
  async function confirmar(campanaId, segmento, opciones) {
    const o = opciones || {};
    const filas = segmento.incluidos.map(i => ({
      campana_id: campanaId,
      prospecto_id: i.prospecto.id,
      telefono: i.telefono,
      variables: i.variables,
      variante: o.variante || null,
      estado: 'pendiente',
    }));

    if (o.guardarExcluidos !== false) {
      segmento.excluidos.forEach(e => {
        const tel = window.TEL.deProspecto(e.prospecto);
        // Al que no tiene número usable igual le guardamos la fila, porque
        // "quedó afuera por teléfono inválido" es justamente lo que hay que
        // poder ver después. Como la columna no admite vacío y no puede
        // repetirse dentro de la campaña, se marca con el id del prospecto.
        filas.push({
          campana_id: campanaId,
          prospecto_id: e.prospecto.id,
          telefono: tel.ok ? tel.e164 : (SIN_NUMERO + e.prospecto.id),
          variables: {},
          estado: 'suprimido',
          motivo: e.motivo + (e.detalle ? ' (' + e.detalle + ')' : ''),
        });
      });
    }

    // De a 200 y con respiro: el navegador corta las conexiones si se le
    // encajan mil filas de una (la misma lección que sincronizarTodo).
    let insertadas = 0;
    for (let i = 0; i < filas.length; i += 200) {
      const tanda = filas.slice(i, i + 200);
      await pedir('campana_destinatarios', {
        method: 'POST',
        headers: Object.assign({}, HEAD, { Prefer: 'resolution=ignore-duplicates,return=minimal' }),
        body: JSON.stringify(tanda),
      });
      insertadas += tanda.length;
      if (o.onProgreso) o.onProgreso(insertadas, filas.length);
      await new Promise(r => setTimeout(r, 100));
    }
    return insertadas;
  }

  /* ---------- Chequeo de instalación ---------- */

  async function tablasListas() {
    try { await pedir('campanas?select=id&limit=1'); return true; }
    catch (e) { if (e.message === 'FALTAN_TABLAS') return false; throw e; }
  }

  window.CAMP = {
    ESTADOS_CAMPANA, ESTADOS_DEST, VARIABLES, MOTIVOS_SUPRESION,
    SIN_NUMERO, esSinNumero,
    hayNube, tablasListas,
    listar, obtener, crear, actualizar, eliminar, resumen, resumenTodas,
    destinatarios,
    plantillas, guardarPlantilla, archivarPlantilla,
    supresiones, suprimir,
    reemplazarVariables, limpiar, variablesDe, faltantes, textoPlano,
    armarSegmento, confirmar,
  };
})();
