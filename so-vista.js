/* ============================================================
   TNR · Sistema Operativo — pantallas
   ------------------------------------------------------------
   Cuatro vistas, todas mobile-first:

     hoy          · lo único que hay que mirar a la mañana
     tareas       · todo lo que hay, con filtros por persona y sistema
     proyectos    · los trabajos abiertos, separados por sistema
     productividad· cuánto se cumplió y cuánto volumen se hizo

   Regla de diseño: una tarea se marca con UN toque. Si tiene contador,
   el toque grande la da por completa (15 de 15) y los ±  son para el
   día que salieron 9. Nada de abrir un formulario para decir "la hice".
   ============================================================ */
(function () {
  'use strict';

  const U = () => window.TNRUI || {};
  const esc = s => (U().esc ? U().esc(s) : String(s == null ? '' : s));
  const toast = (m, k) => U().toast && U().toast(m, k);
  const openModal = (t, h) => U().openModal && U().openModal(t, h);
  const closeModal = () => U().closeModal && U().closeModal();
  const confirmDialog = (...a) => U().confirmDialog && U().confirmDialog(...a);
  const fmtDate = iso => (U().fmtDate ? U().fmtDate(iso) : (iso || '—'));
  const S = () => window.Sistema;

  let host = null;
  let vista = 'hoy';
  // A quién estamos mirando. Vacío = la persona logueada.
  let quien = '';
  const filtros = { sistema: '', estado: 'abiertas', resp: '' };
  let rangoProd = 'hoy';
  let proyectoAbierto = null;
  let sistemaProyectos = '';

  /* ---------- helpers ---------- */
  function yo() { return (window.Auth && Auth.usuarioId) || 'mateo'; }
  function foco() { return quien || yo(); }
  function nombreDe(id) { return DB.responsableDe(id).corto; }

  function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; }
  function colorPct(p) { return p >= 100 ? '#3ecf8e' : p >= 60 ? '#f5c451' : p > 0 ? '#f59e42' : '#8b94a8'; }

  function fechaLarga(f) {
    const d = S().fromYmd(f);
    const s = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function sysChip(id) {
    const s = DB.sistemaDe(id);
    if (!id) return '';
    return `<span class="so-sys" style="--c:${s.color}">${esc(s.corto)}</span>`;
  }
  function prioPunto(p) {
    const c = DB.PRIO_TAREA_COLOR[p] || '#8b94a8';
    if (p === 'Media') return '';   // el default no necesita adorno
    return `<span class="so-prio" style="background:${c}" title="Prioridad ${esc(p)}"></span>`;
  }

  function barra(p, color) {
    return `<div class="so-bar"><div class="so-bar-fill" style="width:${Math.min(100, p)}%;background:${color || colorPct(p)}"></div></div>`;
  }

  /* ============================================================
     TARJETA DE TAREA — el corazón del sistema
     ============================================================ */
  function tarjetaTarea(t, opts) {
    opts = opts || {};
    const est = S().estadoDe(t);
    const hecha = est === 'Hecha';
    const objetivo = +t.objetivo || 0;
    const avance = +t.avance || 0;
    const unidad = DB.unidadCorta(t.unidad);
    const proy = t.proyectoId ? DB.getProyecto(t.proyectoId) : null;
    const meta = [
      t.sistema ? sysChip(t.sistema) : '',
      t.turno ? `<span class="so-meta-x">${esc(t.turno)}</span>` : '',
      opts.mostrarResp !== false ? `<span class="so-meta-x">${esc(nombreDe(t.responsable))}</span>` : '',
      proy ? `<span class="so-meta-x">${esc(proy.nombre)}</span>` : '',
      opts.mostrarFecha && t.fecha ? `<span class="so-meta-x">${fmtDate(t.fecha)}</span>` : '',
      S().estadoDe(t) === 'Descartada' ? `<span class="so-meta-x so-desc-tag">descartada</span>` : '',
      t.rutinaId ? `<span class="so-meta-x so-rec" title="Se repite sola">${icon('repeat', 12)}</span>` : '',
    ].filter(Boolean).join('');

    const descartada = est === 'Descartada';
    return `<article class="so-task${hecha ? ' done' : ''}${est === 'Vencida' ? ' late' : ''}${descartada ? ' descartada' : ''}">
      <button class="so-check" onclick="SO.completar('${t.id}')" aria-label="${hecha ? 'Desmarcar' : 'Marcar como hecha'}">${icon('check', 16)}</button>
      <div class="so-task-body" onclick="SO.abrirTarea('${t.id}')">
        <div class="so-task-title">${prioPunto(t.prioridad)}${esc(t.titulo)}</div>
        ${meta ? `<div class="so-task-meta">${meta}</div>` : ''}
        ${t.observaciones ? `<div class="so-task-note">${esc(t.observaciones)}</div>` : ''}
      </div>
      ${objetivo > 0 ? `
        <div class="so-count" onclick="event.stopPropagation()">
          <button class="so-count-btn" onclick="SO.sumar('${t.id}',-1)" aria-label="Restar uno">${icon('minus', 14)}</button>
          <button class="so-count-num" onclick="SO.editarAvance('${t.id}')" title="Tocar para escribir el número exacto">
            <strong style="color:${colorPct(pct(avance, objetivo))}">${avance}</strong><span>/ ${objetivo}${unidad ? ' ' + esc(unidad) : ''}</span>
          </button>
          <button class="so-count-btn" onclick="SO.sumar('${t.id}',1)" aria-label="Sumar uno">${icon('plus', 14)}</button>
        </div>` : ''}
    </article>`;
  }

  function listaTareas(list, opts) {
    if (!list.length) return '';
    return `<div class="so-tasks">${list.map(t => tarjetaTarea(t, opts)).join('')}</div>`;
  }

  // Orden estable: primero lo que falta, después por turno, después por prioridad.
  function ordenar(list) {
    const turno = t => (t.turno === 'Mañana' ? 0 : t.turno === 'Tarde' ? 1 : 2);
    const prio = t => ({ Alta: 0, Media: 1, Baja: 2 }[t.prioridad] ?? 1);
    return list.slice().sort((a, b) =>
      (S().esHecha(a) - S().esHecha(b)) || (turno(a) - turno(b)) || (prio(a) - prio(b)) || String(a.titulo).localeCompare(b.titulo));
  }

  /* ============================================================
     VISTA · HOY
     ============================================================ */
  function renderHoy() {
    const persona = foco();
    const h = S().hoy();
    // TNR y lo personal se calculan por separado a propósito: si se mezclaran,
    // un día con los perros atendidos subiría el cumplimiento comercial.
    const ag = S().agendaDe(persona, h, 'tnr');
    const agPers = S().agendaDe(persona, h, 'personal');
    const r = S().resumen(persona, S().rango('hoy'), 'tnr');
    const rPers = S().resumen(persona, S().rango('hoy'), 'personal');
    const conts = S().contadores(persona, S().rango('hoy'), 'tnr');
    const manana = ordenar(ag.deHoy.filter(t => t.turno === 'Mañana'));
    const tarde = ordenar(ag.deHoy.filter(t => t.turno === 'Tarde'));
    const resto = ordenar(ag.deHoy.filter(t => !t.turno));
    const vencidas = ordenar(ag.vencidas);
    const sinFecha = ordenar(ag.sinFecha).slice(0, 6);
    const personales = ordenar(agPers.deHoy.concat(agPers.vencidas));

    const equipo = DB.RESPONSABLES.map(p => ({ p, r: S().resumen(p.id, S().rango('hoy'), 'tnr'), racha: S().racha(p.id) }));
    const proyectos = DB.getProyectos().filter(p => p.estado === 'Activo');

    host.innerHTML = `
      <div class="so-head">
        <div>
          <h1>Hoy</h1>
          <div class="sub">${fechaLarga(h)}</div>
        </div>
        ${selectorPersona()}
      </div>

      ${avisoTablas()}
      ${franjaAhora(persona)}

      <section class="so-hero" style="--c:${colorPct(r.pct)}">
        <div class="so-hero-main">
          <div class="so-hero-num">${r.hechas}<span>/ ${r.total}</span></div>
          <div class="so-hero-lbl">tareas de ${esc(nombreDe(persona))} hoy</div>
        </div>
        <div class="so-hero-side">
          <div class="so-hero-pct">${r.pct}%</div>
          ${barra(r.pct)}
          <div class="so-hero-sub">${r.pendientes === 0 && r.total > 0 ? '¡Día cerrado!' : `${r.pendientes} sin hacer`}${vencidas.length ? ` · ${vencidas.length} atrasada${vencidas.length > 1 ? 's' : ''}` : ''}</div>
        </div>
      </section>

      ${conts.length ? (() => {
        // En el celular arranca plegado: lo primero que tiene que verse son las
        // tareas, no el resumen. En pantalla grande sobra lugar, así que va abierto.
        const totalHecho = conts.reduce((a, c) => a + c.hecho, 0);
        const totalMeta = conts.reduce((a, c) => a + c.objetivo, 0);
        const abierto = window.innerWidth > 680 ? ' open' : '';
        return `<details class="panel so-panel so-fold"${abierto}>
          <summary>
            <span class="so-fold-t">${icon('bar-chart', 16)} Actividad de hoy</span>
            <strong style="color:${colorPct(pct(totalHecho, totalMeta))}">${totalHecho} / ${totalMeta}</strong>
            <span class="so-fold-x">${icon('chevron-right', 15)}</span>
          </summary>
          <div class="so-counters">
            ${conts.map(c => `
              <div class="so-counter">
                <div class="so-counter-top"><span>${esc(c.corto || c.unidad)}</span><strong style="color:${colorPct(pct(c.hecho, c.objetivo))}">${c.hecho} / ${c.objetivo}</strong></div>
                ${barra(pct(c.hecho, c.objetivo))}
              </div>`).join('')}
          </div>
        </details>`;
      })() : ''}

      ${vencidas.length ? `
      <section class="so-block so-block-alert">
        <h2>${icon('alert', 15)} Quedó colgado
          <button class="so-limpiar" onclick="SO.descartarAtrasadas('${persona}')">Descartar las ${vencidas.length}</button>
        </h2>
        ${listaTareas(vencidas, { mostrarFecha: true, mostrarResp: persona === 'todos' })}
      </section>` : ''}

      ${bloque('Mañana', 'sun', manana, persona)}
      ${bloque('Tarde', 'clock', tarde, persona)}
      ${bloque('Sin horario', 'check-square', resto, persona)}

      ${!ag.deHoy.length && !vencidas.length ? `
        <div class="empty"><div class="e-ic">${icon('check-square', 40)}</div>
        <h3>No hay nada cargado para hoy</h3>
        <p>Si algo se hace todos los días, conviene cargarlo como rutina para que aparezca solo.</p>
        <button class="btn-primary" onclick="SO.nuevaRutina()">${icon('repeat')} Crear rutina</button></div>` : ''}

      ${sinFecha.length ? `
      <section class="so-block">
        <h2>${icon('inbox', 15)} Sin fecha</h2>
        ${listaTareas(sinFecha, { mostrarResp: true })}
      </section>` : ''}

      ${personales.length ? `
      <section class="so-block">
        <h2><span class="so-sys" style="--c:${DB.sistemaDe('personal').color}">Personal</span>
          ${agPers.vencidas.length ? `<button class="so-limpiar" onclick="SO.descartarAtrasadas('${persona}','personal')">Descartar ${agPers.vencidas.length} atrasada${agPers.vencidas.length > 1 ? 's' : ''}</button>` : ''}
          <span class="so-block-count">${rPers.hechas}/${rPers.total}</span></h2>
        ${barra(rPers.pct, DB.sistemaDe('personal').color)}
        <div style="height:10px"></div>
        ${listaTareas(personales, { mostrarResp: false, mostrarFecha: true })}
      </section>` : ''}

      ${panelMiDia(persona)}

      <section class="panel so-panel">
        <div class="panel-title">${icon('users', 16)} El equipo hoy</div>
        <div class="so-team">
          ${equipo.map(e => `
            <div class="so-team-row" onclick="SO.verPersona('${e.p.id}')">
              <div class="so-team-name">${esc(e.p.corto)}${e.racha > 1 ? `<span class="so-streak">${e.racha} días seguidos</span>` : ''}</div>
              <div class="so-team-bar">${barra(e.r.pct)}</div>
              <div class="so-team-num"><strong>${e.r.hechas}/${e.r.total}</strong><span>${e.r.pct}%</span></div>
            </div>`).join('')}
        </div>
      </section>

      <section class="panel so-panel">
        <div class="panel-title">${icon('folder', 16)} Proyectos activos <span class="muted" style="font-weight:400;font-size:11px">${proyectos.length}</span></div>
        <div class="so-proj-mini">
          ${proyectos.slice(0, 8).map(p => {
            const ts = DB.getTareas().filter(t => t.proyectoId === p.id);
            const ok = ts.filter(S().esHecha).length;
            return `<button class="so-proj-chip" onclick="SO.abrirProyecto('${p.id}')" style="--c:${DB.sistemaDe(p.sistema).color}">
              <span>${esc(p.nombre)}</span>${ts.length ? `<em>${ok}/${ts.length}</em>` : ''}</button>`;
          }).join('') || '<div class="muted" style="font-size:13px">Todavía no hay proyectos activos.</div>'}
        </div>
        <button class="btn-ghost so-verall" onclick="SO.ir('proyectos')">Ver todos ${icon('arrow-right', 13)}</button>
      </section>
    `;
  }

  /* Si faltan las tablas nuevas en Supabase, las rutinas y los proyectos quedan
     guardados sólo en este celular: Mateo y Santiago verían cosas distintas.
     Mejor decirlo fuerte que dejar que pase en silencio. */
  function avisoTablas() {
    const faltan = (DB.tablasFaltantes || []).filter(t => ['rutinas', 'proyectos'].includes(t));
    if (!faltan.length) return '';
    return `<div class="panel so-panel" style="border-color:var(--yellow)">
      <div class="panel-title" style="color:var(--yellow)">${icon('alert', 16)} Falta un paso de instalación</div>
      <p style="margin:0;font-size:13px;line-height:1.55">
        La base todavía no tiene las tablas <strong>${faltan.join(' y ')}</strong>. Mientras tanto, las rutinas y los
        proyectos se guardan sólo en este dispositivo y no se comparten con el otro usuario.<br />
        Para arreglarlo: Supabase → SQL Editor → New query → pegar el archivo <strong>sistema-setup.sql</strong> → Run.
      </p>
    </div>`;
  }

  /* ---------- Franja "qué toca ahora" ----------
     Una sola línea, arriba de todo. Es lo primero que uno mira cuando abre
     el celular entre clase y clase: dónde estoy parado y cuánto falta. */
  function franjaAhora(persona) {
    if (persona === 'todos') return '';
    const a = S().bloqueAhora(persona);
    if (!a.total) return '';
    const t = DB.tipoBloque((a.actual || a.siguiente || {}).tipo);
    const falta = (m) => m == null ? '' : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim() : `${m} min`;
    if (a.actual) {
      return `<div class="so-ahora" style="--c:${t.color}">
        <span class="so-ahora-tag">Ahora</span>
        <strong>${esc(a.actual.titulo)}</strong>
        <span class="so-ahora-x">${a.faltan != null ? 'faltan ' + falta(a.faltan) : ''}${a.siguiente ? ` · después ${esc(a.siguiente.titulo)}` : ''}</span>
      </div>`;
    }
    if (a.siguiente) {
      return `<div class="so-ahora" style="--c:${t.color}">
        <span class="so-ahora-tag">Sigue</span>
        <strong>${esc(a.siguiente.titulo)}</strong>
        <span class="so-ahora-x">a las ${esc(a.siguiente.desde)}${a.faltan != null ? ' · en ' + falta(a.faltan) : ''}</span>
      </div>`;
    }
    return `<div class="so-ahora" style="--c:var(--text-faint)">
      <span class="so-ahora-tag">Listo</span><strong>Se terminó la agenda del día</strong>
      <span class="so-ahora-x">lo que quede es tiempo tuyo</span></div>`;
  }

  /* ---------- La línea del día ----------
     El mapa de la jornada. Va plegado en el celular: no es lo primero que
     hay que ver, pero cuando hace falta ubicarse está a un toque. */
  function panelMiDia(persona) {
    if (persona === 'todos') return '';
    const list = S().bloquesDe(persona, S().hoy());
    if (!list.length) {
      return `<div class="panel so-panel">
        <div class="panel-title">${icon('calendar', 16)} Mi día</div>
        <p style="margin:0 0 12px;font-size:13px;color:var(--text-dim)">Todavía no cargaste tu semana: a qué hora vas al colegio, cuándo entrenás, en qué franja trabajás para TNR.</p>
        <button class="btn-primary" onclick="SO.ir('agenda')">${icon('calendar')} Armar mi semana</button>
      </div>`;
    }
    const ahora = S().aMin(S().ahoraHHMM());
    return `<details class="panel so-panel so-fold"${window.innerWidth > 680 ? ' open' : ''}>
      <summary>
        <span class="so-fold-t">${icon('calendar', 16)} Mi día</span>
        <strong>${list.length} bloques</strong>
        <span class="so-fold-x">${icon('chevron-right', 15)}</span>
      </summary>
      <div class="so-linea-dia">
        ${list.map(b => {
          const t = DB.tipoBloque(b.tipo);
          const pasado = S().aMin(b.hasta) <= ahora;
          const activo = S().aMin(b.desde) <= ahora && ahora < S().aMin(b.hasta);
          return `<div class="so-tramo${pasado ? ' pasado' : ''}${activo ? ' activo' : ''}" style="--c:${t.color}">
            <span class="so-tramo-h">${esc(b.desde)}<em>${esc(b.hasta)}</em></span>
            <span class="so-tramo-b"><strong>${esc(b.titulo)}</strong>${b.nota ? `<em>${esc(b.nota)}</em>` : ''}</span>
          </div>`;
        }).join('')}
      </div>
      <button class="btn-ghost so-verall" onclick="SO.ir('agenda')">Editar mi semana ${icon('arrow-right', 13)}</button>
    </details>`;
  }

  function bloque(titulo, ic, list, persona) {
    if (!list.length) return '';
    const ok = list.filter(S().esHecha).length;
    return `<section class="so-block">
      <h2>${icon(ic, 15)} ${titulo} <span class="so-block-count">${ok}/${list.length}</span></h2>
      ${listaTareas(list, { mostrarResp: persona === 'todos' })}
    </section>`;
  }

  function selectorPersona() {
    const opts = [...DB.RESPONSABLES.map(r => ({ id: r.id, label: r.corto })), { id: 'todos', label: 'Los dos' }];
    const actual = foco();
    return `<div class="so-switch">
      ${opts.map(o => `<button class="${actual === o.id ? 'on' : ''}" onclick="SO.verPersona('${o.id}')">${esc(o.label)}</button>`).join('')}
    </div>`;
  }

  /* ============================================================
     VISTA · TAREAS
     ============================================================ */
  function renderTareas() {
    // Las descartadas sólo aparecen si se las pide: son las que uno decidió
    // dar por perdidas, no tienen por qué ensuciar la lista todos los días.
    let list = S().todas(filtros.estado === 'descartadas').slice();
    const resp = filtros.resp || foco();
    if (resp !== 'todos') list = list.filter(t => S().esDe(t, resp));
    if (filtros.sistema) list = list.filter(t => t.sistema === filtros.sistema);
    if (filtros.estado === 'abiertas') list = list.filter(t => !S().esHecha(t));
    else if (filtros.estado === 'hechas') list = list.filter(S().esHecha);
    else if (filtros.estado === 'vencidas') list = list.filter(t => S().estadoDe(t) === 'Vencida');
    else if (filtros.estado === 'descartadas') list = list.filter(S().esDescartada);

    // Agrupadas por día para que se lea como una agenda, no como un Excel.
    // La clave lleva un número adelante a propósito: sin eso, ordenar de forma
    // alfabética ponía "2026-08-24" antes que "hoy" y la agenda quedaba al revés.
    const h = S().hoy();
    const grupos = {};
    list.forEach(t => {
      const k = !t.fecha ? '9' : t.fecha < h ? '0' : t.fecha === h ? '1' : '2' + t.fecha;
      (grupos[k] || (grupos[k] = [])).push(t);
    });
    const titulo = k => k === '0' ? 'Atrasadas' : k === '1' ? 'Hoy' : k === '9' ? 'Sin fecha'
      : (k.slice(1) === S().sumarDias(h, 1) ? 'Mañana' : fechaLarga(k.slice(1)));

    host.innerHTML = `
      <div class="so-head">
        <div><h1>Tareas</h1><div class="sub">${list.length} ${filtros.estado === 'hechas' ? 'hechas' : filtros.estado === 'vencidas' ? 'vencidas' : 'sin terminar'}</div></div>
        <div class="head-actions"><button class="btn-primary" onclick="SO.nuevaTarea()">${icon('plus')}<span class="btn-label"> Nueva</span></button></div>
      </div>

      <div class="so-filters">
        <div class="so-switch">
          ${[...DB.RESPONSABLES.map(r => ({ id: r.id, label: r.corto })), { id: 'todos', label: 'Todas' }]
            .map(o => `<button class="${resp === o.id ? 'on' : ''}" onclick="SO.filtrar('resp','${o.id}')">${esc(o.label)}</button>`).join('')}
        </div>
        <div class="so-chips">
          <button class="so-chip ${!filtros.sistema ? 'on' : ''}" onclick="SO.filtrar('sistema','')">Todo</button>
          ${DB.SISTEMAS.map(s => `<button class="so-chip ${filtros.sistema === s.id ? 'on' : ''}" style="--c:${s.color}" onclick="SO.filtrar('sistema','${s.id}')">${esc(s.corto)}</button>`).join('')}
        </div>
        <div class="so-chips">
          ${[['abiertas', 'Sin terminar'], ['vencidas', 'Vencidas'], ['hechas', 'Hechas'], ['descartadas', 'Descartadas'], ['todas', 'Todas']]
            .map(([k, l]) => `<button class="so-chip ${filtros.estado === k ? 'on' : ''}" onclick="SO.filtrar('estado','${k}')">${l}</button>`).join('')}
        </div>
      </div>

      ${Object.keys(grupos).sort().map(k => `
        <section class="so-block">
          <h2>${titulo(k)} <span class="so-block-count">${grupos[k].filter(S().esHecha).length}/${grupos[k].length}</span></h2>
          ${listaTareas(ordenar(grupos[k]), { mostrarResp: true, mostrarFecha: k === '0' })}
        </section>`).join('') ||
        `<div class="empty"><div class="e-ic">${icon('check-square', 40)}</div><h3>Nada por acá</h3><p>Cambiá los filtros o creá una tarea.</p></div>`}
    `;
  }

  /* ============================================================
     VISTA · PROYECTOS
     ============================================================ */
  function renderProyectos() {
    if (proyectoAbierto) return renderProyectoDetalle();
    const todos = DB.getProyectos();
    const list = sistemaProyectos ? todos.filter(p => p.sistema === sistemaProyectos) : todos;

    host.innerHTML = `
      <div class="so-head">
        <div><h1>Proyectos</h1><div class="sub">${todos.filter(p => p.estado === 'Activo').length} activos de ${todos.length}</div></div>
        <div class="head-actions"><button class="btn-primary" onclick="SO.nuevoProyecto()">${icon('plus')}<span class="btn-label"> Nuevo</span></button></div>
      </div>
      <div class="so-filters">
        <div class="so-chips">
          <button class="so-chip ${!sistemaProyectos ? 'on' : ''}" onclick="SO.filtrarProyectos('')">Todos</button>
          ${DB.SISTEMAS.map(s => `<button class="so-chip ${sistemaProyectos === s.id ? 'on' : ''}" style="--c:${s.color}" onclick="SO.filtrarProyectos('${s.id}')">${esc(s.corto)}</button>`).join('')}
        </div>
      </div>
      ${DB.SISTEMAS.filter(s => !sistemaProyectos || s.id === sistemaProyectos).map(s => {
        const ps = list.filter(p => p.sistema === s.id);
        if (!ps.length) return '';
        return `<section class="so-block">
          <h2><span class="so-sys" style="--c:${s.color}">${esc(s.label)}</span></h2>
          <div class="so-projects">${ps.map(tarjetaProyecto).join('')}</div>
        </section>`;
      }).join('')}
      ${!list.length ? `<div class="empty"><div class="e-ic">${icon('folder', 40)}</div><h3>Sin proyectos</h3><p>Un proyecto es un trabajo con principio y fin: un cliente, una web, una campaña.</p><button class="btn-primary" onclick="SO.nuevoProyecto()">${icon('plus')} Crear</button></div>` : ''}
    `;
  }

  function tarjetaProyecto(p) {
    const ts = DB.getTareas().filter(t => t.proyectoId === p.id);
    const ok = ts.filter(S().esHecha).length;
    const abiertas = ts.length - ok;
    const s = DB.sistemaDe(p.sistema);
    const venc = p.fechaObjetivo ? `<span class="so-meta-x">${icon('calendar', 12)} ${fmtDate(p.fechaObjetivo)}</span>` : '';
    return `<article class="so-project" style="--c:${s.color}" onclick="SO.abrirProyecto('${p.id}')">
      <div class="so-project-top">
        <h3>${esc(p.nombre)}</h3>
        <span class="so-estado so-estado-${p.estado === 'Activo' ? 'ok' : p.estado === 'En pausa' ? 'pausa' : 'fin'}">${esc(p.estado)}</span>
      </div>
      ${p.objetivo ? `<p class="so-project-obj">${esc(p.objetivo)}</p>` : ''}
      <div class="so-task-meta">${esc(DB.responsableDe(p.responsable).corto)}${venc}</div>
      ${ts.length ? `${barra(pct(ok, ts.length), s.color)}<div class="so-project-foot">${ok} de ${ts.length} tareas${abiertas ? ` · ${abiertas} abiertas` : ' · listo'}</div>` : '<div class="so-project-foot muted">Sin tareas todavía</div>'}
    </article>`;
  }

  function renderProyectoDetalle() {
    const p = DB.getProyecto(proyectoAbierto);
    if (!p) { proyectoAbierto = null; return renderProyectos(); }
    const s = DB.sistemaDe(p.sistema);
    const ts = ordenar(DB.getTareas().filter(t => t.proyectoId === p.id));
    const rs = DB.getRutinas().filter(r => r.proyectoId === p.id);
    const ok = ts.filter(S().esHecha).length;

    host.innerHTML = `
      <button class="so-back" onclick="SO.cerrarProyecto()">${icon('chevron-left', 16)} Proyectos</button>
      <div class="so-head">
        <div>
          <h1>${esc(p.nombre)}</h1>
          <div class="sub">${sysChip(p.sistema)} · ${esc(DB.responsableDe(p.responsable).corto)} · ${esc(p.estado)}${p.fechaObjetivo ? ' · para el ' + fmtDate(p.fechaObjetivo) : ''}</div>
        </div>
        <div class="head-actions">
          <button class="btn-secondary" onclick="SO.editarProyecto('${p.id}')">${icon('edit')}<span class="btn-label"> Editar</span></button>
          <button class="btn-primary" onclick="SO.nuevaTarea({proyectoId:'${p.id}',sistema:'${p.sistema}'})">${icon('plus')}<span class="btn-label"> Tarea</span></button>
        </div>
      </div>
      ${p.objetivo ? `<div class="panel so-panel"><div class="panel-title">${icon('flag', 16)} Objetivo</div><p style="margin:0;font-size:14px">${esc(p.objetivo)}</p></div>` : ''}
      ${p.notas ? `<div class="panel so-panel"><div class="panel-title">${icon('file', 16)} Notas</div><p style="margin:0;font-size:14px;white-space:pre-wrap">${esc(p.notas)}</p></div>` : ''}
      ${ts.length ? `<section class="so-block"><h2>Tareas <span class="so-block-count">${ok}/${ts.length}</span></h2>${barra(pct(ok, ts.length), s.color)}${listaTareas(ts, { mostrarResp: true, mostrarFecha: true })}</section>`
        : `<div class="empty"><div class="e-ic">${icon('check-square', 40)}</div><h3>Sin tareas</h3><p>Cargá lo que hay que hacer para avanzar este proyecto.</p><button class="btn-primary" onclick="SO.nuevaTarea({proyectoId:'${p.id}',sistema:'${p.sistema}'})">${icon('plus')} Crear tarea</button></div>`}
      ${rs.length ? `<section class="so-block"><h2>${icon('repeat', 15)} Rutinas de este proyecto</h2>${rs.map(filaRutina).join('')}</section>` : ''}
      <div class="so-danger"><button class="btn-ghost danger" onclick="SO.borrarProyecto('${p.id}')">${icon('trash')} Eliminar proyecto</button>
        <span class="muted">Las tareas no se borran: quedan sueltas.</span></div>
    `;
  }

  /* ============================================================
     VISTA · PRODUCTIVIDAD
     ============================================================ */
  function renderProductividad() {
    const r = S().rango(rangoProd);
    // El porcentaje de TNR va aparte del personal: son dos cosas distintas y
    // mezclarlas haría que el número comercial deje de significar nada.
    const personas = DB.RESPONSABLES.map(p => ({
      ...p, res: S().resumen(p.id, r, 'tnr'), sist: S().porSistema(p.id, r, 'tnr'),
      cont: S().contadores(p.id, r, 'tnr'), racha: S().racha(p.id),
      pers: S().resumen(p.id, r, 'personal'),
    }));
    const equipoRes = S().resumen('todos', r, 'tnr');
    const emb = embudo(r);

    host.innerHTML = `
      <div class="so-head">
        <div><h1>Productividad</h1><div class="sub">Cumplimiento real, ${r.label}</div></div>
      </div>
      <div class="so-filters">
        <div class="so-switch">
          ${[['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes']].map(([k, l]) =>
            `<button class="${rangoProd === k ? 'on' : ''}" onclick="SO.rango('${k}')">${l}</button>`).join('')}
        </div>
      </div>

      <div class="so-prod-grid">
        ${personas.map(p => `
          <section class="panel so-panel so-person" style="--c:${colorPct(p.res.pct)}">
            <div class="so-person-head">
              <div><strong>${esc(p.corto)}</strong>${p.racha > 1 ? `<span class="so-streak">${p.racha} días seguidos</span>` : ''}</div>
              <div class="so-person-pct">${p.res.pct}%</div>
            </div>
            ${barra(p.res.pct)}
            <div class="so-person-kpis">
              <div><strong>${p.res.hechas}</strong><span>hechas</span></div>
              <div><strong>${p.res.pendientes}</strong><span>pendientes</span></div>
              <div><strong class="${p.res.vencidas ? 'rojo' : ''}">${p.res.vencidas}</strong><span>vencidas</span></div>
            </div>
            ${p.pers.total && p.id === yo() ? `
            <div class="so-personal-mini" style="--c:${DB.sistemaDe('personal').color}">
              <span>Personal</span>
              ${barra(p.pers.pct, DB.sistemaDe('personal').color)}
              <em>${p.pers.hechas}/${p.pers.total}</em>
            </div>` : ''}
            <div class="so-sist">
              ${p.sist.filter(s => s.total).map(s => `
                <div class="so-sist-row">
                  <span class="so-sys" style="--c:${s.color}">${esc(s.corto)}</span>
                  ${barra(s.pct, s.color)}
                  <em>${s.hechas}/${s.total}</em>
                </div>`).join('') || '<div class="muted" style="font-size:12px">Sin tareas en este período.</div>'}
            </div>
            ${p.cont.length ? `<div class="so-counters so-counters-mini">
              ${p.cont.map(c => `<div class="so-counter">
                <div class="so-counter-top"><span>${esc(c.corto || c.unidad)}</span><strong style="color:${colorPct(pct(c.hecho, c.objetivo))}">${c.hecho} / ${c.objetivo}</strong></div>
                ${barra(pct(c.hecho, c.objetivo))}
              </div>`).join('')}
            </div>` : ''}
          </section>`).join('')}
      </div>

      <section class="panel so-panel">
        <div class="panel-title">${icon('bar-chart', 16)} TNR entero · ${r.label}</div>
        <div class="so-person-kpis">
          <div><strong>${equipoRes.hechas}</strong><span>hechas</span></div>
          <div><strong>${equipoRes.pendientes}</strong><span>pendientes</span></div>
          <div><strong class="${equipoRes.vencidas ? 'rojo' : ''}">${equipoRes.vencidas}</strong><span>vencidas</span></div>
          <div><strong>${equipoRes.pct}%</strong><span>cumplimiento</span></div>
        </div>
        <div class="so-sist" style="margin-top:14px">
          ${S().porSistema('todos', r, 'tnr').filter(s => s.total).map(s => `
            <div class="so-sist-row">
              <span class="so-sys" style="--c:${s.color}">${esc(s.corto)}</span>
              ${barra(s.pct, s.color)}
              <em>${s.hechas}/${s.total}</em>
            </div>`).join('')}
        </div>
      </section>

      <section class="panel so-panel">
        <div class="panel-title">${icon('trending-up', 16)} De la prospección a la facturación · ${r.label}</div>
        <div class="so-funnel">
          ${emb.map(e => `<div class="so-funnel-row">
            <span class="so-funnel-lbl">${esc(e.label)}</span>
            <div class="so-funnel-bar"><div style="width:${e.w}%;background:${e.color}"></div></div>
            <strong>${e.valorTxt}</strong>
          </div>`).join('')}
        </div>
        <p class="so-note">Sale de lo que ya se carga: las tareas con contador, los prospectos contactados, el calendario y la facturación de clientes.</p>
      </section>
    `;
  }

  /* Embudo comercial. No inventa datos: cada escalón sale de algo que el CRM
     ya registra. Sirve para ver dónde se corta la cadena. */
  function embudo(r) {
    const conts = S().contadores('todos', r, 'tnr');
    const mensajes = conts.filter(c => ['mensajes', 'mails', 'contactos'].includes(c.unidad)).reduce((a, c) => a + c.hecho, 0);
    const dentro = (iso) => iso && S().enRango(String(iso).slice(0, 10), r);
    const ps = DB.getProspectos();
    const contactados = ps.filter(p => dentro(p.ultimoContacto)).length;
    const reuniones = DB.getEventos().filter(e => dentro(e.fecha) && (e.tipo === 'reunion' || e.tipo === 'llamada')).length;
    const demos = ps.filter(p => /demo/i.test(p.estado || '') && dentro(p.ultimoContacto || p.fechaCreacion)).length;
    const clientes = DB.getClientes().filter(c => dentro(c.fechaCreacion)).length;
    let fact = 0;
    DB.getClientes().forEach(c => (c.pagos || []).forEach(p => { if (dentro(p.fecha)) fact += (+p.monto || 0); }));

    const filas = [
      { label: 'Mensajes enviados', valor: mensajes, color: '#1C9FE2' },
      { label: 'Prospectos tocados', valor: contactados, color: '#3fb5ee' },
      { label: 'Reuniones y llamadas', valor: reuniones, color: '#7c5cff' },
      { label: 'Demos', valor: demos, color: '#f59e42' },
      { label: 'Clientes nuevos', valor: clientes, color: '#3ecf8e' },
      { label: 'Cobrado', valor: fact, money: true, color: '#f5c451' },
    ];
    const max = Math.max(1, ...filas.filter(f => !f.money).map(f => f.valor));
    return filas.map(f => ({
      ...f,
      w: f.money ? (fact > 0 ? 100 : 0) : Math.round(f.valor / max * 100),
      valorTxt: f.money ? '$' + Number(f.valor).toLocaleString('es-AR') : String(f.valor),
    }));
  }

  /* ============================================================
     VISTA · RUTINAS (configuración)
     ============================================================ */
  function renderRutinas() {
    const rs = DB.getRutinas();
    host.innerHTML = `
      <div class="so-head">
        <div><h1>Rutinas</h1><div class="sub">Lo que se repite solo. ${rs.filter(r => r.activa).length} activas.</div></div>
        <div class="head-actions"><button class="btn-primary" onclick="SO.nuevaRutina()">${icon('plus')}<span class="btn-label"> Nueva</span></button></div>
      </div>
      <p class="so-note so-note-top">Una rutina no es una tarea: es la regla. El CRM fabrica la tarea de cada día automáticamente, para cada persona, y la cuenta en productividad. Si algo dejó de hacerse, pausala en vez de borrarla — así no se pierde el historial.</p>
      ${DB.SISTEMAS.map(s => {
        const list = rs.filter(r => r.sistema === s.id);
        if (!list.length) return '';
        return `<section class="so-block"><h2><span class="so-sys" style="--c:${s.color}">${esc(s.label)}</span></h2>${list.map(filaRutina).join('')}</section>`;
      }).join('')}
      ${!rs.length ? `<div class="empty"><div class="e-ic">${icon('repeat', 40)}</div><h3>Sin rutinas</h3><p>Cargá acá lo que se hace todos los días.</p><button class="btn-primary" onclick="SO.nuevaRutina()">${icon('plus')} Crear</button></div>` : ''}
    `;
  }

  function filaRutina(r) {
    const dias = (r.dias || []).length === 7 ? 'Todos los días'
      : JSON.stringify((r.dias || []).slice().sort()) === JSON.stringify([1, 2, 3, 4, 5, 6]) ? 'Lunes a sábado'
      : JSON.stringify((r.dias || []).slice().sort()) === JSON.stringify([1, 2, 3, 4, 5]) ? 'Lunes a viernes'
      : (r.dias || []).slice().sort().map(d => DB.DIAS_CORTOS[d]).join(' · ') || 'Sin días';
    const quienTxt = r.responsable === 'ambos' ? 'Cada uno' : DB.responsableDe(r.responsable).corto;
    return `<article class="so-rutina${r.activa ? '' : ' off'}">
      <div class="so-rutina-body" onclick="SO.editarRutina('${r.id}')">
        <div class="so-task-title">${esc(r.titulo)}</div>
        <div class="so-task-meta">
          <span class="so-meta-x">${esc(dias)}</span>
          ${r.turno ? `<span class="so-meta-x">${esc(r.turno)}</span>` : ''}
          <span class="so-meta-x">${esc(quienTxt)}</span>
          ${+r.objetivo ? `<span class="so-meta-x">${r.objetivo} ${esc(DB.unidadCorta(r.unidad))}</span>` : ''}
        </div>
      </div>
      <label class="so-toggle" title="${r.activa ? 'Pausar' : 'Activar'}">
        <input type="checkbox" ${r.activa ? 'checked' : ''} onchange="SO.toggleRutina('${r.id}', this.checked)" />
        <span></span>
      </label>
    </article>`;
  }

  /* ============================================================
     VISTA · RECORDATORIOS
     ============================================================ */
  function renderAvisos() {
    const uid = yo();
    const cfg = DB.getAjustes(uid);
    const permiso = window.Recordatorios ? Recordatorios.estadoPermiso() : 'no-soportado';
    const conHora = DB.getRutinas().filter(r => r.recordarHora);
    const estado = {
      'granted': { txt: 'Activadas en este dispositivo', color: 'var(--green)', ic: 'check' },
      'denied': { txt: 'Bloqueadas en este navegador', color: 'var(--red)', ic: 'alert' },
      'default': { txt: 'Sin activar en este dispositivo', color: 'var(--orange)', ic: 'bell' },
      'no-soportado': { txt: 'Este navegador no soporta avisos', color: 'var(--text-faint)', ic: 'alert' },
    }[permiso];

    host.innerHTML = `
      <div class="so-head">
        <div><h1>Recordatorios</h1><div class="sub">A qué hora querés que te avise el celular</div></div>
      </div>

      <section class="panel so-panel">
        <div class="panel-title" style="color:${estado.color}">${icon(estado.ic, 16)} ${estado.txt}</div>
        <p style="margin:0 0 12px;font-size:13px;color:var(--text-dim);line-height:1.55">
          Hay que activarlas <strong>una vez en cada aparato</strong> (el celular y la compu son dos permisos distintos).
          Para que lleguen con la app cerrada, en el celular conviene instalar el CRM como aplicación:
          en el navegador, menú → “Agregar a pantalla de inicio”.
        </p>
        ${permiso === 'denied'
          ? `<p class="so-note" style="margin:0">Están bloqueadas: hay que habilitarlas desde el candado de la barra de direcciones y recargar.</p>`
          : `<button class="btn-primary" onclick="SO.activarAvisos()">${icon('bell')} ${permiso === 'granted' ? 'Volver a registrar este dispositivo' : 'Activar en este dispositivo'}</button>`}
      </section>

      <section class="panel so-panel">
        <div class="panel-title">${icon('clock', 16)} Los tres avisos del día · ${esc(nombreDe(uid))}</div>
        <form id="soFormAvisos">
          <label class="so-linea">
            <span><strong>Recibir recordatorios</strong><em>Si lo apagás, no llega ninguno.</em></span>
            <span class="so-toggle"><input type="checkbox" name="avisos" ${cfg.avisos ? 'checked' : ''} /><span></span></span>
          </label>
          <div class="so-horas">
            <label class="field"><span>A la mañana</span><input type="time" name="manana" value="${esc(cfg.manana || '')}" />
              <em>“Tenés 10 tareas hoy: 15 mails, 20 contactos…”</em></label>
            <label class="field"><span>A la tarde</span><input type="time" name="tarde" value="${esc(cfg.tarde || '')}" />
              <em>“Te faltan 4 de 10.”</em></label>
            <label class="field"><span>Al cerrar el día</span><input type="time" name="cierre" value="${esc(cfg.cierre || '')}" />
              <em>“Marcá lo que hiciste.”</em></label>
          </div>
          <label class="so-linea">
            <span><strong>Avisar tarea por tarea</strong><em>Sólo las que tengan hora propia cargada.</em></span>
            <span class="so-toggle"><input type="checkbox" name="avisarTareas" ${cfg.avisarTareas ? 'checked' : ''} /><span></span></span>
          </label>
          <div class="form-foot" style="border:0;padding-top:14px">
            <button type="button" class="btn-secondary" onclick="SO.probarAviso()">${icon('bell')} Probar ahora</button>
            <button type="submit" class="btn-primary">Guardar horarios</button>
          </div>
        </form>
        <p class="so-note">Dejá una hora vacía para apagar ese aviso. Los horarios son tuyos: Santiago tiene los suyos.</p>
      </section>

      <section class="panel so-panel">
        <div class="panel-title">${icon('repeat', 16)} Rutinas con hora propia</div>
        ${conHora.length
          ? conHora.map(r => `<div class="so-linea" style="cursor:pointer" onclick="SO.editarRutina('${r.id}')">
              <span><strong>${esc(r.titulo)}</strong><em>${esc(DB.responsableDe(r.responsable === 'ambos' ? 'equipo' : r.responsable).corto)}</em></span>
              <strong style="font-variant-numeric:tabular-nums">${esc(r.recordarHora)}</strong>
            </div>`).join('')
          : `<p style="margin:0;font-size:13px;color:var(--text-dim)">Ninguna rutina tiene hora propia todavía. Se le pone desde
             <button class="btn-ghost" style="display:inline-flex;width:auto;padding:4px 10px" onclick="SO.ir('rutinas')">Rutinas</button>,
             en el campo “Avisarme a las”.</p>`}
      </section>
    `;

    document.getElementById('soFormAvisos').onsubmit = e => {
      e.preventDefault();
      const f = e.target;
      DB.guardarAjustes(uid, {
        avisos: f.avisos.checked,
        avisarTareas: f.avisarTareas.checked,
        manana: f.manana.value,
        tarde: f.tarde.value,
        cierre: f.cierre.value,
      });
      toast('Horarios guardados', 'ok');
      refrescar();
    };
  }

  /* ============================================================
     VISTA · MI SEMANA (la agenda de bloques fijos)
     ============================================================ */
  function renderAgenda() {
    const uid = yo();
    const agenda = DB.getAgenda(uid);
    const horas = S().horasSemana(uid);
    const ch = S().choques(uid);
    const hoyD = S().diaSemana(S().hoy());
    const dias = [1, 2, 3, 4, 5, 6, 0];   // arranca en lunes, el domingo al final
    const NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    host.innerHTML = `
      <div class="so-head">
        <div><h1>Mi semana</h1><div class="sub">Los horarios fijos: colegio, entrenamiento, club y el rato de TNR</div></div>
        <div class="head-actions"><button class="btn-primary" onclick="SO.nuevoBloque()">${icon('plus')}<span class="btn-label"> Bloque</span></button></div>
      </div>

      <p class="so-note-top">Esto <strong>no son tareas</strong>: son las franjas del día, las que van sí o sí. No se marcan
      ni cuentan para el cumplimiento — están para saber qué toca ahora y para ver dónde entra el trabajo en un día que ya
      viene lleno. Sólo las ve ${esc(nombreDe(uid))}.</p>

      ${horas.length ? `
      <section class="panel so-panel">
        <div class="panel-title">${icon('clock', 16)} Cuántas horas por semana</div>
        <div class="so-horas-sem">
          ${horas.map(x => `<div class="so-hora-item" style="--c:${x.color}">
            <strong>${x.horas} h</strong><span>${esc(x.label)}</span></div>`).join('')}
        </div>
        <p class="so-note">Es la cuenta de lo que cargaste, no una promesa. Si el número de TNR no cierra con lo que
        querés facturar, el problema está acá y no en las ganas.</p>
      </section>` : ''}

      ${ch.length ? `
      <div class="panel so-panel" style="border-color:var(--yellow)">
        <div class="panel-title" style="color:var(--yellow)">${icon('alert', 16)} Hay ${ch.length} horario${ch.length > 1 ? 's' : ''} pisado${ch.length > 1 ? 's' : ''}</div>
        ${ch.map(c => `<div style="font-size:13px;margin-bottom:6px">${DB.DIAS_CORTOS[c.dia]}: <strong>${esc(c.a.titulo)}</strong>
          (hasta ${esc(c.a.hasta)}) se pisa con <strong>${esc(c.b.titulo)}</strong> (desde ${esc(c.b.desde)})</div>`).join('')}
      </div>` : ''}

      ${dias.map(d => {
        const list = agenda.filter(b => (b.dias || []).includes(d))
          .sort((x, y) => (S().aMin(x.desde) || 0) - (S().aMin(y.desde) || 0));
        const totalTnr = list.filter(b => b.tipo === 'tnr').reduce((a, b) => a + S().dur(b), 0);
        const etiqueta = totalTnr ? (totalTnr / 60).toFixed(1).replace('.0', '') + ' h de TNR'
          : list.length ? list.length + ' bloques' : '';
        return `<section class="so-block">
          <h2>${NOMBRES[d]}${d === hoyD ? ' <span class="so-hoy-tag">hoy</span>' : ''}
            <span class="so-block-count">${etiqueta}</span></h2>
          ${list.length ? `<div class="so-linea-dia">${list.map(b => {
            const t = DB.tipoBloque(b.tipo);
            return `<div class="so-tramo" style="--c:${t.color}" onclick="SO.editarBloque('${b.id}')">
              <span class="so-tramo-h">${esc(b.desde)}<em>${esc(b.hasta)}</em></span>
              <span class="so-tramo-b"><strong>${esc(b.titulo)}</strong>${b.nota ? `<em>${esc(b.nota)}</em>` : ''}</span>
            </div>`;
          }).join('')}</div>`
            : `<div class="muted" style="font-size:12.5px;padding:6px 2px">Día libre.
               <button class="btn-ghost" style="display:inline-flex;width:auto;padding:4px 10px;margin-left:6px"
                 onclick="SO.nuevoBloque({dias:[${d}]})">Agregar algo</button></div>`}
        </section>`;
      }).join('')}
    `;
  }

  function formBloque(b) {
    b = b || {};
    const dias = b.dias || [];
    return `<form id="soFormBloque"><div class="form-grid">
      <div class="field full"><label>¿Qué es?</label><input name="titulo" value="${esc(b.titulo || '')}" placeholder="Ej: Colegio · Entrenamiento · TNR" /></div>
      <div class="field"><label>Tipo</label><select name="tipo">${DB.TIPOS_BLOQUE.map(t => `<option value="${t.id}" ${b.tipo === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>
      <div class="field"><label>Desde</label><input type="time" name="desde" value="${esc(b.desde || '')}" required /></div>
      <div class="field"><label>Hasta</label><input type="time" name="hasta" value="${esc(b.hasta || '')}" required /></div>
      <div class="field full"><label>Días</label>
        <div class="so-days">${DB.DIAS_CORTOS.map((d, i) => `
          <label class="so-day"><input type="checkbox" data-dia="${i}" ${dias.includes(i) ? 'checked' : ''} /><span>${d}</span></label>`).join('')}</div>
        <div class="so-days-quick">
          <button type="button" onclick="SO.diasBloque('lunvie')">Lun a vie</button>
          <button type="button" onclick="SO.diasBloque('lunsab')">Lun a sáb</button>
          <button type="button" onclick="SO.diasBloque('finde')">Fin de semana</button>
          <button type="button" onclick="SO.diasBloque('todos')">Todos</button>
        </div>
      </div>
      <div class="field full"><label>Nota (opcional)</label><input name="nota" value="${esc(b.nota || '')}" placeholder="Ej: Argentino Castelar" /></div>
    </div>
    <div class="form-foot">
      ${b.id ? `<button type="button" class="btn-ghost danger" onclick="SO.borrarBloque('${b.id}')">${icon('trash')} Eliminar</button>` : ''}
      <button type="button" class="btn-secondary" onclick="TNRUI.closeModal()">Cancelar</button>
      <button type="submit" class="btn-primary">${b.id ? 'Guardar' : 'Agregar'}</button>
    </div></form>`;
  }

  function leerBloque() {
    const d = leer('soFormBloque');
    d.dias = [];
    document.querySelectorAll('#soFormBloque [data-dia]').forEach(el => { if (el.checked) d.dias.push(+el.dataset.dia); });
    return d;
  }
  // Un bloque tiene que tener nombre, empezar antes de terminar y ocurrir algún día.
  function validarBloque(d) {
    if (!d.titulo) return 'Ponele un nombre.';
    if (!d.desde || !d.hasta) return 'Faltan las horas.';
    if (S().aMin(d.hasta) <= S().aMin(d.desde)) return 'La hora de fin tiene que ser posterior a la de inicio.';
    if (!d.dias.length) return 'Elegí al menos un día.';
    return '';
  }

  /* ============================================================
     FORMULARIOS
     ============================================================ */
  function optsResp(sel, conAmbos) {
    const list = [...DB.RESPONSABLES.map(r => ({ id: r.id, n: r.corto })), { id: 'equipo', n: 'Compartida (la hace cualquiera)' }];
    if (conAmbos) list.splice(2, 0, { id: 'ambos', n: 'Cada uno la suya' });
    return list.map(o => `<option value="${o.id}" ${sel === o.id ? 'selected' : ''}>${esc(o.n)}</option>`).join('');
  }
  function optsSistema(sel) {
    return `<option value="">Sin sistema</option>` + DB.SISTEMAS.map(s => `<option value="${s.id}" ${sel === s.id ? 'selected' : ''}>${esc(s.label)}</option>`).join('');
  }
  function optsProyecto(sel) {
    return `<option value="">Sin proyecto</option>` + DB.getProyectos().map(p => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('');
  }
  function optsUnidad(sel) {
    return DB.UNIDADES.map(u => `<option value="${u.id}" ${sel === u.id ? 'selected' : ''}>${esc(u.label)}</option>`).join('');
  }
  function leer(formId) {
    const d = {};
    document.getElementById(formId).querySelectorAll('input,select,textarea').forEach(el => {
      if (el.type === 'checkbox') return;
      if (!el.name) return;
      d[el.name] = el.type === 'number' ? (+el.value || 0) : el.value.trim();
    });
    return d;
  }

  function formTarea(t) {
    t = t || {};
    return `<form id="soFormTarea"><div class="form-grid">
      <div class="field full"><label>¿Qué hay que hacer?</label><input name="titulo" value="${esc(t.titulo || '')}" placeholder="Ej: llamar a Thiago para cerrar el mes" /></div>
      <div class="field"><label>Quién</label><select name="responsable">${optsResp(t.responsable || foco())}</select></div>
      <div class="field"><label>Sistema</label><select name="sistema">${optsSistema(t.sistema || '')}</select></div>
      <div class="field"><label>Proyecto</label><select name="proyectoId">${optsProyecto(t.proyectoId || '')}</select></div>
      <div class="field"><label>Prioridad</label><select name="prioridad">${DB.PRIORIDADES_TAREA.map(p => `<option ${t.prioridad === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      <div class="field"><label>Fecha</label><input type="date" name="fecha" value="${esc(t.fecha || '')}" /></div>
      <div class="field"><label>Turno</label><select name="turno">${DB.TURNOS.map(x => `<option value="${x}" ${t.turno === x ? 'selected' : ''}>${x || 'Sin turno'}</option>`).join('')}</select></div>
      <div class="field"><label>Avisarme a las</label><input type="time" name="recordarHora" value="${esc(t.recordarHora || '')}" /></div>
      <div class="field"><label>Contador (opcional)</label><input type="number" min="0" name="objetivo" value="${+t.objetivo || ''}" placeholder="Ej: 15" /></div>
      <div class="field"><label>De qué</label><select name="unidad">${optsUnidad(t.unidad || '')}</select></div>
      <div class="field full"><label>Notas</label><textarea name="observaciones" rows="2">${esc(t.observaciones || '')}</textarea></div>
    </div>
    <div class="form-foot">
      ${t.id ? (t.rutinaId
        ? `<button type="button" class="btn-ghost danger" onclick="SO.descartar('${t.id}')">${icon('x')} Descartar</button>`
        : `<button type="button" class="btn-ghost danger" onclick="SO.borrarTarea('${t.id}')">${icon('trash')} Eliminar</button>`) : ''}
      <button type="button" class="btn-secondary" onclick="TNRUI.closeModal()">Cancelar</button>
      <button type="submit" class="btn-primary">${t.id ? 'Guardar' : 'Crear tarea'}</button>
    </div></form>`;
  }

  function formRutina(r) {
    r = r || {};
    const dias = r.dias || [1, 2, 3, 4, 5, 6];
    return `<form id="soFormRutina"><div class="form-grid">
      <div class="field full"><label>¿Qué se repite?</label><input name="titulo" value="${esc(r.titulo || '')}" placeholder="Ej: Mundo Ferretero — 15 mails" /></div>
      <div class="field"><label>Quién</label><select name="responsable">${optsResp(r.responsable || 'ambos', true)}</select></div>
      <div class="field"><label>Sistema</label><select name="sistema">${optsSistema(r.sistema || 'prospeccion')}</select></div>
      <div class="field"><label>Proyecto</label><select name="proyectoId">${optsProyecto(r.proyectoId || '')}</select></div>
      <div class="field"><label>Turno</label><select name="turno">${DB.TURNOS.map(x => `<option value="${x}" ${r.turno === x ? 'selected' : ''}>${x || 'Sin turno'}</option>`).join('')}</select></div>
      <div class="field"><label>Avisarme a las</label><input type="time" name="recordarHora" value="${esc(r.recordarHora || '')}" /></div>
      <div class="field"><label>Cuánto</label><input type="number" min="0" name="objetivo" value="${+r.objetivo || ''}" placeholder="Ej: 15" /></div>
      <div class="field"><label>De qué</label><select name="unidad">${optsUnidad(r.unidad || '')}</select></div>
      <div class="field"><label>Prioridad</label><select name="prioridad">${DB.PRIORIDADES_TAREA.map(p => `<option ${(r.prioridad || 'Media') === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      <div class="field full"><label>Días</label>
        <div class="so-days">${DB.DIAS_CORTOS.map((d, i) => `
          <label class="so-day"><input type="checkbox" data-dia="${i}" ${dias.includes(i) ? 'checked' : ''} /><span>${d}</span></label>`).join('')}</div>
        <div class="so-days-quick">
          <button type="button" onclick="SO.diasRapido('lunsab')">Lun a sáb</button>
          <button type="button" onclick="SO.diasRapido('lunvie')">Lun a vie</button>
          <button type="button" onclick="SO.diasRapido('todos')">Todos</button>
        </div>
      </div>
      <div class="field full"><label>Notas</label><textarea name="observaciones" rows="2">${esc(r.observaciones || '')}</textarea></div>
    </div>
    <div class="form-foot">
      ${r.id ? `<button type="button" class="btn-ghost danger" onclick="SO.borrarRutina('${r.id}')">${icon('trash')} Eliminar</button>` : ''}
      <button type="button" class="btn-secondary" onclick="TNRUI.closeModal()">Cancelar</button>
      <button type="submit" class="btn-primary">${r.id ? 'Guardar' : 'Crear rutina'}</button>
    </div></form>`;
  }

  function leerDias() {
    const out = [];
    document.querySelectorAll('#soFormRutina [data-dia]').forEach(el => { if (el.checked) out.push(+el.dataset.dia); });
    return out;
  }

  function formProyecto(p) {
    p = p || {};
    return `<form id="soFormProyecto"><div class="form-grid">
      <div class="field full"><label>Nombre</label><input name="nombre" value="${esc(p.nombre || '')}" placeholder="Ej: MC E-Bike" /></div>
      <div class="field"><label>Sistema</label><select name="sistema">${optsSistema(p.sistema || 'gestion')}</select></div>
      <div class="field"><label>Quién</label><select name="responsable">${optsResp(p.responsable || 'equipo')}</select></div>
      <div class="field"><label>Estado</label><select name="estado">${DB.ESTADOS_PROYECTO.map(e => `<option ${(p.estado || 'Activo') === e ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
      <div class="field"><label>Fecha objetivo</label><input type="date" name="fechaObjetivo" value="${esc(p.fechaObjetivo || '')}" /></div>
      <div class="field full"><label>Objetivo</label><input name="objetivo" value="${esc(p.objetivo || '')}" placeholder="En una línea: qué tiene que pasar para darlo por hecho" /></div>
      <div class="field full"><label>Notas</label><textarea name="notas" rows="3">${esc(p.notas || '')}</textarea></div>
    </div><div class="form-foot">
      <button type="button" class="btn-secondary" onclick="TNRUI.closeModal()">Cancelar</button>
      <button type="submit" class="btn-primary">${p.id ? 'Guardar' : 'Crear proyecto'}</button>
    </div></form>`;
  }

  /* ============================================================
     ACCIONES
     ============================================================ */
  function refrescar() { render(host, vista); }

  const SO = {
    ir(v) { if (window.TNRUI && TNRUI.setView) TNRUI.setView(v); },
    verPersona(id) { quien = id; filtros.resp = id; refrescar(); },
    filtrar(k, v) { filtros[k] = v; if (k === 'resp') quien = v; refrescar(); },
    filtrarProyectos(s) { sistemaProyectos = s; refrescar(); },

    nuevoBloque(prefill) {
      openModal('Nuevo bloque', formBloque(Object.assign({ tipo: 'colegio', dias: [1, 2, 3, 4, 5] }, prefill || {})));
      document.getElementById('soFormBloque').onsubmit = e => {
        e.preventDefault();
        const d = leerBloque();
        const err = validarBloque(d);
        if (err) { toast(err, 'err'); return; }
        const uid = yo();
        const agenda = DB.getAgenda(uid).slice();
        agenda.push(Object.assign({ id: 'BL-' + Math.random().toString(36).slice(2, 9) }, d));
        DB.guardarAgenda(uid, agenda);
        closeModal(); toast('Bloque agregado', 'ok'); refrescar();
      };
    },
    editarBloque(id) {
      const uid = yo();
      const b = DB.getAgenda(uid).find(x => x.id === id);
      if (!b) return;
      openModal('Editar bloque', formBloque(b));
      document.getElementById('soFormBloque').onsubmit = e => {
        e.preventDefault();
        const d = leerBloque();
        const err = validarBloque(d);
        if (err) { toast(err, 'err'); return; }
        DB.guardarAgenda(uid, DB.getAgenda(uid).map(x => x.id === id ? Object.assign({}, x, d) : x));
        closeModal(); toast('Guardado', 'ok'); refrescar();
      };
    },
    borrarBloque(id) {
      closeModal();
      const uid = yo();
      confirmDialog('Eliminar bloque', '¿Sacarlo de tu semana?', 'Eliminar', () => {
        DB.guardarAgenda(uid, DB.getAgenda(uid).filter(x => x.id !== id));
        refrescar();
      }, true);
    },
    diasBloque(k) {
      const mapa = { lunvie: [1, 2, 3, 4, 5], lunsab: [1, 2, 3, 4, 5, 6], finde: [0, 6], todos: [0, 1, 2, 3, 4, 5, 6] };
      const sel = mapa[k] || [];
      document.querySelectorAll('#soFormBloque [data-dia]').forEach(el => { el.checked = sel.includes(+el.dataset.dia); });
    },

    async activarAvisos() {
      if (!window.Recordatorios) return;
      const r = await Recordatorios.pedirPermiso();
      if (!r.ok) { toast(r.motivo, 'err'); refrescar(); return; }
      toast(r.push ? 'Listo: también llegan con la app cerrada' : 'Listo: llegan con la app abierta', 'ok');
      Recordatorios.arrancar();
      refrescar();
    },
    probarAviso() {
      if (!window.Recordatorios) return;
      if (Recordatorios.estadoPermiso() !== 'granted') { toast('Primero activá las notificaciones', 'err'); return; }
      const opts = { body: 'Si ves esto, los recordatorios funcionan en este aparato.', icon: 'favicon.png', badge: 'favicon.png', tag: 'tnr-prueba' };
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(reg => reg.showNotification('TNR · Prueba', opts))
          .catch(() => { try { new Notification('TNR · Prueba', opts); } catch (_) {} });
      } else { try { new Notification('TNR · Prueba', opts); } catch (_) {} }
      toast('Aviso de prueba enviado', 'ok');
    },
    rango(k) { rangoProd = k; refrescar(); },

    completar(id) {
      const t = DB.getTarea(id);
      if (!t) return;
      // Si estaba descartada, el toque la trae de vuelta: descartar no es
      // definitivo, es "hoy no" — y uno puede arrepentirse.
      if (S().esDescartada(t)) { DB.actualizarTarea(id, { estado: 'Pendiente' }); toast('Vuelve a contar', 'ok'); refrescar(); return; }
      if (S().esHecha(t)) DB.actualizarTarea(id, { estado: 'Pendiente', avance: 0 });
      else DB.actualizarTarea(id, { estado: 'Finalizada', avance: Math.max(+t.avance || 0, +t.objetivo || 0) });
      refrescar();
    },
    sumar(id, d) { DB.sumarAvance(id, d); refrescar(); },
    editarAvance(id) {
      const t = DB.getTarea(id); if (!t) return;
      openModal(t.titulo, `<form id="soFormAvance"><div class="field">
          <label>¿Cuántos ${esc(DB.unidadCorta(t.unidad) || 'hiciste')}?</label>
          <input type="number" inputmode="numeric" min="0" name="avance" value="${+t.avance || 0}" autofocus />
          <span class="muted" style="font-size:12px">El objetivo del día es ${+t.objetivo || 0}.</span>
        </div><div class="form-foot">
          <button type="button" class="btn-secondary" onclick="TNRUI.closeModal()">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar</button></div></form>`);
      document.getElementById('soFormAvance').onsubmit = e => {
        e.preventDefault();
        const v = Math.max(0, +leer('soFormAvance').avance || 0);
        DB.sumarAvance(id, v - (+t.avance || 0));
        closeModal(); refrescar();
      };
    },

    nuevaTarea(prefill) {
      openModal('Nueva tarea', formTarea(Object.assign({ prioridad: 'Media', fecha: S().hoy() }, prefill || {})));
      document.getElementById('soFormTarea').onsubmit = e => {
        e.preventDefault();
        const d = leer('soFormTarea');
        if (!d.titulo) { toast('Ponele un título', 'err'); return; }
        DB.crearTarea(d); closeModal(); toast('Tarea creada', 'ok'); refrescar();
      };
    },
    abrirTarea(id) {
      const t = DB.getTarea(id); if (!t) return;
      const esRutina = !!t.rutinaId;
      openModal(esRutina ? 'Tarea de rutina' : 'Editar tarea', formTarea(t) +
        (esRutina ? `<p class="so-note"><strong>Descartar</strong> saca esta tarea de la vista y de los números: no cuenta como hecha
          ni como pendiente. Se usa para el día que no se pudo y ya está. La rutina sigue igual: mañana vuelve a aparecer.
          Si querés dejar de hacerla del todo, pausá la rutina.
          <button class="btn-ghost" style="margin-top:8px" onclick="TNRUI.closeModal();SO.editarRutina('${t.rutinaId}')">${icon('repeat', 13)} Ir a la rutina</button></p>` : ''));
      document.getElementById('soFormTarea').onsubmit = e => {
        e.preventDefault();
        DB.actualizarTarea(id, leer('soFormTarea')); closeModal(); toast('Guardado', 'ok'); refrescar();
      };
    },
    descartar(id) {
      closeModal();
      const t = DB.getTarea(id); if (!t) return;
      confirmDialog('Descartar tarea',
        'Sale de la vista y de los números: no cuenta como hecha ni como pendiente. La rutina sigue andando y mañana vuelve a aparecer.',
        'Descartar', () => { DB.actualizarTarea(id, { estado: DB.ESTADO_DESCARTADA }); toast('Descartada', 'ok'); refrescar(); });
    },
    descartarAtrasadas(persona, ambito) {
      const cuantas = S().tareasDe({
        resp: persona, ambito: ambito || 'tnr',
        rango: { desde: '0000-01-01', hasta: S().sumarDias(S().hoy(), -1) },
      }).filter(t => !S().esHecha(t)).length;
      if (!cuantas) { toast('No hay nada atrasado', 'ok'); return; }
      confirmDialog('Descartar lo atrasado',
        'Son ' + cuantas + ' tarea' + (cuantas > 1 ? 's' : '') + ' de días anteriores que no se hicieron. Salen de la vista y de los números. Lo de hoy no se toca.',
        'Descartar ' + cuantas, () => {
          const n = S().descartarAtrasadas(persona, ambito || 'tnr');
          toast(n + ' descartada' + (n > 1 ? 's' : ''), 'ok');
          refrescar();
        });
    },
    borrarTarea(id) {
      closeModal();
      confirmDialog('Eliminar tarea', '¿Seguro? Se borra del historial de cumplimiento.', 'Eliminar', () => { DB.eliminarTarea(id); refrescar(); }, true);
    },

    nuevaRutina() {
      openModal('Nueva rutina', formRutina({}));
      document.getElementById('soFormRutina').onsubmit = e => {
        e.preventDefault();
        const d = leer('soFormRutina'); d.dias = leerDias();
        if (!d.titulo) { toast('Ponele un título', 'err'); return; }
        if (!d.dias.length) { toast('Elegí al menos un día', 'err'); return; }
        DB.crearRutina(d); S().generarTareas(); closeModal(); toast('Rutina creada', 'ok'); refrescar();
      };
    },
    editarRutina(id) {
      const r = DB.getRutina(id); if (!r) return;
      openModal('Editar rutina', formRutina(r));
      document.getElementById('soFormRutina').onsubmit = e => {
        e.preventDefault();
        const d = leer('soFormRutina'); d.dias = leerDias();
        if (!d.dias.length) { toast('Elegí al menos un día', 'err'); return; }
        DB.actualizarRutina(id, d);
        S().sincronizarRutina(id);   // el cambio se ve hoy, no mañana
        S().generarTareas();
        closeModal(); toast('Rutina guardada', 'ok'); refrescar();
      };
    },
    toggleRutina(id, activa) {
      DB.actualizarRutina(id, { activa: !!activa });
      S().sincronizarRutina(id);   // al pausarla, se retiran las de hoy sin empezar
      if (activa) S().generarTareas();
      toast(activa ? 'Rutina activada' : 'Rutina pausada', 'ok');
      refrescar();
    },
    borrarRutina(id) {
      closeModal();
      confirmDialog('Eliminar rutina', 'Las tareas ya hechas quedan como historial, pero la rutina no vuelve a generar nada. Si es algo temporal, mejor pausala.', 'Eliminar', () => { DB.eliminarRutina(id); refrescar(); }, true);
    },
    diasRapido(k) {
      const mapa = { lunsab: [1, 2, 3, 4, 5, 6], lunvie: [1, 2, 3, 4, 5], todos: [0, 1, 2, 3, 4, 5, 6] };
      const sel = mapa[k] || [];
      document.querySelectorAll('#soFormRutina [data-dia]').forEach(el => { el.checked = sel.includes(+el.dataset.dia); });
    },

    nuevoProyecto() {
      openModal('Nuevo proyecto', formProyecto({}));
      document.getElementById('soFormProyecto').onsubmit = e => {
        e.preventDefault();
        const d = leer('soFormProyecto');
        if (!d.nombre) { toast('Ponele un nombre', 'err'); return; }
        DB.crearProyecto(d); closeModal(); toast('Proyecto creado', 'ok'); refrescar();
      };
    },
    editarProyecto(id) {
      const p = DB.getProyecto(id); if (!p) return;
      openModal('Editar proyecto', formProyecto(p));
      document.getElementById('soFormProyecto').onsubmit = e => {
        e.preventDefault();
        DB.actualizarProyecto(id, leer('soFormProyecto')); closeModal(); toast('Guardado', 'ok'); refrescar();
      };
    },
    abrirProyecto(id) { proyectoAbierto = id; if (vista !== 'proyectos') return SO.ir('proyectos'); refrescar(); },
    cerrarProyecto() { proyectoAbierto = null; refrescar(); },
    borrarProyecto(id) {
      confirmDialog('Eliminar proyecto', 'Las tareas del proyecto NO se borran: quedan sueltas en Tareas.', 'Eliminar', () => {
        DB.eliminarProyecto(id); proyectoAbierto = null; refrescar();
      }, true);
    },
  };
  window.SO = SO;

  /* ============================================================
     ENTRADA
     ============================================================ */
  function render(destino, cual) {
    host = destino || host;
    vista = cual || vista;
    if (!window.Sistema || !window.DB) {
      host.innerHTML = '<div class="empty"><h3>No cargó el sistema</h3><p>Recargá la página.</p></div>';
      return;
    }
    if (vista !== 'proyectos') proyectoAbierto = null;
    if (vista === 'tareas') return renderTareas();
    if (vista === 'proyectos') return renderProyectos();
    if (vista === 'productividad') return renderProductividad();
    if (vista === 'rutinas') return renderRutinas();
    if (vista === 'avisos') return renderAvisos();
    if (vista === 'agenda') return renderAgenda();
    return renderHoy();
  }

  window.SOVista = { render, get vistaActual() { return vista; } };
})();
