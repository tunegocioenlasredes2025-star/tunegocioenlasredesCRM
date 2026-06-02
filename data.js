/* ============================================================
   TNR · Capa de datos
   - Modo NUBE (Supabase): datos compartidos en tiempo real.
   - Modo LOCAL (sin claves / sin internet): localStorage.
   localStorage funciona siempre como respaldo offline.
   ============================================================ */
(function () {
  'use strict';

  const KEY = 'tnr_crm_v1';
  const TABLES = ['prospectos', 'clientes', 'tareas'];

  /* ---------- Catálogos ---------- */
  const METODOS_CONTACTO = ['Cold Call', 'WhatsApp', 'Instagram', 'LinkedIn', 'Referido', 'Boca en Boca', 'Networking', 'Email'];

  const ESTADOS_LEAD = [
    { id: 'Prospecto',        color: '#8b94a8' },
    { id: 'Contactado',       color: '#1C9FE2' },
    { id: 'Respondió',        color: '#3fb5ee' },
    { id: 'Interesado',       color: '#1466bd' },
    { id: 'Reunión Agendada', color: '#7c5cff' },
    { id: 'Demo Enviada',     color: '#f59e42' },
    { id: 'Propuesta Enviada',color: '#f5c451' },
    { id: 'Seguimiento',      color: '#3fb5ee' },
    { id: 'Ganado',           color: '#3ecf8e' },
    { id: 'Perdido',          color: '#ff5d6c' },
    { id: 'Recontactar',      color: '#f59e42' },
  ];

  const ESTADOS_CONTENIDO = ['Pendiente', 'En Diseño', 'En Revisión', 'Esperando Cliente', 'Aprobado', 'Programado', 'Publicado'];
  const ESTADOS_TAREA = ['Pendiente', 'En Curso', 'Finalizada'];
  const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Urgente'];

  const SERVICIOS = [
    { id: 'rs-basico',  cat: 'Gestión de Redes', nombre: 'Plan Básico',        precio: 200000, recurrente: true,
      detalle: '4 Carruseles · 4 Estáticas · 4 Reels (12 contenidos · 3 publicaciones/semana)', contenidos: { carrusel: 4, estatica: 4, reel: 4 } },
    { id: 'rs-inter',   cat: 'Gestión de Redes', nombre: 'Plan Intermedio',    precio: 280000, recurrente: true,
      detalle: '8 Carruseles · 6 Estáticas · 6 Reels (20 contenidos)', contenidos: { carrusel: 8, estatica: 6, reel: 6 } },
    { id: 'rs-boost',   cat: 'Gestión de Redes', nombre: 'Plan Boost',         precio: 380000, recurrente: true,
      detalle: '16 Carruseles · 6 Estáticas · 8 Reels (30 contenidos)', contenidos: { carrusel: 16, estatica: 6, reel: 8 } },
    { id: 'web-landing',cat: 'Desarrollo Web',   nombre: 'Landing Page',       precio: 150000, recurrente: false, detalle: 'Página de aterrizaje', contenidos: {} },
    { id: 'web-pagina', cat: 'Desarrollo Web',   nombre: 'Página Web',         precio: 200000, recurrente: false, detalle: 'Sitio web institucional', contenidos: {} },
    { id: 'web-carrito',cat: 'Desarrollo Web',   nombre: 'Web con Carrito',    precio: 250000, recurrente: false, detalle: 'E-commerce con carrito', contenidos: {} },
    { id: 'mant',       cat: 'Mantenimiento',    nombre: 'Mantenimiento',      precio: 50000,  recurrente: true,  detalle: 'SEO · Optimización · Actualizaciones · Soporte', contenidos: {} },
  ];

  function defaultData() { return { prospectos: [], clientes: [], tareas: [], _seeded: false }; }

  /* ---------- Almacenamiento local ---------- */
  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      const raw = localStorage.getItem(KEY);
      cache = raw ? JSON.parse(raw) : defaultData();
    } catch (e) { console.error('No se pudo leer el almacenamiento', e); cache = defaultData(); }
    TABLES.forEach(t => { if (!cache[t]) cache[t] = []; });
    return cache;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); }
    catch (e) { console.error('No se pudo guardar local', e); }
  }

  function uid(prefix) {
    const r = Math.random().toString(36).slice(2, 8);
    const t = (load()._counter = (load()._counter || 0) + 1);
    return `${prefix}-${t}-${r}`;
  }
  function nowISO() { return new Date().toISOString(); }

  /* ============================================================
     NUBE (Supabase)
     ============================================================ */
  const Cloud = {
    client: null,
    enabled: false,
    init() {
      try {
        if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient) {
          this.client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
            realtime: { params: { eventsPerSecond: 5 } },
          });
          this.enabled = true;
        }
      } catch (e) { console.error('Supabase init', e); this.enabled = false; }
      return this.enabled;
    },
    async pullAll() {
      for (const t of TABLES) {
        const { data, error } = await this.client.from(t).select('id,data').order('updated_at', { ascending: false });
        if (error) throw error;
        cache[t] = (data || []).map(r => r.data);
      }
    },
    push(table, obj) {
      if (!this.enabled) return;
      this.client.from(table)
        .upsert({ id: obj.id, data: obj, updated_at: nowISO() })
        .then(({ error }) => { if (error) console.error('push ' + table, error); });
    },
    remove(table, id) {
      if (!this.enabled) return;
      this.client.from(table).delete().eq('id', id)
        .then(({ error }) => { if (error) console.error('remove ' + table, error); });
    },
    subscribe(onChange) {
      if (!this.enabled) return;
      this.client.channel('tnr-realtime')
        .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
          applyRemote(payload);
          if (typeof onChange === 'function') onChange();
        })
        .subscribe();
    },
  };

  function applyRemote(p) {
    const table = p.table;
    if (!cache[table]) return;
    if (p.eventType === 'DELETE') {
      const id = p.old && p.old.id;
      cache[table] = cache[table].filter(x => x.id !== id);
    } else if (p.new && p.new.data) {
      const obj = p.new.data;
      const i = cache[table].findIndex(x => x.id === obj.id);
      if (i >= 0) cache[table][i] = obj; else cache[table].unshift(obj);
    }
    save();
  }

  /* ---------- Migración financiera (modelo viejo -> facturas+pagos) ---------- */
  // Convierte facturas con { pagado:true } en un pago real, una sola vez por cliente.
  function migrarFinanzasCliente(c) {
    let cambiado = false;
    if (!c.pagos) { c.pagos = []; cambiado = true; }
    (c.facturacion || []).forEach(f => {
      if (Object.prototype.hasOwnProperty.call(f, 'pagado')) {
        if (f.pagado === true) {
          c.pagos.push({ id: uid('PG'), monto: Math.round(+f.monto || 0), fecha: f.fecha || nowISO(), metodo: 'Otro', observaciones: 'Pago migrado del registro anterior', facturaId: f.id });
        }
        delete f.pagado;
        cambiado = true;
      }
      if (f.monto != null) f.monto = Math.round(+f.monto || 0);
    });
    return cambiado;
  }
  function migrarFinanzas() {
    (load().clientes || []).forEach(c => { if (migrarFinanzasCliente(c)) { Cloud.push('clientes', c); } });
    save();
  }

  /* ---------- Inicialización ---------- */
  async function init() {
    load();
    if (Cloud.init()) {
      try { await Cloud.pullAll(); save(); }
      catch (e) { console.error('No se pudo sincronizar con la nube, uso datos locales', e); }
      Cloud.subscribe(() => { if (window.DB && typeof DB.onRemoteChange === 'function') DB.onRemoteChange(); });
    } else {
      seedIfEmpty(); // datos de ejemplo solo en modo local
    }
    migrarFinanzas(); // normaliza datos existentes
    return Cloud.enabled;
  }

  /* ============================================================
     PROSPECTOS
     ============================================================ */
  function getProspectos() { return load().prospectos; }
  function getProspecto(id) { return load().prospectos.find(p => p.id === id); }

  function crearProspecto(d) {
    const p = Object.assign({
      id: uid('PR'), fechaCreacion: nowISO(),
      nombre: '', empresa: '', rubro: '', ciudad: '', provincia: '', pais: 'Argentina',
      telefono: '', whatsapp: '', email: '', instagram: '', facebook: '', linkedin: '', sitioWeb: '',
      metodoContacto: '', estado: 'Prospecto', observaciones: '',
      proximaAccion: '', fechaSeguimiento: '', responsable: '', historial: [],
    }, d);
    if (!p.historial.length) p.historial.push({ tipo: 'Nota', texto: 'Prospecto creado', fecha: nowISO() });
    load().prospectos.unshift(p);
    save(); Cloud.push('prospectos', p);
    return p;
  }
  function actualizarProspecto(id, cambios) {
    const p = getProspecto(id);
    if (!p) return null;
    if (cambios.estado && cambios.estado !== p.estado) p.historial.unshift({ tipo: 'Estado', texto: `Estado: ${p.estado} → ${cambios.estado}`, fecha: nowISO() });
    Object.assign(p, cambios);
    save(); Cloud.push('prospectos', p);
    return p;
  }
  function agregarHistorial(id, tipo, texto) {
    const p = getProspecto(id);
    if (!p) return;
    p.historial.unshift({ tipo, texto, fecha: nowISO() });
    save(); Cloud.push('prospectos', p);
  }
  function eliminarProspecto(id) {
    cache.prospectos = cache.prospectos.filter(p => p.id !== id);
    save(); Cloud.remove('prospectos', id);
  }
  function convertirEnCliente(id) {
    const p = getProspecto(id);
    if (!p) return null;
    const c = crearCliente({
      nombre: p.nombre, empresa: p.empresa, rubro: p.rubro, ciudad: p.ciudad, provincia: p.provincia, pais: p.pais,
      telefono: p.telefono, whatsapp: p.whatsapp, email: p.email, instagram: p.instagram, facebook: p.facebook,
      linkedin: p.linkedin, sitioWeb: p.sitioWeb, responsable: p.responsable, observaciones: p.observaciones, prospectoOrigen: p.id,
    });
    actualizarProspecto(id, { estado: 'Ganado' });
    agregarHistorial(id, 'Nota', 'Convertido en cliente');
    return c;
  }

  /* ============================================================
     CLIENTES
     ============================================================ */
  function getClientes() { return load().clientes; }
  function getCliente(id) { return load().clientes.find(c => c.id === id); }

  function crearCliente(d) {
    const c = Object.assign({
      id: uid('CL'), fechaCreacion: nowISO(),
      nombre: '', empresa: '', rubro: '', ciudad: '', provincia: '', pais: 'Argentina',
      telefono: '', whatsapp: '', email: '', instagram: '', facebook: '', linkedin: '', sitioWeb: '',
      responsable: '', estado: 'Activo', observaciones: '',
      servicios: [], contenidos: [], facturacion: [], pagos: [], historial: [],
    }, d);
    if (!c.historial.length) c.historial.push({ tipo: 'Nota', texto: 'Cliente creado', fecha: nowISO() });
    load().clientes.unshift(c);
    save(); Cloud.push('clientes', c);
    return c;
  }
  function actualizarCliente(id, cambios) {
    const c = getCliente(id);
    if (!c) return null;
    Object.assign(c, cambios);
    save(); Cloud.push('clientes', c);
    return c;
  }
  function eliminarCliente(id) {
    cache.clientes = cache.clientes.filter(c => c.id !== id);
    save(); Cloud.remove('clientes', id);
  }
  function agregarServicioCliente(clienteId, servicioId) {
    const c = getCliente(clienteId);
    const srv = SERVICIOS.find(s => s.id === servicioId);
    if (!c || !srv) return;
    const item = { id: uid('SV'), servicioId: srv.id, nombre: srv.nombre, cat: srv.cat, precio: srv.precio, recurrente: srv.recurrente, desde: nowISO() };
    c.servicios.push(item);
    const cont = srv.contenidos || {};
    const labels = { carrusel: 'Carrusel', estatica: 'Estática', reel: 'Reel' };
    Object.keys(cont).forEach(tipo => {
      for (let i = 1; i <= cont[tipo]; i++) c.contenidos.push({ id: uid('CT'), tipo: labels[tipo], titulo: `${labels[tipo]} ${i}`, estado: 'Pendiente', fechaPub: '', servicioItem: item.id });
    });
    item.detalle = srv.detalle;
    c.facturacion.push({ id: uid('FC'), concepto: srv.nombre, monto: srv.precio, fecha: nowISO(), observaciones: '', origenServicio: item.id });
    c.historial.unshift({ tipo: 'Servicio', texto: `Contrató: ${srv.nombre} ($${srv.precio.toLocaleString('es-AR')})`, fecha: nowISO() });
    save(); Cloud.push('clientes', c);
    return item;
  }

  // Plan a medida: cantidades libres de carruseles/estáticas/reels + precio
  function agregarServicioPersonalizado(clienteId, opts) {
    const c = getCliente(clienteId);
    if (!c) return;
    const counts = { carrusel: Math.max(0, parseInt(opts.carrusel, 10) || 0), estatica: Math.max(0, parseInt(opts.estatica, 10) || 0), reel: Math.max(0, parseInt(opts.reel, 10) || 0) };
    const precio = Math.max(0, parseInt(opts.precio, 10) || 0);
    const nombre = (opts.nombre || '').trim() || 'Plan a medida';
    const recurrente = opts.recurrente !== false;
    const labels = { carrusel: 'Carrusel', estatica: 'Estática', reel: 'Reel' };
    const plural = { carrusel: 'Carruseles', estatica: 'Estáticas', reel: 'Reels' };
    const detalle = Object.keys(counts).filter(k => counts[k]).map(k => `${counts[k]} ${counts[k] > 1 ? plural[k] : labels[k]}`).join(' · ') || 'Sin contenidos';
    const item = { id: uid('SV'), servicioId: 'custom', nombre, cat: 'Gestión de Redes', precio, recurrente, desde: nowISO(), custom: true, detalle };
    c.servicios.push(item);
    Object.keys(counts).forEach(tipo => {
      for (let i = 1; i <= counts[tipo]; i++) c.contenidos.push({ id: uid('CT'), tipo: labels[tipo], titulo: `${labels[tipo]} ${i}`, estado: 'Pendiente', fechaPub: '', servicioItem: item.id });
    });
    c.facturacion.push({ id: uid('FC'), concepto: nombre, monto: precio, fecha: nowISO(), observaciones: '', origenServicio: item.id });
    c.historial.unshift({ tipo: 'Servicio', texto: `Contrató: ${nombre} — ${detalle} ($${precio.toLocaleString('es-AR')})`, fecha: nowISO() });
    save(); Cloud.push('clientes', c);
    return item;
  }
  function quitarServicioCliente(clienteId, itemId) {
    const c = getCliente(clienteId);
    if (!c) return;
    c.servicios = c.servicios.filter(s => s.id !== itemId);
    c.contenidos = c.contenidos.filter(ct => ct.servicioItem !== itemId);
    save(); Cloud.push('clientes', c);
  }
  function actualizarContenido(clienteId, contId, cambios) {
    const c = getCliente(clienteId);
    if (!c) return;
    const ct = c.contenidos.find(x => x.id === contId);
    if (ct) { Object.assign(ct, cambios); save(); Cloud.push('clientes', c); }
  }
  function agregarContenido(clienteId, d) {
    const c = getCliente(clienteId);
    if (!c) return;
    c.contenidos.push(Object.assign({ id: uid('CT'), tipo: 'Carrusel', titulo: '', estado: 'Pendiente', fechaPub: '' }, d));
    save(); Cloud.push('clientes', c);
  }
  /* ----- Facturación (conceptos facturados) ----- */
  function agregarFactura(clienteId, d) {
    const c = getCliente(clienteId);
    if (!c) return;
    const f = Object.assign({ id: uid('FC'), concepto: '', monto: 0, fecha: nowISO(), observaciones: '' }, d);
    f.monto = Math.round(+f.monto || 0);
    c.facturacion.push(f);
    save(); Cloud.push('clientes', c);
    return f;
  }
  function actualizarFactura(clienteId, fcId, cambios) {
    const c = getCliente(clienteId);
    if (!c) return;
    const f = c.facturacion.find(x => x.id === fcId);
    if (!f) return;
    if (cambios.monto != null) cambios.monto = Math.round(+cambios.monto || 0);
    Object.assign(f, cambios);
    save(); Cloud.push('clientes', c);
    return f;
  }
  function eliminarFactura(clienteId, fcId) {
    const c = getCliente(clienteId);
    if (!c) return;
    c.facturacion = c.facturacion.filter(f => f.id !== fcId);
    // los pagos vinculados a esa factura quedan como pagos generales
    (c.pagos || []).forEach(p => { if (p.facturaId === fcId) p.facturaId = ''; });
    save(); Cloud.push('clientes', c);
  }
  function duplicarFactura(clienteId, fcId) {
    const c = getCliente(clienteId);
    if (!c) return;
    const f = c.facturacion.find(x => x.id === fcId);
    if (!f) return;
    const copia = Object.assign({}, f, { id: uid('FC'), fecha: nowISO(), origenServicio: undefined });
    c.facturacion.push(copia);
    save(); Cloud.push('clientes', c);
    return copia;
  }

  /* ----- Pagos recibidos ----- */
  function registrarPago(clienteId, d) {
    const c = getCliente(clienteId);
    if (!c) return;
    if (!c.pagos) c.pagos = [];
    const p = Object.assign({ id: uid('PG'), monto: 0, fecha: nowISO(), metodo: 'Transferencia', observaciones: '', facturaId: '' }, d);
    p.monto = Math.round(+p.monto || 0);
    c.pagos.unshift(p);
    c.historial.unshift({ tipo: 'Pago', texto: `Pago recibido: $${p.monto.toLocaleString('es-AR')} (${p.metodo})`, fecha: nowISO() });
    save(); Cloud.push('clientes', c);
    return p;
  }
  function actualizarPago(clienteId, pagoId, cambios) {
    const c = getCliente(clienteId);
    if (!c || !c.pagos) return;
    const p = c.pagos.find(x => x.id === pagoId);
    if (!p) return;
    if (cambios.monto != null) cambios.monto = Math.round(+cambios.monto || 0);
    Object.assign(p, cambios);
    save(); Cloud.push('clientes', c);
    return p;
  }
  function eliminarPago(clienteId, pagoId) {
    const c = getCliente(clienteId);
    if (!c || !c.pagos) return;
    c.pagos = c.pagos.filter(p => p.id !== pagoId);
    save(); Cloud.push('clientes', c);
  }

  // Resumen financiero de un cliente (fuente única de la verdad)
  function finanzasCliente(c) {
    if (!c) return { facturado: 0, cobrado: 0, saldo: 0, estado: 'Al día', color: '#3ecf8e' };
    const facturado = (c.facturacion || []).reduce((a, f) => a + (Math.round(+f.monto) || 0), 0);
    const cobrado = (c.pagos || []).reduce((a, p) => a + (Math.round(+p.monto) || 0), 0);
    const saldo = facturado - cobrado;
    let estado = 'Al día', color = '#3ecf8e';
    if (saldo > 0) {
      // Antigüedad de la factura más vieja (para detectar deuda vencida)
      const fechas = (c.facturacion || []).map(f => f.fecha).filter(Boolean).sort();
      let antig = null;
      if (fechas.length) antig = Math.round((Date.now() - new Date(fechas[0]).getTime()) / 86400000);
      if (antig != null && antig > 30) { estado = 'Vencido'; color = '#ff5d6c'; }
      else if (cobrado > 0) { estado = 'Pago parcial'; color = '#f5c451'; }
      else { estado = 'Pendiente'; color = '#f59e42'; }
    }
    return { facturado, cobrado, saldo, estado, color };
  }
  function agregarHistorialCliente(id, tipo, texto) {
    const c = getCliente(id);
    if (!c) return;
    c.historial.unshift({ tipo, texto, fecha: nowISO() });
    save(); Cloud.push('clientes', c);
  }

  /* ============================================================
     TAREAS
     ============================================================ */
  function getTareas() { return load().tareas; }
  function crearTarea(d) {
    const t = Object.assign({ id: uid('TK'), fechaCreacion: nowISO(), titulo: '', responsable: '', fecha: '', prioridad: 'Media', observaciones: '', estado: 'Pendiente', vinculoTipo: '', vinculoId: '' }, d);
    load().tareas.unshift(t);
    save(); Cloud.push('tareas', t);
    return t;
  }
  function actualizarTarea(id, cambios) {
    const t = load().tareas.find(x => x.id === id);
    if (t) { Object.assign(t, cambios); save(); Cloud.push('tareas', t); }
    return t;
  }
  function eliminarTarea(id) {
    cache.tareas = cache.tareas.filter(t => t.id !== id);
    save(); Cloud.remove('tareas', id);
  }

  /* ============================================================
     EXPORT / IMPORT / RESET
     ============================================================ */
  function exportar() { return JSON.stringify(load(), null, 2); }
  function importar(json) {
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object') throw new Error('Archivo inválido');
    cache = Object.assign(defaultData(), data);
    save();
    // Si hay nube, empujar todo lo importado
    if (Cloud.enabled) TABLES.forEach(t => (cache[t] || []).forEach(o => Cloud.push(t, o)));
  }
  function reset() { cache = defaultData(); save(); }

  /* ---------- Datos de ejemplo (solo modo local) ---------- */
  function seedIfEmpty() {
    const d = load();
    if (d._seeded || d.prospectos.length || d.clientes.length) return;
    d._seeded = true;
    [
      { nombre: 'Juan Pérez', empresa: 'Inmobiliaria Pérez', rubro: 'Inmobiliaria', ciudad: 'Morón', provincia: 'Buenos Aires', metodoContacto: 'Cold Call', estado: 'Interesado', telefono: '11-5555-1234', observaciones: 'Interesado en una página web. Recontactar el viernes.', proximaAccion: 'Llamar para presentar propuesta web', responsable: 'Mateo' },
      { nombre: 'Estudio Contable ABC', empresa: 'Estudio ABC', rubro: 'Contadores', ciudad: 'Castelar', provincia: 'Buenos Aires', metodoContacto: 'WhatsApp', estado: 'Recontactar', observaciones: 'WhatsApp enviado, no respondió. Recontactar en 7 días.', proximaAccion: 'Reenviar WhatsApp', responsable: 'Mateo' },
      { nombre: 'Dra. López', empresa: 'Estudio Jurídico López', rubro: 'Abogados', ciudad: 'Ituzaingó', provincia: 'Buenos Aires', metodoContacto: 'Instagram', estado: 'Contactado', instagram: '@estudiolopez', responsable: 'Mateo' },
    ].forEach(crearProspecto);
    const c = crearCliente({ nombre: 'Carlos Gómez', empresa: 'Gimnasio FitZone', rubro: 'Gimnasio', ciudad: 'Morón', provincia: 'Buenos Aires', whatsapp: '11-4444-9999', instagram: '@fitzone', responsable: 'Mateo' });
    agregarServicioCliente(c.id, 'rs-basico');
    crearTarea({ titulo: 'Llamar a Inmobiliaria Pérez', responsable: 'Mateo', prioridad: 'Alta', observaciones: 'Presentar propuesta de página web', estado: 'Pendiente' });
  }

  /* ---------- API pública ---------- */
  window.DB = {
    METODOS_CONTACTO, ESTADOS_LEAD, ESTADOS_CONTENIDO, ESTADOS_TAREA, PRIORIDADES, SERVICIOS,
    estadoColor: (id) => (ESTADOS_LEAD.find(e => e.id === id) || {}).color || '#8b94a8',
    getProspectos, getProspecto, crearProspecto, actualizarProspecto, eliminarProspecto, agregarHistorial, convertirEnCliente,
    getClientes, getCliente, crearCliente, actualizarCliente, eliminarCliente,
    agregarServicioCliente, agregarServicioPersonalizado, quitarServicioCliente, actualizarContenido, agregarContenido,
    agregarFactura, actualizarFactura, eliminarFactura, duplicarFactura,
    registrarPago, actualizarPago, eliminarPago, finanzasCliente,
    agregarHistorialCliente,
    getTareas, crearTarea, actualizarTarea, eliminarTarea,
    exportar, importar, reset, seedIfEmpty, nowISO,
    init, get cloudEnabled() { return Cloud.enabled; }, onRemoteChange: null,
  };
})();
