/* ============================================================
   TNR · Capa de datos
   - Modo NUBE (Supabase): datos compartidos en tiempo real.
   - Modo LOCAL (sin claves / sin internet): localStorage.
   localStorage funciona siempre como respaldo offline.
   ============================================================ */
(function () {
  'use strict';

  const KEY = 'tnr_crm_v1';
  const TABLES = ['prospectos', 'clientes', 'tareas', 'eventos', 'metas', 'proyectos', 'rutinas', 'ajustes']; // colecciones en la nube

  /* ---------- Catálogos ---------- */
  // Sólo los canales que se trabajan desde ESTE CRM. Las llamadas en frío van al CRM de vendedores.
  const METODOS_CONTACTO = ['Mail', 'Wsp', 'IG'];

  // Las dos líneas de prospección que trabajamos hoy. El resto de la base queda sin tipo.
  const TIPO_FERRETERIA = 'Ferreterías';
  const TIPO_PAUTA = 'Empresas para pauta MF';
  const TIPOS_PROSPECTO = [TIPO_FERRETERIA, TIPO_PAUTA];

  // Subgrupos del canal ferretero. Comparten la misma recorrida a pie pero se le
  // vende distinto: la pinturería vive del color y la foto, el corralón del precio y el stock.
  const SUBTIPOS = ['Ferretería', 'Bulonería', 'Pinturería', 'Sanitarios', 'Corralón / materiales', 'Electricidad'];

  // Clasifica por el nombre del negocio y su rubro. El orden importa: lo más
  // específico primero, porque "Ferretería y Sanitarios" tiene que caer en Sanitarios.
  function subtipoDe(nombre, rubro) {
    const t = (String(nombre || '') + ' ' + String(rubro || ''))
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/pinturer|pintura|color|latex|esmalte/.test(t)) return 'Pinturería';
    if (/buloner|bulon|tornill|fijacion/.test(t)) return 'Bulonería';
    if (/sanitari|griferia|plomeri|baño/.test(t)) return 'Sanitarios';
    if (/corralon|materiales|construccion|calera|cemento|maderer/.test(t)) return 'Corralón / materiales';
    if (/electric|iluminacion|cable/.test(t)) return 'Electricidad';
    return 'Ferretería';
  }

  // Los estados "Contactado por ..." dicen por QUÉ CANAL ya se tocó al prospecto.
  // Se setean solos al abrir WhatsApp/Email/Instagram desde "Generar mensaje" (ver marcarContacto en app.js)
  // y se combinan: si ya estaba contactado por Mail y se abre WhatsApp, pasa a "Contactado por Mail + WhatsApp".
  const ESTADOS_LEAD = [
    { id: 'Prospecto',                color: '#8b94a8' },
    { id: 'Contactado por mail',      color: '#1C9FE2' },
    { id: 'Contactado por wsp',       color: '#25D366' },
    { id: 'Contactado por ig',        color: '#c13584' },
    { id: 'Contactado por mail+wsp',  color: '#0e7fb8' },
    { id: 'Demo agendada',            color: '#7c5cff' },
    { id: 'Demo enviada',             color: '#f59e42' },
    { id: 'Seguimiento',              color: '#3fb5ee' },
    { id: 'No funcionó',              color: '#ff5d6c' },
  ];

  // Estados de tandas viejas -> estado equivalente del catálogo nuevo.
  // "No funcionó" es sólo para problemas reales de contacto, no para "todavía no respondió".
  const ESTADOS_LEGACY = {
    'Contactado': 'Contactado por mail',
    'Contactado por Mail': 'Contactado por mail',
    'Contactado por WhatsApp': 'Contactado por wsp',
    'Contactado por Instagram': 'Contactado por ig',
    'Contactado por Mail + WhatsApp': 'Contactado por mail+wsp',
    'Respondió': 'Seguimiento',
    'Interesado': 'Seguimiento',
    'En Negociación': 'Seguimiento',
    'Recontactar': 'Seguimiento',
    'Ganado': 'Seguimiento',
    'Reunión Agendada': 'Demo agendada',
    'Propuesta Enviada': 'Demo enviada',
    'Demo Enviada': 'Demo enviada',
    'Perdido': 'No funcionó',
  };

  // Canales por los que ya se contactó a un prospecto (se guardan en p.canalesContacto).
  const CANALES_CONTACTO = ['Mail', 'WhatsApp', 'Instagram'];

  const ESTADOS_CONTENIDO = ['Pendiente', 'En Diseño', 'En Revisión', 'Esperando Cliente', 'Aprobado', 'Programado', 'Publicado'];
  const ESTADOS_TAREA = ['Pendiente', 'En Curso', 'Finalizada'];
  // Descartar no es lo mismo que borrar. Una tarea de rutina no se puede
  // borrar de verdad: el motor la volvería a fabricar mañana, porque rellena
  // los últimos 7 días. Marcarla DESCARTADA es lo que la saca de la vista y
  // de los números, y a la vez deja la constancia de que ese día existió.
  // O sea: la fila que queda ES lo que impide que reaparezca.
  const ESTADO_DESCARTADA = 'Descartada';

  /* ============================================================
     SISTEMA OPERATIVO — los tres sistemas de trabajo de TNR
     ------------------------------------------------------------
     Todo lo que se hace en TNR entra en uno de estos tres cajones.
     Nada de listas mezcladas: cada tarea y cada proyecto declara a
     cuál pertenece, y las pantallas filtran por acá.
     ============================================================ */
  const SISTEMAS = [
    { id: 'prospeccion',  label: 'Prospección',  corto: 'Prospección', color: '#1C9FE2',
      desc: 'Conseguir clientes nuevos. Es lo que hizo crecer agosto.' },
    { id: 'gestion',      label: 'Gestión de servicios', corto: 'Gestión', color: '#7c5cff',
      desc: 'Ejecutar lo que ya vendimos: clientes y entregas.' },
    { id: 'optimizacion', label: 'Optimización',  corto: 'Optimización', color: '#3ecf8e',
      desc: 'Mejorar la propia empresa: automatizaciones, casos, capacitación.' },
    // La vida de uno. `privado` significa que sólo la ve su dueño, y `fueraDeTNR`
    // que no entra en el porcentaje de la agencia: si diera lo mismo darle de
    // comer al perro que mandar 15 mails, el número de cumplimiento comercial
    // dejaría de decir nada.
    { id: 'personal',     label: 'Personal',      corto: 'Personal', color: '#f472b6',
      desc: 'Hábitos, entrenamiento y vida fuera del trabajo.', privado: true, fueraDeTNR: true },
  ];
  const sistemaDe = (id) => SISTEMAS.find(s => s.id === id) || { id: '', label: 'Sin sistema', corto: '—', color: '#8b94a8' };

  // Las personas del equipo. `equipo` = tarea compartida: la hace cualquiera de los dos.
  const RESPONSABLES = [
    { id: 'mateo',    nombre: 'Mateo De Rosa',   corto: 'Mateo' },
    { id: 'santiago', nombre: 'Santiago Stalla', corto: 'Santiago' },
  ];
  const RESP_EQUIPO = { id: 'equipo', nombre: 'Los dos (compartida)', corto: 'Equipo' };
  const responsableDe = (id) => RESPONSABLES.find(r => r.id === id) || (id === 'equipo' ? RESP_EQUIPO : { id: id || '', nombre: id || 'Sin asignar', corto: id || '—' });

  // Prioridad de TAREAS. Ojo: PRIORIDADES (A/B/C) es otra cosa — es la
  // prioridad geográfica de los prospectos. No mezclar.
  const PRIORIDADES_TAREA = ['Alta', 'Media', 'Baja'];
  const PRIO_TAREA_COLOR = { 'Alta': '#ff5d6c', 'Media': '#f5c451', 'Baja': '#8b94a8' };
  // Tareas viejas: usaban el catálogo A/B/C por error. Se traducen al abrir.
  const PRIO_TAREA_LEGACY = { 'A': 'Alta', 'B': 'Media', 'C': 'Baja', 'Urgente': 'Alta' };

  // Unidades de las tareas que se cuentan (no basta con "hecha": queremos volumen).
  const UNIDADES = [
    { id: '',          label: 'Sin contador', corto: '' },
    { id: 'mensajes',  label: 'Mensajes',     corto: 'msj' },
    { id: 'mails',     label: 'Mails',        corto: 'mails' },
    { id: 'contactos', label: 'Contactos',    corto: 'contactos' },
    { id: 'llamadas',  label: 'Llamadas',     corto: 'llamadas' },
    { id: 'minutos',   label: 'Minutos',      corto: 'min' },
    { id: 'horas',     label: 'Horas',        corto: 'h' },
    { id: 'piezas',    label: 'Piezas de contenido', corto: 'piezas' },
    { id: 'vasos',     label: 'Vasos de agua', corto: 'vasos' },
  ];
  const unidadCorta = (id) => (UNIDADES.find(u => u.id === id) || {}).corto || '';

  const TURNOS = ['', 'Mañana', 'Tarde'];
  const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  // Atajos de recurrencia usados al crear rutinas.
  const RECURRENCIAS = [
    { id: 'lun-sab',  label: 'Lunes a sábado', dias: [1, 2, 3, 4, 5, 6] },
    { id: 'lun-vie',  label: 'Lunes a viernes', dias: [1, 2, 3, 4, 5] },
    { id: 'todos',    label: 'Todos los días',  dias: [0, 1, 2, 3, 4, 5, 6] },
    { id: 'semanal',  label: 'Una vez por semana', dias: [1] },
    { id: 'custom',   label: 'Días elegidos',   dias: [] },
  ];

  /* ---------- Agenda semanal ----------
     Un "bloque" NO es una tarea: es una franja fija del día (el colegio, el
     entrenamiento, el club). No se marca ni se cumple — uno va igual. Sirve
     para ver dónde entra el resto y para saber qué toca ahora.
     Se guardan dentro de `ajustes` de cada persona: son configuración suya,
     no hace falta una tabla nueva. */
  const TIPOS_BLOQUE = [
    { id: 'colegio',       label: 'Colegio',        color: '#5b8cff' },
    { id: 'tnr',           label: 'TNR (trabajo)',  color: '#1C9FE2' },
    { id: 'entrenamiento', label: 'Entrenamiento',  color: '#3ecf8e' },
    { id: 'club',          label: 'Club / partido', color: '#7c5cff' },
    { id: 'comida',        label: 'Comida',         color: '#f59e42' },
    { id: 'personal',      label: 'Personal',       color: '#f472b6' },
    { id: 'libre',         label: 'Libre',          color: '#8b94a8' },
  ];
  const tipoBloque = (id) => TIPOS_BLOQUE.find(t => t.id === id) || { id: '', label: 'Otro', color: '#8b94a8' };

  const ESTADOS_PROYECTO = ['Activo', 'En pausa', 'Terminado'];
  // Prioridad geográfica: A = pegado a la base (Coronel Quesada 1218, Ituzaingó),
  // B = distancia razonable para visitar, C = más lejos pero todavía tiene sentido recorrer.
  const PRIORIDADES = ['A', 'B', 'C'];
  const PRIORIDADES_LEGACY = { 'Urgente': 'A', 'Alta': 'A', 'Media': 'B', 'Baja': 'C' };

  // Segmentos / campañas especiales. Permiten agrupar prospectos de un proyecto puntual.
  const SEG_MF = 'Mundo Ferretero';
  const SEGMENTOS = [
    `${SEG_MF} · Ferreterías para visitar`,
    `${SEG_MF} · Empresas para pauta`,
  ];

  // Cómo vamos a atacar al prospecto. VISITA y WHATSAPP son para ferreterías;
  // PAUTA es para las empresas a las que les vendemos espacio en la revista.
  const CANALES = [
    { id: 'VISITA',   color: '#3ecf8e' },
    { id: 'WHATSAPP', color: '#25d366' },
    { id: 'PAUTA',    color: '#f59e42' },
  ];

  // Servicio Principal del prospecto (qué le queremos vender). Un prospecto puede tener uno o varios.
  const SERVICIOS_PRINCIPAL = [
    'Página Web', 'Landing Page', 'Gestión de Redes', 'CRM', 'SaaS', 'Aplicación Web',
    'Automatización con IA', 'Chatbot IA', 'Branding', 'Publicidad Digital', 'SEO', 'Múltiples servicios',
  ];

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

  function defaultData() { return { prospectos: [], clientes: [], tareas: [], eventos: [], metas: [], proyectos: [], rutinas: [], ajustes: [], tiempos: [], _seeded: false }; }

  // Categorías de eventos del calendario (con color)
  const CATEGORIAS_EVENTO = [
    { id: 'reunion', label: 'Reunión', color: '#7c5cff' },
    { id: 'llamada', label: 'Llamada', color: '#1C9FE2' },
    { id: 'seguimiento', label: 'Seguimiento', color: '#f5c451' },
    { id: 'recordatorio', label: 'Recordatorio', color: '#f59e42' },
    { id: 'vencimiento', label: 'Vencimiento', color: '#ff5d6c' },
    { id: 'cliente', label: 'Cliente', color: '#3ecf8e' },
    { id: 'produccion', label: 'Producción', color: '#f472b6' },
    { id: 'admin', label: 'Administración', color: '#8b94a8' },
  ];
  const CATEGORIAS_TIEMPO = ['Ventas', 'Diseño', 'Desarrollo', 'Reuniones', 'Prospección', 'Administración'];
  const METRICAS_META = [
    { id: 'leads', label: 'Leads' },
    { id: 'ventas', label: 'Ventas' },
    { id: 'clientes', label: 'Clientes nuevos' },
    { id: 'facturacion', label: 'Facturación', money: true },
    { id: 'reuniones', label: 'Reuniones' },
    { id: 'llamadas', label: 'Llamadas' },
  ];

  /* ---------- Almacenamiento local ---------- */
  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      const raw = localStorage.getItem(KEY);
      cache = raw ? JSON.parse(raw) : defaultData();
    } catch (e) { console.error('No se pudo leer el almacenamiento', e); cache = defaultData(); }
    TABLES.forEach(t => { if (!cache[t]) cache[t] = []; });
    if (!cache.tiempos) cache.tiempos = []; // local, no se sincroniza
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
    faltantes: [], // tablas que Supabase todavía no tiene (falta correr el SQL)
    init() {
      try {
        // Se reusa el cliente que ya creó auth.js: es el que lleva la sesión
        // del usuario. Si se creara otro acá, las consultas viajarían sin
        // firmar y dejarían de funcionar el día que se cierre la base.
        if (window.Auth && window.Auth.client) {
          this.client = window.Auth.client;
          this.enabled = true;
        } else if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient) {
          this.client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
            realtime: { params: { eventsPerSecond: 5 } },
          });
          this.enabled = true;
        }
      } catch (e) { console.error('Supabase init', e); this.enabled = false; }
      return this.enabled;
    },
    async pullAll() {
      // Resiliente por tabla: si una tabla nueva todavía no existe en Supabase,
      // se omite sin romper la sincronización del resto.
      // OJO: Supabase corta en 1000 filas por consulta. Sin paginar, al pasar los
      // 1000 prospectos la app dejaba de ver los últimos SIN avisar. Por eso se
      // trae de a 1000 con .range() hasta que la página vuelve incompleta.
      const PAGE = 1000;
      for (const t of TABLES) {
        try {
          const filas = [];
          for (let desde = 0; ; desde += PAGE) {
            const { data, error } = await this.client.from(t)
              .select('id,data')
              .order('updated_at', { ascending: false })
              .range(desde, desde + PAGE - 1);
            if (error) throw error;
            filas.push(...(data || []));
            if (!data || data.length < PAGE) break;
          }
          cache[t] = filas.map(r => r.data);
          this.faltantes = this.faltantes.filter(x => x !== t);
        } catch (e) {
          // Una tabla que todavía no existe en Supabase no rompe nada, pero sí
          // hace que esos datos queden sólo en este dispositivo. Lo anotamos
          // para poder avisarlo en pantalla en vez de que pase desapercibido.
          if (!this.faltantes.includes(t)) this.faltantes.push(t);
          console.warn('Tabla no disponible aún: ' + t + ' (¿falta correr el SQL?)', e && e.message);
        }
      }
    },
    // Devuelve la promesa para que quien haga escrituras masivas pueda esperarlas de a tandas.
    push(table, obj) {
      if (!this.enabled) return Promise.resolve();
      return this.client.from(table)
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

  /* ---------- Clasificación automática de Servicio Principal + Prioridad ----------
     Deriva qué servicio venderle a cada prospecto según su rubro, y rescata las
     pistas ya escritas a mano en observaciones / próxima acción / análisis (score).
     No pisa valores cargados manualmente: solo completa lo que falta, una vez. */
  function serviciosPorRubro(rubro) {
    const r = (rubro || '').toLowerCase();
    const has = (...k) => k.some(x => r.includes(x));
    if (has('padel', 'pádel', 'paddle')) return ['SaaS', 'Gestión de Redes', 'Página Web'];
    if (has('futbol', 'fútbol', 'cancha')) return ['CRM', 'Gestión de Redes', 'Página Web'];
    if (has('gimnas', 'fitness', 'crossfit', 'entrenamiento', 'pilates', 'danza', 'deportiv')) return ['Gestión de Redes', 'CRM', 'Página Web'];
    if (has('helader', 'pizzer', 'hamburgues', 'parrilla', 'cafeter', 'sushi', 'panader', 'pasteler', 'restaurant', 'gastro', 'saludable')) return ['Gestión de Redes', 'Página Web', 'Publicidad Digital'];
    if (has('barber', 'peluquer', 'estetic', 'estétic', 'spa', 'depilac', 'lash', 'uñas', 'canina')) return ['Gestión de Redes', 'Landing Page'];
    if (has('odonto', 'dental', 'kinesi', 'nutri', 'psicolog', 'veterinar', 'optic', 'óptic', 'medic', 'clinic', 'salud')) return ['Página Web', 'Gestión de Redes', 'Automatización con IA'];
    if (has('electric', 'plomer', 'gasist', 'cerrajer', 'pintor', 'chapa', 'mecanic', 'mecánic', 'taller', 'gomer', 'lubricentro', 'moto')) return ['Landing Page', 'Publicidad Digital', 'Gestión de Redes'];
    if (has('contable', 'contador', 'juridic', 'jurídic', 'abogad', 'escriban')) return ['Página Web', 'Gestión de Redes'];
    if (has('inmobiliar')) return ['CRM', 'Gestión de Redes', 'Página Web'];
    if (has('evento', 'salon', 'salón', 'infantil')) return ['CRM', 'Página Web', 'Gestión de Redes'];
    if (has('mueble', 'colchon', 'iluminac', 'ferreter', 'biciclet', 'vivero', 'deporte', 'comput', 'tecnolog', 'indument')) return ['Página Web', 'Gestión de Redes', 'Publicidad Digital'];
    if (has('ingles', 'inglés', 'musica', 'música', 'manejo', 'autoescuela', 'academ', 'institut', 'educ', 'jardin', 'jardín')) return ['Página Web', 'Gestión de Redes', 'CRM'];
    if (has('mudanza', 'flete', 'carpinter', 'construct', 'camara', 'cámara', 'seguridad')) return ['Landing Page', 'Página Web', 'Publicidad Digital'];
    return ['Gestión de Redes', 'Página Web'];
  }
  function serviciosDesdeTexto(txt) {
    const t = (txt || '').toLowerCase(); const out = [];
    const add = s => { if (!out.includes(s)) out.push(s); };
    if (/padela|\bsaas\b|sistema de reserva|sistema de turno/.test(t)) add('SaaS');
    if (/gesti[oó]n de redes|\bredes\b|instagram|contenido/.test(t)) add('Gestión de Redes');
    if (/landing/.test(t)) add('Landing Page');
    if (/p[aá]gina web|web propia|web nueva|web premium|sitio web|ecommerce|e-commerce|tienda online|cat[aá]logo online|web de pedidos|carrito/.test(t)) add('Página Web');
    if (/\bcrm\b/.test(t)) add('CRM');
    if (/automatiz|recordatori|whatsapp bot|bot de|whatsapp autom/.test(t)) add('Automatización con IA');
    if (/chatbot/.test(t)) add('Chatbot IA');
    if (/branding|identidad visual/.test(t)) add('Branding');
    if (/\bads\b|publicidad|google ads|meta ads|pauta/.test(t)) add('Publicidad Digital');
    if (/\bseo\b/.test(t)) add('SEO');
    if (/aplicaci[oó]n|\bapp\b/.test(t)) add('Aplicación Web');
    return out;
  }
  function clasificarServicios(p) {
    const texto = serviciosDesdeTexto((p.observaciones || '') + ' ' + (p.proximaAccion || ''));
    const merged = [...texto];
    serviciosPorRubro(p.rubro).forEach(s => { if (!merged.includes(s)) merged.push(s); });
    return merged.slice(0, 3);
  }
  function prioridadDe(p) {
    const t = ((p.observaciones || '') + ' ' + (p.proximaAccion || '')).toLowerCase();
    if (/prioridad[:\s]*urgente|\burgente\b/.test(t)) return 'Urgente';
    if (/oportunidad[:\s]*alta|prioridad[:\s]*alta|media-alta|medio-alta/.test(t)) return 'Alta';
    if (/oportunidad[:\s]*baja|prioridad[:\s]*baja|media-baja/.test(t)) return 'Baja';
    if (/oportunidad[:\s]*media|prioridad[:\s]*media/.test(t)) return 'Media';
    const s = (p.analisis && p.analisis.score) || 0;
    if (s >= 82) return 'Alta'; if (s >= 72) return 'Media'; if (s > 0) return 'Baja';
    return 'Media';
  }
  // Completa servicios + prioridad en todos los prospectos que aún no fueron clasificados (una vez c/u).
  function migrarServicios() {
    let n = 0;
    (load().prospectos || []).forEach(p => {
      if (p._svcInit) return;
      if (!Array.isArray(p.servicios) || !p.servicios.length) p.servicios = clasificarServicios(p);
      if (!p.prioridad) p.prioridad = prioridadDe(p);
      p._svcInit = true; n++;
      Cloud.push('prospectos', p);
    });
    if (n) save();
    return n;
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
    migrarServicios(); // clasifica servicio principal + prioridad de prospectos aún sin clasificar
    migrarTareas();   // pasa las tareas viejas al modelo del sistema operativo
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
      nombre: '', empresa: '', rubro: '', direccion: '', ciudad: '', provincia: '', pais: 'Argentina',
      telefono: '', whatsapp: '', email: '', instagram: '', facebook: '', linkedin: '', sitioWeb: '',
      metodoContacto: '', estado: 'Prospecto', observaciones: '',
      tipo: '', subtipo: '', servicios: [], prioridad: '', segmento: '', mensaje: '',
      // Prospección de campo: cómo lo atacamos, cuánto vale y con qué frase entramos.
      canal: '', oportunidad: '', gancho: '',
      maps: '', horarios: '', puntuacion: '', reseñas: '',
      canalesContacto: [],
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
  // Deja registrado que ya se contactó al prospecto por ese canal y ajusta el estado
  // para que se vea de un vistazo por dónde se lo tocó. No pisa estados más avanzados.
  // Ojo: acá van los ids TAL CUAL están en ESTADOS_LEAD. Antes se escribían
  // las formas viejas ('Contactado por WhatsApp') y como no coinciden con el
  // catálogo, estadoColor() no las encontraba y el prospecto quedaba con el
  // chip gris hasta que corriera la migración.
  const ESTADO_POR_CANALES = {
    'Mail': 'Contactado por mail',
    'WhatsApp': 'Contactado por wsp',
    'Instagram': 'Contactado por ig',
    'Mail+WhatsApp': 'Contactado por mail+wsp',
  };
  // Estados desde los que todavía se puede avanzar a "contactado". Incluye las
  // formas viejas porque quedan prospectos sin migrar.
  const ESTADOS_PREVIOS = ['Prospecto', 'Contactado', 'Contactado por Mail', 'Contactado por WhatsApp',
    'Contactado por Instagram', 'Contactado por Mail + WhatsApp', 'Recontactar',
    'Contactado por mail', 'Contactado por wsp', 'Contactado por ig', 'Contactado por mail+wsp'];

  // Pasa la base al catálogo nuevo: tipo de prospecto, estados y prioridad A/B/C.
  // Corre una sola vez sobre cada prospecto y sólo toca lo que hace falta.
  async function migrarProspectos() {
    const d = load();
    const tocados = [];
    d.prospectos.forEach(p => {
      const cambios = {};
      if (!p.tipo) {
        const seg = String(p.segmento || '');
        if (seg.indexOf('pauta') >= 0 || p.canal === 'PAUTA') cambios.tipo = TIPO_PAUTA;
        else if (seg.indexOf('Ferreterías') >= 0) cambios.tipo = TIPO_FERRETERIA;
        else if (/ferreter|buloner|corral[oó]n/i.test(String(p.rubro || ''))) cambios.tipo = TIPO_FERRETERIA;
      }
      const tipoFinal = cambios.tipo || p.tipo;
      if (tipoFinal === TIPO_FERRETERIA && !p.subtipo) cambios.subtipo = subtipoDe(p.empresa || p.nombre, p.rubro);
      if (p.estado && ESTADOS_LEGACY[p.estado]) cambios.estado = ESTADOS_LEGACY[p.estado];
      if (p.prioridad && PRIORIDADES_LEGACY[p.prioridad]) cambios.prioridad = PRIORIDADES_LEGACY[p.prioridad];
      const met = String(p.metodoContacto || '');
      if (met && METODOS_CONTACTO.indexOf(met) < 0) {
        if (/mail|email/i.test(met)) cambios.metodoContacto = 'Mail';
        else if (/whatsapp|wsp/i.test(met)) cambios.metodoContacto = 'Wsp';
        else if (/instagram|ig/i.test(met)) cambios.metodoContacto = 'IG';
        else cambios.metodoContacto = ''; // Cold Call y demás ya no se usan acá
      }
      if (Object.keys(cambios).length) { Object.assign(p, cambios); tocados.push(p); }
    });
    if (!tocados.length) return 0;
    save();
    // De a tandas chicas y esperando cada una: cientos de push simultáneos tumban
    // la conexión con ERR_INSUFFICIENT_RESOURCES y la migración queda sólo en local.
    for (let i = 0; i < tocados.length; i += 5) {
      await Promise.allSettled(tocados.slice(i, i + 5).map(p => Cloud.push('prospectos', p)));
      await new Promise(r => setTimeout(r, 120));
    }
    return tocados.length;
  }

  // Reempuja toda la colección a la nube de a tandas. Sirve para recuperar
  // el estado local cuando una escritura masiva falló a mitad de camino.
  async function sincronizarTodo(tabla, onProgreso) {
    const t = tabla || 'prospectos';
    const filas = load()[t] || [];
    let ok = 0, fallas = 0;
    // Tandas chicas con respiro: el navegador corta las conexiones (ERR_INSUFFICIENT_RESOURCES)
    // si se le encolan cientos de upserts seguidos.
    for (let i = 0; i < filas.length; i += 5) {
      const res = await Promise.allSettled(filas.slice(i, i + 5).map(r => Cloud.push(t, r)));
      res.forEach(r => { if (r.status === 'fulfilled') ok++; else fallas++; });
      if (onProgreso) onProgreso(ok, fallas, filas.length);
      await new Promise(r => setTimeout(r, 120));
    }
    return { ok, fallas, total: filas.length };
  }

  function registrarContacto(id, canal) {
    const p = getProspecto(id);
    if (!p) return null;
    const canales = Array.isArray(p.canalesContacto) ? p.canalesContacto.slice() : [];
    if (canales.indexOf(canal) < 0) canales.push(canal);
    const cambios = { canalesContacto: canales, ultimoContacto: nowISO() };
    // Sólo avanzamos el estado si todavía está en la etapa de contacto inicial.
    if (ESTADOS_PREVIOS.indexOf(p.estado) >= 0) {
      const tieneMail = canales.indexOf('Mail') >= 0;
      const tieneWA = canales.indexOf('WhatsApp') >= 0;
      const key = (tieneMail && tieneWA) ? 'Mail+WhatsApp' : (tieneMail ? 'Mail' : (tieneWA ? 'WhatsApp' : canal));
      cambios.estado = ESTADO_POR_CANALES[key] || 'Contactado';
    }
    p.historial.unshift({ tipo: 'Contacto', texto: `Contactado por ${canal}`, fecha: nowISO() });
    return actualizarProspecto(id, cambios);
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
  function tareaBase() {
    return {
      id: '', fechaCreacion: '', titulo: '', observaciones: '',
      responsable: 'equipo',      // 'mateo' | 'santiago' | 'equipo'
      sistema: '',                // 'prospeccion' | 'gestion' | 'optimizacion'
      proyectoId: '', rutinaId: '',
      fecha: '', turno: '',       // 'Mañana' | 'Tarde' | ''
      recordarHora: '',           // 'HH:MM' — avisame a esta hora ese día
      prioridad: 'Media', estado: 'Pendiente',
      objetivo: 0, avance: 0, unidad: '',   // contador de volumen (15 mails, 20 contactos…)
      vinculoTipo: '', vinculoId: '',
    };
  }
  function getTareas() { return load().tareas; }
  function getTarea(id) { return load().tareas.find(t => t.id === id); }
  function crearTarea(d) {
    const t = Object.assign(tareaBase(), { id: uid('TK'), fechaCreacion: nowISO() }, d);
    load().tareas.unshift(t);
    save(); Cloud.push('tareas', t);
    return t;
  }
  // Crea una tarea con un id que decidimos nosotros. Se usa para las instancias
  // de rutina (id = rutina + fecha + persona): si dos celulares abren la app al
  // mismo tiempo, los dos escriben la MISMA fila en vez de duplicar la tarea.
  function crearTareaConId(id, d) {
    if (getTarea(id)) return null;
    const t = Object.assign(tareaBase(), { id, fechaCreacion: nowISO() }, d);
    load().tareas.unshift(t);
    return t; // el push a la nube lo hace quien llama, en tanda
  }
  function actualizarTarea(id, cambios) {
    const t = load().tareas.find(x => x.id === id);
    if (t) {
      if (cambios.estado === 'Finalizada' && t.estado !== 'Finalizada') cambios.finalizadaEn = nowISO();
      if (cambios.estado && cambios.estado !== 'Finalizada') cambios.finalizadaEn = '';
      if (cambios.estado === ESTADO_DESCARTADA) cambios.descartadaEn = nowISO();
      else if (cambios.estado) cambios.descartadaEn = '';
      Object.assign(t, cambios); save(); Cloud.push('tareas', t);
    }
    return t;
  }
  function eliminarTarea(id) {
    cache.tareas = cache.tareas.filter(t => t.id !== id);
    save(); Cloud.remove('tareas', id);
  }

  // Suma (o resta) unidades a una tarea con contador. Al llegar al objetivo se
  // da por finalizada sola: la idea es marcar una vez, no dos.
  function sumarAvance(id, delta) {
    const t = getTarea(id);
    if (!t) return null;
    const objetivo = +t.objetivo || 0;
    const avance = Math.max(0, (+t.avance || 0) + delta);
    const cambios = { avance };
    if (objetivo > 0 && avance >= objetivo && t.estado !== 'Finalizada') cambios.estado = 'Finalizada';
    if (objetivo > 0 && avance < objetivo && t.estado === 'Finalizada') cambios.estado = 'En Curso';
    return actualizarTarea(id, cambios);
  }

  /* ---------- Migración de tareas al modelo nuevo (una vez por tarea) ----------
     Traduce lo que venía de antes sin perder nada:
       responsable "Mateo"  -> 'mateo'
       prioridad   "A/B/C"  -> Alta/Media/Baja
     y completa los campos nuevos con valores neutros. */
  function migrarTareas() {
    let n = 0;
    (load().tareas || []).forEach(t => {
      if (t._soInit) return;
      const base = tareaBase();
      Object.keys(base).forEach(k => { if (t[k] === undefined) t[k] = base[k]; });
      const r = String(t.responsable || '').trim().toLowerCase();
      if (r.startsWith('mateo')) t.responsable = 'mateo';
      else if (r.startsWith('santi')) t.responsable = 'santiago';
      else if (!r) t.responsable = 'equipo';
      if (PRIO_TAREA_LEGACY[t.prioridad]) t.prioridad = PRIO_TAREA_LEGACY[t.prioridad];
      if (!PRIORIDADES_TAREA.includes(t.prioridad)) t.prioridad = 'Media';
      t._soInit = true; n++;
      Cloud.push('tareas', t);
    });
    if (n) save();
    return n;
  }

  /* ============================================================
     PROYECTOS — los trabajos abiertos (clientes, web propia, marca personal…)
     ============================================================ */
  function getProyectos() { return load().proyectos || []; }
  function getProyecto(id) { return getProyectos().find(p => p.id === id); }
  function crearProyecto(d) {
    const p = Object.assign({
      id: uid('PR'), fechaCreacion: nowISO(), nombre: '', sistema: 'gestion',
      responsable: 'equipo', estado: 'Activo', objetivo: '', fechaObjetivo: '',
      clienteId: '', notas: '',
    }, d);
    load().proyectos.unshift(p);
    save(); Cloud.push('proyectos', p);
    return p;
  }
  function actualizarProyecto(id, cambios) {
    const p = getProyecto(id);
    if (p) { Object.assign(p, cambios); save(); Cloud.push('proyectos', p); }
    return p;
  }
  function eliminarProyecto(id) {
    cache.proyectos = (cache.proyectos || []).filter(p => p.id !== id);
    // Las tareas del proyecto NO se borran: quedan sueltas, no se pierde historial.
    (cache.tareas || []).forEach(t => { if (t.proyectoId === id) { t.proyectoId = ''; Cloud.push('tareas', t); } });
    save(); Cloud.remove('proyectos', id);
  }

  /* ============================================================
     AJUSTES por persona — a qué hora quiere que le avisen
     ------------------------------------------------------------
     Una fila por usuario (id = 'mateo', 'santiago'). Se guarda en la nube
     porque el aviso lo manda el servidor: si viviera en el celular, el
     recordatorio no llegaría con la app cerrada.
     ============================================================ */
  function ajustesBase(id) {
    return {
      id,
      avisos: true,          // interruptor general de los recordatorios
      manana: '09:00',       // "esto es lo que tenés hoy"
      tarde: '15:00',        // "te falta esto"
      cierre: '20:00',       // "marcá lo que hiciste"
      avisarTareas: true,    // recordatorios de tareas con hora propia
      agenda: [],            // bloques fijos de la semana (ver TIPOS_BLOQUE)
    };
  }
  function getAgenda(id) { return getAjustes(id).agenda || []; }
  function guardarAgenda(id, bloques) { return guardarAjustes(id, { agenda: bloques }); }
  function getAjustes(id) {
    const a = (load().ajustes || []).find(x => x.id === id);
    return Object.assign(ajustesBase(id), a || {});
  }
  function guardarAjustes(id, cambios) {
    let a = (load().ajustes || []).find(x => x.id === id);
    if (!a) { a = ajustesBase(id); load().ajustes.unshift(a); }
    Object.assign(a, cambios);
    save(); Cloud.push('ajustes', a);
    return a;
  }

  /* ============================================================
     RUTINAS — plantillas de las tareas que se repiten
     ------------------------------------------------------------
     Una rutina no es una tarea: es la REGLA que dice "esto va todos los
     días de lunes a sábado, lo hace Mateo, y son 15 mails". El sistema
     fabrica la tarea del día solo (ver sistema.js).
     ============================================================ */
  function getRutinas() { return load().rutinas || []; }
  function getRutina(id) { return getRutinas().find(r => r.id === id); }
  function crearRutina(d) {
    const r = Object.assign({
      id: uid('RU'), fechaCreacion: nowISO(), titulo: '', observaciones: '',
      sistema: 'prospeccion', proyectoId: '',
      responsable: 'ambos',     // 'mateo' | 'santiago' | 'ambos' | 'equipo'
      dias: [1, 2, 3, 4, 5, 6], // 0=domingo … 6=sábado
      turno: '', prioridad: 'Media', recordarHora: '',
      objetivo: 0, unidad: '',
      activa: true, desde: new Date().toISOString().slice(0, 10),
    }, d);
    load().rutinas.unshift(r);
    save(); Cloud.push('rutinas', r);
    return r;
  }
  function actualizarRutina(id, cambios) {
    const r = getRutina(id);
    if (r) { Object.assign(r, cambios); save(); Cloud.push('rutinas', r); }
    return r;
  }
  function eliminarRutina(id) {
    cache.rutinas = (cache.rutinas || []).filter(r => r.id !== id);
    // Las tareas ya generadas quedan: son el historial de cumplimiento.
    save(); Cloud.remove('rutinas', id);
  }

  /* ============================================================
     EVENTOS (Calendario)
     ============================================================ */
  function getEventos() { return load().eventos; }
  function getEvento(id) { return load().eventos.find(e => e.id === id); }
  function crearEvento(d) {
    const e = Object.assign({ id: uid('EV'), fechaCreacion: nowISO(), titulo: '', fecha: '', hora: '', tipo: 'reunion', notas: '', clienteId: '' }, d);
    load().eventos.unshift(e);
    save(); Cloud.push('eventos', e);
    return e;
  }
  function actualizarEvento(id, cambios) {
    const e = getEvento(id);
    if (e) { Object.assign(e, cambios); save(); Cloud.push('eventos', e); }
    return e;
  }
  function eliminarEvento(id) {
    cache.eventos = cache.eventos.filter(e => e.id !== id);
    save(); Cloud.remove('eventos', id);
  }

  /* ============================================================
     METAS (por mes 'YYYY-MM')
     ============================================================ */
  function getMeta(mesId) { return load().metas.find(m => m.id === mesId); }
  function guardarMeta(mesId, valores) {
    let m = getMeta(mesId);
    if (!m) { m = { id: mesId, leads: 0, ventas: 0, clientes: 0, facturacion: 0, reuniones: 0, llamadas: 0 }; load().metas.unshift(m); }
    Object.assign(m, valores);
    save(); Cloud.push('metas', m);
    return m;
  }

  /* ============================================================
     TIEMPOS (Cronómetro) — LOCAL por dispositivo
     ============================================================ */
  function getTiempos() { return load().tiempos; }
  function registrarTiempo(d) {
    const t = Object.assign({ id: uid('TM'), fecha: nowISO(), categoria: 'Ventas', segundos: 0 }, d);
    load().tiempos.unshift(t);
    save(); // sin Cloud: la productividad es personal
    return t;
  }
  function eliminarTiempo(id) {
    cache.tiempos = cache.tiempos.filter(t => t.id !== id);
    save();
  }

  // Guarda la suscripción de push del navegador en Supabase (tabla push_subs)
  async function guardarPushSub(sub) {
    if (!Cloud.enabled || !sub || !sub.endpoint) return false;
    try {
      const usuario = (window.Auth && Auth.usuarioId) || '';
      const { error } = await Cloud.client.from('push_subs')
        .upsert({ id: sub.endpoint, data: sub, usuario, updated_at: nowISO() });
      if (error) { console.error('push_subs', error.message); return false; }
      return true;
    } catch (e) { console.error('push_subs', e); return false; }
  }

  /* ============================================================
     EXPORT / IMPORT / RESET
     ============================================================ */
  function exportar() { return JSON.stringify(load(), null, 2); }

  /* Carga masiva NO destructiva: agrega prospectos sin pisar los existentes.
     Sirve para importar bases de prospección (ferreterías, empresas de pauta).
     Deduplica por empresa + ciudad, así se puede reimportar sin generar duplicados. */
  function importarProspectos(arr) {
    if (!Array.isArray(arr)) throw new Error('Se esperaba una lista de prospectos');
    const clave = (e, c) => (String(e || '').trim().toLowerCase() + '|' + String(c || '').trim().toLowerCase());
    const existentes = new Set(load().prospectos.map(p => clave(p.empresa, p.ciudad)));
    let creados = 0, omitidos = 0;
    arr.forEach(d => {
      if (!d || (!d.empresa && !d.nombre)) { omitidos++; return; }
      if (existentes.has(clave(d.empresa, d.ciudad))) { omitidos++; return; }
      crearProspecto(d);
      existentes.add(clave(d.empresa, d.ciudad));
      creados++;
    });
    return { creados, omitidos };
  }

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
    METODOS_CONTACTO, ESTADOS_LEAD, ESTADOS_CONTENIDO, ESTADOS_TAREA, ESTADO_DESCARTADA, PRIORIDADES, SERVICIOS, SERVICIOS_PRINCIPAL, SEGMENTOS, SEG_MF, CANALES_CONTACTO,
    TIPOS_PROSPECTO, TIPO_FERRETERIA, TIPO_PAUTA, SUBTIPOS, subtipoDe, migrarProspectos, sincronizarTodo,
    CANALES, canalColor: (id) => (CANALES.find(c => c.id === id) || {}).color || '#8b94a8',
    clasificarServicios, prioridadDe, migrarServicios,
    CATEGORIAS_EVENTO, CATEGORIAS_TIEMPO, METRICAS_META,
    catEvento: (id) => CATEGORIAS_EVENTO.find(c => c.id === id) || CATEGORIAS_EVENTO[0],
    getEventos, getEvento, crearEvento, actualizarEvento, eliminarEvento,
    getMeta, guardarMeta,
    getTiempos, registrarTiempo, eliminarTiempo, guardarPushSub,
    estadoColor: (id) => (ESTADOS_LEAD.find(e => e.id === id) || {}).color || '#8b94a8',
    getProspectos, getProspecto, crearProspecto, actualizarProspecto, eliminarProspecto, agregarHistorial, registrarContacto, convertirEnCliente,
    getClientes, getCliente, crearCliente, actualizarCliente, eliminarCliente,
    agregarServicioCliente, agregarServicioPersonalizado, quitarServicioCliente, actualizarContenido, agregarContenido,
    agregarFactura, actualizarFactura, eliminarFactura, duplicarFactura,
    registrarPago, actualizarPago, eliminarPago, finanzasCliente,
    agregarHistorialCliente,
    getTareas, getTarea, crearTarea, crearTareaConId, actualizarTarea, eliminarTarea, sumarAvance, migrarTareas,
    // Sistema operativo
    SISTEMAS, sistemaDe, RESPONSABLES, RESP_EQUIPO, responsableDe,
    PRIORIDADES_TAREA, PRIO_TAREA_COLOR, UNIDADES, unidadCorta, TURNOS, DIAS_CORTOS, RECURRENCIAS, ESTADOS_PROYECTO,
    getProyectos, getProyecto, crearProyecto, actualizarProyecto, eliminarProyecto,
    getRutinas, getRutina, crearRutina, actualizarRutina, eliminarRutina,
    getAjustes, guardarAjustes, getAgenda, guardarAgenda,
    TIPOS_BLOQUE, tipoBloque,
    cloudPush: (tabla, obj) => Cloud.push(tabla, obj),
    get tablasFaltantes() { return Cloud.enabled ? Cloud.faltantes.slice() : []; },
    guardarLocal: save,
    exportar, importar, importarProspectos, reset, seedIfEmpty, nowISO,
    init, get cloudEnabled() { return Cloud.enabled; }, onRemoteChange: null,
  };
})();
