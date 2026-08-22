/* ============================================================
   TNR · Sistema Operativo — motor
   ------------------------------------------------------------
   Tres cosas viven acá:

   1) EL RELOJ. Todo el CRM trabaja con la fecha LOCAL (Argentina).
      Antes se usaba toISOString(), que es hora de Londres: después de
      las 21:00 el CRM ya creía que era mañana y las tareas marcadas de
      noche se contaban al día siguiente. Acá se arregla de raíz.

   2) LA FÁBRICA DE TAREAS. Una "rutina" es la regla ("15 mails, lunes a
      sábado, cada uno"). El motor fabrica la tarea concreta de cada día.
      Es idempotente: el id de la tarea es rutina + fecha + persona, así
      que aunque abran la app los dos a la vez no se duplica nada.

   3) LA REGLA. Métricas de cumplimiento y contadores de volumen.
   ============================================================ */
(function () {
  'use strict';

  // Cuántos días para atrás fabrica tareas. Sirve para que si nadie abrió
  // la app el miércoles, el miércoles igual aparezca — vencido, que es la
  // verdad — y la semana se mida bien.
  const HORIZONTE_DIAS = 7;

  /* ============================================================
     1) RELOJ — siempre fecha local
     ============================================================ */
  function ymd(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function hoy() { return ymd(new Date()); }
  function fromYmd(s) {
    const [y, m, d] = String(s || '').split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function sumarDias(s, n) { const d = fromYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function diaSemana(s) { return fromYmd(s).getDay(); } // 0=domingo
  // Lunes de la semana de `s`
  function lunesDe(s) {
    const d = fromYmd(s); const dw = (d.getDay() + 6) % 7; // 0 = lunes
    d.setDate(d.getDate() - dw); return ymd(d);
  }
  function primeroDelMes(s) { return String(s).slice(0, 7) + '-01'; }
  function rango(tipo, ref) {
    const h = ref || hoy();
    if (tipo === 'semana') return { desde: lunesDe(h), hasta: h, label: 'esta semana' };
    if (tipo === 'mes') return { desde: primeroDelMes(h), hasta: h, label: 'este mes' };
    return { desde: h, hasta: h, label: 'hoy' };
  }
  const enRango = (f, r) => !!f && f >= r.desde && f <= r.hasta;

  /* ============================================================
     2) FÁBRICA DE TAREAS RECURRENTES
     ============================================================ */

  // 'ambos' se abre en una tarea para cada uno. 'equipo' es UNA tarea
  // compartida: la hace el que puede y cuenta para los dos.
  function personasDe(rutina) {
    if (rutina.responsable === 'ambos') return DB.RESPONSABLES.map(r => r.id);
    return [rutina.responsable || 'equipo'];
  }

  function idInstancia(rutinaId, fecha, persona) { return `RT-${rutinaId}-${fecha}-${persona}`; }

  function tocaEseDia(rutina, fecha) {
    const dias = Array.isArray(rutina.dias) ? rutina.dias : [];
    return dias.includes(diaSemana(fecha));
  }

  /* Fabrica las tareas que falten desde hace HORIZONTE_DIAS hasta hoy.
     Devuelve cuántas creó. No pisa nada existente. */
  function generarTareas() {
    const h = hoy();
    const creadas = [];
    (DB.getRutinas() || []).forEach(rutina => {
      if (!rutina.activa) return;
      const desde = [sumarDias(h, -(HORIZONTE_DIAS - 1)), rutina.desde || '']
        .filter(Boolean).sort().pop(); // el más tardío de los dos
      for (let f = desde; f <= h; f = sumarDias(f, 1)) {
        if (!tocaEseDia(rutina, f)) continue;
        personasDe(rutina).forEach(persona => {
          const id = idInstancia(rutina.id, f, persona);
          const t = DB.crearTareaConId(id, {
            titulo: rutina.titulo,
            observaciones: rutina.observaciones || '',
            responsable: persona,
            sistema: rutina.sistema,
            proyectoId: rutina.proyectoId || '',
            rutinaId: rutina.id,
            fecha: f, turno: rutina.turno || '',
            prioridad: rutina.prioridad || 'Media',
            objetivo: +rutina.objetivo || 0,
            unidad: rutina.unidad || '',
            avance: 0, estado: 'Pendiente',
          });
          if (t) creadas.push(t);
        });
      }
    });
    if (creadas.length) {
      DB.guardarLocal();
      subirEnTandas(creadas);
    }
    return creadas.length;
  }

  // Escrituras masivas de a 5 con respiro, como el resto del CRM: Supabase
  // corta las ráfagas grandes y ya nos mordió antes.
  function subirEnTandas(lista) {
    const TANDA = 5;
    (function siguiente(i) {
      if (i >= lista.length) return;
      Promise.all(lista.slice(i, i + TANDA).map(t => DB.cloudPush('tareas', t)))
        .then(() => setTimeout(() => siguiente(i + TANDA), 120))
        .catch(() => setTimeout(() => siguiente(i + TANDA), 400));
    })(0);
  }

  /* ============================================================
     3) LA REGLA — estado, cumplimiento y volumen
     ============================================================ */

  // "Vencida" no se guarda: se deduce. Una tarea de ayer sin terminar está
  // vencida hoy, y mañana lo seguirá estando, sin que nadie la toque.
  function estadoDe(t) {
    if (t.estado === 'Finalizada') return 'Hecha';
    if (t.fecha && t.fecha < hoy()) return 'Vencida';
    if (t.estado === 'En Curso' || (+t.avance || 0) > 0) return 'En curso';
    return 'Pendiente';
  }
  const esHecha = (t) => t.estado === 'Finalizada';

  // ¿Esta tarea le toca a esta persona? Las compartidas le tocan a los dos.
  function esDe(t, respId) {
    if (!respId || respId === 'todos') return true;
    return t.responsable === respId || t.responsable === 'equipo';
  }

  function tareasDe(opts) {
    opts = opts || {};
    let list = DB.getTareas().filter(t => t.fecha ? enRango(t.fecha, opts.rango || rango('hoy')) : (opts.incluirSinFecha !== false && !opts.rango));
    if (opts.rango) list = DB.getTareas().filter(t => enRango(t.fecha, opts.rango));
    if (opts.resp) list = list.filter(t => esDe(t, opts.resp));
    if (opts.sistema) list = list.filter(t => t.sistema === opts.sistema);
    if (opts.proyectoId) list = list.filter(t => t.proyectoId === opts.proyectoId);
    return list;
  }

  // Todo lo que hay para hacer hoy: las de hoy + las que quedaron colgadas.
  function agendaDe(respId, ref) {
    const h = ref || hoy();
    const todas = DB.getTareas().filter(t => esDe(t, respId));
    const deHoy = todas.filter(t => t.fecha === h);
    const vencidas = todas.filter(t => t.fecha && t.fecha < h && !esHecha(t));
    const sinFecha = todas.filter(t => !t.fecha && !esHecha(t));
    return { deHoy, vencidas, sinFecha };
  }

  function resumen(respId, r) {
    const list = tareasDe({ resp: respId, rango: r });
    const total = list.length;
    const hechas = list.filter(esHecha).length;
    const vencidas = list.filter(t => estadoDe(t) === 'Vencida').length;
    return {
      total, hechas, vencidas,
      pendientes: total - hechas,
      pct: total ? Math.round(hechas / total * 100) : 0,
    };
  }

  function porSistema(respId, r) {
    return DB.SISTEMAS.map(s => {
      const list = tareasDe({ resp: respId, rango: r, sistema: s.id });
      const hechas = list.filter(esHecha).length;
      return { ...s, total: list.length, hechas, pct: list.length ? Math.round(hechas / list.length * 100) : 0 };
    });
  }

  /* Contadores de volumen: no alcanza con "tarea hecha", queremos saber
     cuántos mails salieron. Agrupa por unidad (mails, mensajes, minutos…). */
  function contadores(respId, r) {
    const acc = {};
    tareasDe({ resp: respId, rango: r }).forEach(t => {
      if (!t.unidad || !(+t.objetivo)) return;
      const u = acc[t.unidad] || (acc[t.unidad] = { unidad: t.unidad, corto: DB.unidadCorta(t.unidad), hecho: 0, objetivo: 0, detalle: {} });
      u.hecho += +t.avance || 0;
      u.objetivo += +t.objetivo || 0;
      const d = u.detalle[t.titulo] || (u.detalle[t.titulo] = { titulo: t.titulo, hecho: 0, objetivo: 0 });
      d.hecho += +t.avance || 0; d.objetivo += +t.objetivo || 0;
    });
    return Object.values(acc).sort((a, b) => b.objetivo - a.objetivo);
  }

  /* Racha: días seguidos (hacia atrás desde ayer/hoy) en los que la persona
     terminó todo lo que tenía. Los días sin nada asignado no cortan la racha
     ni la suman — no premiamos el domingo. */
  function racha(respId) {
    let n = 0;
    let f = hoy();
    // Si hoy todavía no terminó todo, la racha se cuenta desde ayer.
    const hoyList = DB.getTareas().filter(t => t.fecha === f && esDe(t, respId));
    if (!hoyList.length || hoyList.some(t => !esHecha(t))) f = sumarDias(f, -1);
    for (let i = 0; i < 120; i++) {
      const list = DB.getTareas().filter(t => t.fecha === f && esDe(t, respId));
      if (list.length) {
        if (list.every(esHecha)) n++; else break;
      }
      f = sumarDias(f, -1);
    }
    return n;
  }

  /* ============================================================
     4) CARGA INICIAL — el plan de trabajo de TNR
     ------------------------------------------------------------
     Ids fijos (…-seed-…) a propósito: si esto corre en el celular de
     Mateo y en la PC de Santiago, escriben la misma fila. Nunca duplica.
     Y si alguien edita o borra una rutina, no vuelve sola: sólo se crea
     lo que no existe la primera vez que corre.
     ============================================================ */
  const L_S = [1, 2, 3, 4, 5, 6];       // lunes a sábado
  const TODOS = [0, 1, 2, 3, 4, 5, 6];  // todos los días
  const LUNES = [1];

  const PROYECTOS_SEED = [
    // --- Sistema 1: prospección ---
    { id: 'PR-seed-coldcalls', nombre: 'Cold Calls — vendedores externos', sistema: 'prospeccion', responsable: 'equipo', estado: 'Activo',
      objetivo: 'Rega + futuros vendedores a comisión llamando en frío.',
      notas: 'Las llamadas NO son tarea de Mateo ni de Santiago: se gestionan en el CRM de Vendedores. Acá sólo se sigue el resultado y el alta de vendedores nuevos.' },

    // --- Sistema 2: gestión de servicios ---
    { id: 'PR-seed-thiago', nombre: 'Thiago', sistema: 'gestion', responsable: 'equipo', estado: 'Activo',
      objetivo: 'Ordenar estrategia, contenido, entregas y comunicación.',
      notas: 'Prioridad: mejorar la comunicación. Definir cadencia de entregas y seguimiento.' },
    { id: 'PR-seed-mcebike', nombre: 'MC E-Bike', sistema: 'gestion', responsable: 'equipo', estado: 'Activo',
      objetivo: 'Arrancar los contenidos y el plan de contenido.',
      notas: 'Branding, contenido, publicaciones y estrategia.' },
    { id: 'PR-seed-motosroll', nombre: 'Motos Roll (Moto B-Roll)', sistema: 'gestion', responsable: 'equipo', estado: 'Activo',
      objetivo: 'Reunión presencial, dominio online y arranque de contenido.', fechaObjetivo: '2026-08-28',
      notas: 'Ventana 24 al 28 de agosto de 2026.' },
    { id: 'PR-seed-f5', nombre: 'F5 Sport', sistema: 'gestion', responsable: 'equipo', estado: 'Activo',
      objetivo: 'Piezas de contenido siguiendo la estrategia de la agencia.',
      notas: 'NO contenido genérico: tiene que seguir la línea que venimos desarrollando para clientes.' },
    { id: 'PR-seed-marcapersonal', nombre: 'TNR — Marca personal', sistema: 'gestion', responsable: 'equipo', estado: 'Activo',
      objetivo: '1 carrusel de marketing + 1 reel por semana.',
      notas: 'Claro, no genérico, que transmita conocimiento, genere autoridad y atraiga clientes.' },
    { id: 'PR-seed-tiktok', nombre: 'TikTok — apelación y cuenta alternativa', sistema: 'gestion', responsable: 'equipo', estado: 'Activo',
      objetivo: 'Resolver la apelación y operar mientras tanto con otra cuenta.', notas: '' },
    { id: 'PR-seed-revistas', nombre: 'Mundo Ferretero + InfoSeguridad', sistema: 'gestion', responsable: 'mateo', estado: 'Activo',
      objetivo: 'Publicar 1 carrusel + 1 estática por día.', notas: 'Responsable: Mateo.' },
    { id: 'PR-seed-webtnr', nombre: 'Optimización web TNR', sistema: 'gestion', responsable: 'equipo', estado: 'Activo',
      objetivo: 'Menos genérica, con video, mejores recursos, mejor branding y más conversión.', notas: '' },

    // --- Sistema 3: optimización ---
    { id: 'PR-seed-automatizaciones', nombre: 'Automatizaciones (n8n + IA + WhatsApp)', sistema: 'optimizacion', responsable: 'equipo', estado: 'Activo',
      objetivo: 'Automatizar tareas comerciales y operativas.', notas: 'n8n, Claude, IA y WhatsApp.' },
    { id: 'PR-seed-casos', nombre: 'Casos de éxito', sistema: 'optimizacion', responsable: 'equipo', estado: 'Activo',
      objetivo: 'Un caso de éxito documentado por cliente.', notas: 'Proyecto permanente.' },
    { id: 'PR-seed-appprospeccion', nombre: 'App de prospección', sistema: 'optimizacion', responsable: 'equipo', estado: 'Activo',
      objetivo: 'Que mande mensajes, responda, ordene prospectos y automatice el seguimiento.', notas: '' },
    { id: 'PR-seed-seo', nombre: 'SEO + Google Ads', sistema: 'optimizacion', responsable: 'equipo', estado: 'Activo',
      objetivo: 'Tráfico y leads propios.', notas: 'Optimización progresiva.' },
    { id: 'PR-seed-capacitacion', nombre: 'Capacitación', sistema: 'optimizacion', responsable: 'equipo', estado: 'Activo',
      objetivo: 'Curso de n8n y curso de habilidades blandas.', notas: '' },
  ];

  const RUTINAS_SEED = [
    // ---------- Prospección TNR ----------
    { id: 'RU-seed-tnr-manana', titulo: 'Prospección TNR — 10 mensajes (mañana)', sistema: 'prospeccion',
      responsable: 'ambos', dias: L_S, turno: 'Mañana', objetivo: 10, unidad: 'mensajes', prioridad: 'Alta',
      observaciones: 'Prospectos del CRM. Es la tarea que hizo crecer agosto.' },
    { id: 'RU-seed-tnr-tarde', titulo: 'Prospección TNR — 10 mensajes (tarde)', sistema: 'prospeccion',
      responsable: 'ambos', dias: L_S, turno: 'Tarde', objetivo: 10, unidad: 'mensajes', prioridad: 'Alta',
      observaciones: 'Segunda tanda del día.' },

    // ---------- Mundo Ferretero ----------
    { id: 'RU-seed-mf-wsp', titulo: 'Mundo Ferretero — 5 mensajes de WhatsApp', sistema: 'prospeccion',
      responsable: 'ambos', dias: L_S, objetivo: 5, unidad: 'mensajes', prioridad: 'Alta', observaciones: '' },
    { id: 'RU-seed-mf-mails', titulo: 'Mundo Ferretero — 15 mails', sistema: 'prospeccion',
      responsable: 'ambos', dias: L_S, objetivo: 15, unidad: 'mails', prioridad: 'Alta',
      observaciones: 'Objetivo: 90 por semana y ~360 por mes, por persona.' },
    { id: 'RU-seed-mf-ig-contactos', titulo: 'Mundo Ferretero IG — seguir 20 ferreterías y mandar mensaje', sistema: 'prospeccion',
      responsable: 'ambos', dias: L_S, objetivo: 20, unidad: 'contactos', prioridad: 'Alta',
      observaciones: 'Objetivo: 120 por semana y ~480 por mes, por persona.' },
    { id: 'RU-seed-mf-ig-follow', titulo: 'Mundo Ferretero IG — seguir / dejar de seguir (15 min)', sistema: 'prospeccion',
      responsable: 'equipo', dias: TODOS, objetivo: 15, unidad: 'minutos', prioridad: 'Media', observaciones: '' },

    // ---------- Instagram de las marcas propias ----------
    { id: 'RU-seed-tnr-ig', titulo: 'TNR IG — seguir / dejar de seguir (15 min)', sistema: 'prospeccion',
      responsable: 'equipo', dias: TODOS, objetivo: 15, unidad: 'minutos', prioridad: 'Media', observaciones: '' },
    { id: 'RU-seed-f5-ig', titulo: 'F5 Sport IG — seguir / dejar de seguir (15 min)', sistema: 'prospeccion',
      responsable: 'equipo', dias: TODOS, objetivo: 15, unidad: 'minutos', prioridad: 'Media',
      proyectoId: 'PR-seed-f5', observaciones: '' },

    // ---------- Gestión de servicios ----------
    { id: 'RU-seed-revistas-diario', titulo: 'MF + InfoSeguridad — 1 carrusel + 1 estática', sistema: 'gestion',
      responsable: 'mateo', dias: L_S, objetivo: 2, unidad: 'piezas', prioridad: 'Alta',
      proyectoId: 'PR-seed-revistas', observaciones: '' },
    { id: 'RU-seed-marca-carrusel', titulo: 'TNR marca personal — 1 carrusel de marketing', sistema: 'gestion',
      responsable: 'equipo', dias: LUNES, objetivo: 1, unidad: 'piezas', prioridad: 'Media',
      proyectoId: 'PR-seed-marcapersonal', observaciones: 'Semanal. Que enseñe algo concreto, nada genérico.' },
    { id: 'RU-seed-marca-reel', titulo: 'TNR marca personal — 1 reel', sistema: 'gestion',
      responsable: 'equipo', dias: LUNES, objetivo: 1, unidad: 'piezas', prioridad: 'Media',
      proyectoId: 'PR-seed-marcapersonal', observaciones: 'Semanal.' },
  ];

  const TAREAS_SEED = [
    { id: 'TK-seed-claro', titulo: 'Sacar el número en Claro', sistema: 'optimizacion', responsable: 'equipo',
      fecha: '2026-08-22', prioridad: 'Alta', observaciones: '' },
    { id: 'TK-seed-reorg', titulo: 'Reorganización TNR', sistema: 'optimizacion', responsable: 'equipo',
      fecha: '2026-08-24', prioridad: 'Alta', observaciones: '' },
    { id: 'TK-seed-motosroll-reunion', titulo: 'Motos Roll — organizar reunión presencial', sistema: 'gestion',
      responsable: 'equipo', proyectoId: 'PR-seed-motosroll', fecha: '2026-08-24', prioridad: 'Alta',
      observaciones: 'Ventana 24 al 28/08. Objetivos: dominio online, arrancar contenido, ordenar estrategia.' },
    { id: 'TK-seed-motosroll-dominio', titulo: 'Motos Roll — dejar el dominio online', sistema: 'gestion',
      responsable: 'equipo', proyectoId: 'PR-seed-motosroll', fecha: '2026-08-28', prioridad: 'Alta', observaciones: '' },
    { id: 'TK-seed-destacadas', titulo: 'TNR — cambiar las historias destacadas', sistema: 'gestion',
      responsable: 'equipo', prioridad: 'Media', observaciones: '' },
    { id: 'TK-seed-thiago-comunicacion', titulo: 'Thiago — ordenar la comunicación y el seguimiento', sistema: 'gestion',
      responsable: 'equipo', proyectoId: 'PR-seed-thiago', prioridad: 'Alta', observaciones: '' },
    { id: 'TK-seed-mcebike-plan', titulo: 'MC E-Bike — armar el plan de contenido', sistema: 'gestion',
      responsable: 'equipo', proyectoId: 'PR-seed-mcebike', prioridad: 'Alta', observaciones: '' },
    { id: 'TK-seed-tiktok-apelacion', titulo: 'TikTok — seguir la apelación', sistema: 'gestion',
      responsable: 'equipo', proyectoId: 'PR-seed-tiktok', prioridad: 'Media', observaciones: '' },
    { id: 'TK-seed-tiktok-cuenta', titulo: 'TikTok — poner a andar la cuenta alternativa', sistema: 'gestion',
      responsable: 'equipo', proyectoId: 'PR-seed-tiktok', prioridad: 'Media', observaciones: '' },
    { id: 'TK-seed-curso-n8n', titulo: 'Curso de n8n', sistema: 'optimizacion', responsable: 'equipo',
      proyectoId: 'PR-seed-capacitacion', prioridad: 'Baja', observaciones: '' },
    { id: 'TK-seed-curso-blandas', titulo: 'Curso de habilidades blandas', sistema: 'optimizacion', responsable: 'equipo',
      proyectoId: 'PR-seed-capacitacion', prioridad: 'Baja', observaciones: '' },
  ];

  /* Carga el plan sólo si falta. Corre después de bajar los datos de la nube,
     así que "falta" significa que no está ni acá ni en la nube. */
  function cargarPlanInicial() {
    let n = 0;
    const proyectos = DB.getProyectos();
    PROYECTOS_SEED.forEach(p => {
      if (proyectos.some(x => x.id === p.id)) return;
      DB.crearProyecto(p); n++;
    });
    const rutinas = DB.getRutinas();
    RUTINAS_SEED.forEach(r => {
      if (rutinas.some(x => x.id === r.id)) return;
      DB.crearRutina(Object.assign({ desde: hoy(), activa: true }, r)); n++;
    });
    const pend = [];
    TAREAS_SEED.forEach(t => {
      if (DB.getTarea(t.id)) return;
      const nueva = DB.crearTareaConId(t.id, t);
      if (nueva) { pend.push(nueva); n++; }
    });
    if (pend.length) { DB.guardarLocal(); subirEnTandas(pend); }
    return n;
  }

  /* Arranque: carga el plan si hace falta y fabrica las tareas del día. */
  function arrancar() {
    const nuevos = cargarPlanInicial();
    const tareas = generarTareas();
    return { plan: nuevos, tareas };
  }

  window.Sistema = {
    ymd, hoy, fromYmd, sumarDias, diaSemana, lunesDe, rango, enRango,
    generarTareas, arrancar, cargarPlanInicial, subirEnTandas,
    estadoDe, esHecha, esDe, tareasDe, agendaDe, resumen, porSistema, contadores, racha,
    personasDe, tocaEseDia, HORIZONTE_DIAS,
  };
})();
