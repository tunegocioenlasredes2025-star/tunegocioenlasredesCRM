/* ============================================================
   TNR · Controlador de UI
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Helpers DOM ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const view = $('#view');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function fmtMoney(n) { return '$' + Number(n || 0).toLocaleString('es-AR'); }
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  // OJO: acá había un toISOString(), que da la fecha de Londres. Después de
  // las 21:00 de Argentina el CRM ya creía que era el día siguiente y todo lo
  // marcado de noche se contaba mañana. Ahora usa el reloj local (sistema.js).
  function todayStr() { return window.Sistema ? Sistema.hoy() : (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })(); }
  function daysUntil(iso) {
    if (!iso) return null;
    const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
    const t = new Date(todayStr() + 'T00:00:00');
    return Math.round((d - t) / 86400000);
  }

  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (kind ? ' ' + kind : '');
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.className = 'toast'; setTimeout(() => t.hidden = true, 250); }, 2600);
  }

  /* ---------- Modal ---------- */
  const overlay = $('#modalOverlay');
  function openModal(title, html) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    overlay.hidden = false;
  }
  function closeModal() { overlay.hidden = true; $('#modalBody').innerHTML = ''; }
  $('#modalClose').onclick = closeModal;
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) closeModal(); });

  // Diálogo de confirmación elegante (reemplaza a confirm() nativo)
  function confirmDialog(title, message, okLabel, onOk, danger) {
    openModal(title, `
      <div class="confirm-msg">${esc(message)}</div>
      <div class="form-foot">
        <button type="button" class="btn-secondary" id="confirmCancel">Cancelar</button>
        <button type="button" class="${danger ? 'btn-danger' : 'btn-primary'}" id="confirmOk">${esc(okLabel || 'Confirmar')}</button>
      </div>`);
    $('#confirmCancel').onclick = closeModal;
    $('#confirmOk').onclick = () => { closeModal(); onOk(); };
  }

  /* Helpers que usa el módulo de Campañas (campanas-vista.js). Se exponen
     acá para no tener dos versiones del mismo toast y del mismo modal. */
  window.TNRUI = {
    esc, toast, openModal, closeModal, confirmDialog, fmtDate, fmtDateTime, todayStr,
    setView: (v) => setView(v),
    render: () => render(),
  };

  /* ---------- Chips ---------- */
  function estadoChip(estado) {
    const c = DB.estadoColor(estado);
    return `<span class="chip" style="background:${c}22;color:${c}"><span class="chip-dot" style="background:${c}"></span>${esc(estado)}</span>`;
  }
  function canalChip(canal) {
    if (!canal) return '<span class="cell-dim">—</span>';
    const c = DB.canalColor(canal);
    return `<span class="chip" style="background:${c}22;color:${c}"><span class="chip-dot" style="background:${c}"></span>${esc(canal)}</span>`;
  }
  function oportunidadCell(v) {
    const n = Number(v);
    if (!n) return '<span class="cell-dim">—</span>';
    const c = n >= 85 ? '#3ecf8e' : n >= 70 ? '#f5c451' : '#8b94a8';
    return `<span class="opor-badge" style="color:${c};border-color:${c}55;background:${c}18">${n}</span>`;
  }
  // A/B/C es prioridad geográfica: A = pegado a la base, C = el borde de la zona que vale recorrer.
  function prioridadChip(p) {
    const map = { 'A': '#3ecf8e', 'B': '#f5c451', 'C': '#8b94a8' };
    const c = map[p] || '#8b94a8';
    return `<span class="chip chip-prio" style="background:${c}22;color:${c}"><span class="chip-dot" style="background:${c}"></span>${esc(p)}</span>`;
  }
  function tareaChip(e) {
    const map = { 'Pendiente': '#f59e42', 'En Curso': '#5b8cff', 'Finalizada': '#3ecf8e' };
    const c = map[e] || '#8b94a8';
    return `<span class="chip" style="background:${c}22;color:${c}"><span class="chip-dot" style="background:${c}"></span>${esc(e)}</span>`;
  }

  /* ---------- Estado de la app ---------- */
  let current = 'dashboard';
  let searchTerm = '';
  // Un filtro por decisión comercial y nada más: qué es, qué tan cerca está, dónde, cómo viene y por dónde se contacta.
  const pFilters = { q: '', tipo: '', subtipo: '', prioridad: '', ciudad: '', estado: '', metodo: '' };
  let pPage = 1;
  const PAGE = 50;

  /* ============================================================
     ROUTER
     ============================================================ */
  function setView(v) {
    current = v;
    searchTerm = '';
    $('#globalSearch').value = '';
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    render();
    closeSidebar();
  }
  function render() {
    if (searchTerm) return renderSearch();
    // Las pantallas del Sistema Operativo viven en so-vista.js.
    const SO_VIEWS = ['hoy', 'tareas', 'proyectos', 'productividad', 'rutinas', 'avisos'];
    if (SO_VIEWS.includes(current)) {
      if (window.SOVista) window.SOVista.render(view, current);
      else view.innerHTML = '<div class="empty"><h3>No cargó el módulo</h3><p>Recargá la página.</p></div>';
    } else {
      ({ dashboard: renderDashboard, prospectos: renderProspectos, clientes: renderClientes, campanas: renderCampanas, calendario: renderCalendario, metas: renderMetas, notificaciones: renderNotificaciones }[current] || renderHoyFallback)();
    }
    updateNotifBadge();
  }

  // Si alguien llega con una vista que ya no existe (un link viejo, la PWA
  // guardada), lo mandamos a Hoy en vez de mostrarle una pantalla en blanco.
  function renderHoyFallback() {
    current = 'hoy';
    if (window.SOVista) window.SOVista.render(view, 'hoy');
  }

  // Campañas vive en su propio archivo (campanas-vista.js) porque este ya
  // es grande. Si todavía no cargó, se avisa en vez de romper la pantalla.
  function renderCampanas() {
    if (window.CampanasVista) return window.CampanasVista.render(view);
    view.innerHTML = '<div class="empty"><h3>Campañas no disponible</h3><p>No se pudo cargar el módulo. Recargá la página.</p></div>';
  }

  $$('.nav-item').forEach(b => b.onclick = () => setView(b.dataset.view));

  /* ============================================================
     DASHBOARD
     ============================================================ */
  function renderDashboard() {
    const ps = DB.getProspectos();
    const cs = DB.getClientes();
    const count = (st) => ps.filter(p => p.estado === st).length;
    const interesados = ps.filter(p => ['Interesado', 'Reunión Agendada', 'Demo Enviada', 'Propuesta Enviada'].includes(p.estado)).length;
    const contactados = ps.filter(p => p.estado !== 'Prospecto').length;
    const reuniones = count('Reunión Agendada');
    const ganados = count('Ganado');
    const activos = cs.filter(c => c.estado === 'Activo').length;
    const inactivos = cs.length - activos;

    // INGRESOS (solo activos): proyección recurrente + facturado/cobrado de activos.
    // DEUDA (todos los clientes): para no perder de vista lo que te deben.
    let facMensual = 0, factActivos = 0, cobradoActivos = 0;       // solo activos
    let factTotal = 0, cobradoTotal = 0, adeudadoTotal = 0;        // todos
    let cAlDia = 0, cConDeuda = 0, cVencidos = 0;                  // todos
    cs.forEach(c => {
      const f = DB.finanzasCliente(c);
      factTotal += f.facturado;
      cobradoTotal += f.cobrado;
      if (f.saldo > 0) { adeudadoTotal += f.saldo; cConDeuda++; } else { cAlDia++; }
      if (f.estado === 'Vencido') cVencidos++;
      if (c.estado === 'Activo') {
        c.servicios.forEach(s => { if (s.recurrente) facMensual += s.precio; });
        factActivos += f.facturado;
        cobradoActivos += f.cobrado;
      }
    });

    // Producción
    let pend = 0, proc = 0, pub = 0;
    cs.forEach(c => c.contenidos.forEach(ct => {
      if (ct.estado === 'Publicado') pub++;
      else if (['En Diseño', 'En Revisión', 'Esperando Cliente', 'Aprobado', 'Programado'].includes(ct.estado)) proc++;
      else pend++;
    }));

    // Funnel
    const etapas = [
      { l: 'Prospectos', v: ps.length, c: '#8b94a8' },
      { l: 'Contactados', v: contactados, c: '#5b8cff' },
      { l: 'Interesados', v: interesados, c: '#7c5cff' },
      { l: 'Reuniones', v: reuniones, c: '#f472b6' },
      { l: 'Ganados', v: ganados, c: '#3ecf8e' },
    ];
    const maxF = Math.max(1, ...etapas.map(e => e.v));

    // Distribución de prospectos (Fase 5)
    const svcCount = {}; ps.forEach(p => (p.servicios || []).forEach(s => svcCount[s] = (svcCount[s] || 0) + 1));
    const svcRows = Object.entries(svcCount).sort((a, b) => b[1] - a[1]).map(([l, v]) => [l, v, '#1C9FE2']);
    const priColors = { Urgente: '#ff5d6c', Alta: '#f59e42', Media: '#5b8cff', Baja: '#8b94a8' };
    const priRows = ['Urgente', 'Alta', 'Media', 'Baja'].map(pr => [pr, ps.filter(p => p.prioridad === pr).length, priColors[pr]]).filter(r => r[1]);
    const topBy = (key) => { const m = {}; ps.forEach(p => { const k = p[key]; if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6); };
    const rubroRows = topBy('rubro').map(([l, v]) => [l, v, '#7c5cff']);
    const ciudadRows = topBy('ciudad').map(([l, v]) => [l, v, '#3fb5ee']);
    // Conversión: con una base grande de prospectos el porcentaje es chico (ej: 2 de 800
    // contactados = 0,25%). Si lo redondeamos a entero se ve "0%" y parece que los ganados
    // no cuentan, así que mostramos decimales cuando el número es bajo.
    const convNum = contactados ? ganados / contactados * 100 : 0;
    const conv = convNum === 0 ? '0'
      : convNum >= 10 ? String(Math.round(convNum))
        : convNum >= 1 ? convNum.toFixed(1).replace('.', ',')
          : convNum.toFixed(2).replace('.', ',');

    view.innerHTML = `
      <div class="view-head">
        <div><h1>Panel de prospectos</h1><div class="sub">La foto grande del comercial · ${fmtDate(todayStr())}</div></div>
        <div class="head-actions"><button class="btn-secondary" onclick="TNRUI.setView('hoy')">${icon('sun')}<span class="btn-label"> Ir a Hoy</span></button></div>
      </div>

      <div class="kpi-grid">
        ${kpi('Prospectos totales', ps.length, '#5b8cff', 'En base de datos')}
        ${kpi('Interesados', interesados, '#7c5cff', 'En pipeline activo')}
        ${kpi('Reuniones', reuniones, '#f472b6', 'Agendadas')}
        ${kpi('Ventas cerradas', ganados, '#3ecf8e', 'Prospectos ganados')}
        ${kpi('Conversión', conv + '%', convNum >= 20 ? '#3ecf8e' : '#f5c451', `${ganados} ganados de ${contactados} contactados`)}
      </div>

      <div class="grid-2" style="margin-bottom:16px">
        ${distPanel('Prospectos por servicio', svcRows)}
        <div class="panel">
          <div class="panel-title">Por prioridad</div>
          ${barChart(priRows)}
        </div>
      </div>
      <div class="grid-2" style="margin-bottom:16px">
        ${distPanel('Top rubros', rubroRows)}
        ${distPanel('Top ciudades', ciudadRows)}
      </div>

      <div class="grid-2" style="margin-bottom:16px">
        <div class="panel">
          <div class="panel-title">Embudo de ventas</div>
          <div class="funnel">
            ${etapas.map(e => `
              <div class="funnel-row">
                <div class="f-label">${e.l}</div>
                <div class="funnel-bar"><div class="funnel-fill" style="width:${(e.v / maxF * 100)}%;background:${e.c}"></div></div>
                <div class="f-val">${e.v}</div>
              </div>`).join('')}
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">Ingresos <span class="muted" style="font-weight:400;font-size:11px">solo clientes activos</span></div>
          <div class="kpi-grid" style="margin:0;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
            ${kpi('Clientes activos', activos, '#3ecf8e', inactivos ? inactivos + ' inactivos' : '')}
            ${kpi('Fact. mensual', fmtMoney(facMensual), '#f5c451', 'Recurrente')}
            ${kpi('Facturado activos', fmtMoney(factActivos), '#1466bd', 'Histórico')}
            ${kpi('Cobrado activos', fmtMoney(cobradoActivos), '#3ecf8e', 'Pagos recibidos')}
          </div>
        </div>
      </div>

      <div class="panel" style="margin-bottom:16px">
        <div class="panel-title">Facturación total <span class="muted" style="font-weight:400;font-size:11px">todos los clientes</span></div>
        <div class="kpi-grid" style="margin:0;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
          ${kpi('Facturación total', fmtMoney(factTotal), '#7c5cff', 'Todo lo facturado')}
          ${kpi('Cobrado total', fmtMoney(cobradoTotal), '#3ecf8e', 'Todo lo cobrado')}
          ${kpi('Adeudado total', fmtMoney(adeudadoTotal), adeudadoTotal > 0 ? '#ff5d6c' : '#3ecf8e', 'Saldo pendiente')}
        </div>
      </div>

      <div class="grid-2" style="margin-bottom:16px">
        ${kpiPanel('Estado de cobranza', [
          ['Al día', cAlDia, '#3ecf8e'], ['Con deuda', cConDeuda, '#f59e42'], ['Vencidos', cVencidos, '#ff5d6c'],
        ])}
        ${kpiPanel('Producción de contenido', [
          ['Pendientes', pend, '#f59e42'], ['En proceso', proc, '#1C9FE2'], ['Publicados', pub, '#3ecf8e'],
        ])}
      </div>

      <div class="grid-2">
        <div class="panel">
          <div class="panel-title">Seguimientos próximos</div>
          ${proximosSeguimientos(ps)}
        </div>
        <div class="panel">
          <div class="panel-title">Tareas pendientes</div>
          ${tareasPendientesMini()}
        </div>
      </div>
    `;
  }

  function kpi(label, val, color, sub) {
    return `<div class="kpi"><div class="k-label"><span class="k-dot" style="background:${color}"></span>${label}</div><div class="k-val">${val}</div>${sub ? `<div class="k-sub">${sub}</div>` : ''}</div>`;
  }
  function barChart(rows) {
    if (!rows || !rows.length) return '<div class="cell-dim" style="padding:8px 0">Sin datos</div>';
    const max = Math.max(1, ...rows.map(r => r[1]));
    return `<div class="funnel">${rows.map(r => `<div class="funnel-row"><div class="f-label" title="${esc(r[0])}">${esc(r[0])}</div><div class="funnel-bar"><div class="funnel-fill" style="width:${(r[1] / max * 100)}%;background:${r[2]}"></div></div><div class="f-val">${r[1]}</div></div>`).join('')}</div>`;
  }
  function distPanel(title, rows) {
    return `<div class="panel"><div class="panel-title">${title}</div>${barChart(rows)}</div>`;
  }
  function kpiPanel(title, rows) {
    return `<div class="panel"><div class="panel-title">${title}</div>
      <div style="display:flex;flex-direction:column;gap:14px">
      ${rows.map(([l, v, c]) => `<div class="flex" style="justify-content:space-between"><span class="muted">${l}</span><span style="font-size:22px;font-weight:700;color:${c}">${v}</span></div>`).join('')}
      </div></div>`;
  }
  function proximosSeguimientos(ps) {
    const list = ps.filter(p => p.fechaSeguimiento && !['Ganado', 'Perdido'].includes(p.estado))
      .sort((a, b) => a.fechaSeguimiento.localeCompare(b.fechaSeguimiento)).slice(0, 5);
    if (!list.length) return `<div class="muted" style="font-size:13px">Sin seguimientos agendados.</div>`;
    return list.map(p => {
      const d = daysUntil(p.fechaSeguimiento);
      const tag = d < 0 ? `<span class="tag" style="color:#ff5d6c">vencido</span>` : d === 0 ? `<span class="tag" style="color:#f5c451">hoy</span>` : `<span class="tag">en ${d}d</span>`;
      return `<div class="flex" style="justify-content:space-between;padding:7px 0;cursor:pointer" onclick="TNR.abrirProspecto('${p.id}')">
        <span style="font-size:13px">${esc(p.empresa || p.nombre)}</span>${tag}</div>`;
    }).join('');
  }
  function tareasPendientesMini() {
    const list = DB.getTareas().filter(t => t.estado !== 'Finalizada').slice(0, 5);
    if (!list.length) return `<div class="muted" style="font-size:13px">Sin tareas pendientes.</div>`;
    const col = p => DB.PRIO_TAREA_COLOR[p] || '#8b94a8';
    return list.map(t => `<div class="flex" style="justify-content:space-between;padding:7px 0;cursor:pointer" onclick="TNR.abrirTarea('${t.id}')">
      <span style="font-size:13px">${esc(t.titulo)}</span>
      <span class="chip" style="background:${col(t.prioridad)}22;color:${col(t.prioridad)}">${esc(DB.responsableDe(t.responsable).corto)}</span></div>`).join('');
  }

  /* ============================================================
     PROSPECTOS
     ============================================================ */
  // "vía IG @handle" NO es WhatsApp: esos prospectos se contactan por Instagram.
  const tieneWA = p => !!(p.whatsapp && !/^no\b|^no\s|sin\b|tel fijo|v[ií]a ig|via ig|solo ig|por ig\b|instagram/i.test(String(p.whatsapp).trim()));
  const tieneIG = p => !!(p.instagram && !/^no\b|no confirm|no encontrado/i.test(String(p.instagram).trim()));
  const tieneWeb = p => !!(p.sitioWeb && !/^no\b|no tiene|no encontr/i.test(String(p.sitioWeb).trim()));

  function filtrarProspectos(all) {
    const q = pFilters.q.trim().toLowerCase();
    return all.filter(p =>
      // '_sin' junta todo lo que no es ferretería ni pauta MF (tandas viejas de otros rubros)
      (!pFilters.tipo || (pFilters.tipo === '_sin' ? !p.tipo : p.tipo === pFilters.tipo)) &&
      (!pFilters.subtipo || p.subtipo === pFilters.subtipo) &&
      (!pFilters.ciudad || p.ciudad === pFilters.ciudad) &&
      (!pFilters.estado || p.estado === pFilters.estado) &&
      (!pFilters.metodo || p.metodoContacto === pFilters.metodo) &&
      (!pFilters.prioridad || p.prioridad === pFilters.prioridad) &&
      (!q || [p.empresa, p.nombre, p.rubro, p.ciudad, p.direccion, p.instagram, p.whatsapp, p.telefono, p.email, p.observaciones].some(v => (v || '').toLowerCase().includes(q)))
    );
  }

  // Orden de ruta: primero prioridad A, después B, después C, y dentro de cada una
  // del más cercano al más lejano (km medidos contra la base de Coronel Quesada 1218).
  function ordenarRuta(list) {
    const rank = { 'A': 0, 'B': 1, 'C': 2 };
    return list.slice().sort((a, b) => {
      const ra = rank[a.prioridad] != null ? rank[a.prioridad] : 9;
      const rb = rank[b.prioridad] != null ? rank[b.prioridad] : 9;
      if (ra !== rb) return ra - rb;
      const ka = a.km != null && a.km !== '' ? +a.km : 999;
      const kb = b.km != null && b.km !== '' ? +b.km : 999;
      if (ka !== kb) return ka - kb;
      return (a.ciudad || '').localeCompare(b.ciudad || '') || (a.empresa || '').localeCompare(b.empresa || '');
    });
  }
  const activos = () => Object.keys(pFilters).filter(k => pFilters[k]).length;

  function renderProspectos() {
    const all = DB.getProspectos();
    const rubros = [...new Set(all.map(p => p.rubro).filter(Boolean))].sort();
    const ciudades = [...new Set(all.map(p => p.ciudad).filter(Boolean))].sort();
    const responsables = [...new Set(all.map(p => p.responsable).filter(Boolean))].sort();

    view.innerHTML = `
      <div class="view-head">
        <div><h1>Prospección</h1><div class="sub">${all.length} prospectos en base</div></div>
        <div class="head-actions">
          <button class="btn-secondary" onclick="TNRUI.setView('dashboard')">${icon('bar-chart')} Panel</button>
          <button class="btn-secondary" onclick="TNR.importarBase()">${icon('upload')} Importar base</button>
          <button class="btn-secondary" onclick="TNR.nuevoProspectoChat()">${icon('sparkles')} Chat inteligente</button>
          <button class="btn-primary" onclick="TNR.nuevoProspecto()">${icon('plus')}Nuevo prospecto</button>
        </div>
      </div>

      <div class="filters">
        <div class="filter-search"><span class="search-ic" data-ic="search"></span><input type="search" id="pSearch" placeholder="Buscar nombre, dirección, teléfono…" value="${esc(pFilters.q)}" autocomplete="off" /></div>
        ${tipoFilter(pFilters.tipo)}
        ${selectFilter('subtipo', 'Rubro', DB.SUBTIPOS, pFilters.subtipo)}
        ${selectFilter('prioridad', 'Prioridad', DB.PRIORIDADES, pFilters.prioridad)}
        ${selectFilter('ciudad', 'Ciudad', ciudades, pFilters.ciudad)}
        ${selectFilter('estado', 'Estado', DB.ESTADOS_LEAD.map(e => e.id), pFilters.estado)}
        ${selectFilter('metodo', 'Método', DB.METODOS_CONTACTO, pFilters.metodo)}
        ${activos() ? `<button class="filter-clear" onclick="TNR.clearFiltros()">${icon('x')} Limpiar (${activos()})</button>` : ''}
      </div>
      <div id="pList"></div>
    `;
    Icons.paintStatic();
    $$('#view .filters select').forEach(s => s.onchange = () => { pFilters[s.dataset.f] = s.value; pPage = 1; renderProspectosList(); });
    const si = $('#pSearch');
    if (si) si.oninput = () => { pFilters.q = si.value; pPage = 1; renderProspectosList(); };
    renderProspectosList();
  }

  function renderProspectosList() {
    const box = $('#pList'); if (!box) return;
    const filtered = ordenarRuta(filtrarProspectos(DB.getProspectos()));
    const shown = filtered.slice(0, pPage * PAGE);
    const restantes = filtered.length - shown.length;
    box.innerHTML = `
      <div class="list-meta"><span class="result-count">${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}</span>${filtered.length > shown.length ? `<span class="cell-dim">mostrando ${shown.length}</span>` : ''}</div>
      ${shown.length ? tablaProspectos(shown) : emptyState('target', 'Sin resultados', activos() ? 'Ningún prospecto coincide con los filtros. Probá aflojar alguno.' : 'Cargá tu primer prospecto con el formulario o con el chat inteligente.', activos() ? '' : 'TNR.nuevoProspecto()')}
      ${restantes > 0 ? `<button class="btn-load-more" id="pMore">Ver ${Math.min(PAGE, restantes)} más · quedan ${restantes}</button>` : ''}
    `;
    const more = $('#pMore');
    if (more) more.onclick = () => { pPage++; renderProspectosList(); };
  }

  function selectFilter(key, label, opts, val) {
    return `<select data-f="${key}" class="${val ? 'on' : ''}"><option value="">${label}: todos</option>${opts.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }
  // Tipo de prospecto: las dos líneas que trabajamos + el resto de la base sin clasificar.
  function tipoFilter(val) {
    const opts = [['', 'Tipo: todos']].concat(DB.TIPOS_PROSPECTO.map(t => [t, t]));
    opts.push(['_sin', 'Sin tipo (otros rubros)']);
    return `<select data-f="tipo" class="${val ? 'on' : ''}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  }

  // Tarjetas en vez de tabla: el CRM se usa mucho desde el celular durante las visitas.
  // Orden de lectura: nombre → tipo → prioridad → ciudad → dirección → contactos → estado → observaciones.
  function tablaProspectos(list) {
    return `<div class="p-cards">${list.map(p => {
      const wa = tieneWA(p) ? waHref(p.whatsapp || p.telefono) : '';
      const ig = tieneIG(p) ? 'https://instagram.com/' + String(p.instagram).replace('@', '') : '';
      const web = tieneWeb(p) ? (String(p.sitioWeb).startsWith('http') ? p.sitioWeb : 'https://' + p.sitioWeb) : '';
      const maps = p.maps || (p.direccion ? 'https://www.google.com/maps/search/' + encodeURIComponent(p.direccion + ' ' + (p.ciudad || '')) : '');
      const obs = String(p.observaciones || '').replace(/\s+/g, ' ').trim();
      return `<article class="p-card" onclick="TNR.abrirProspecto('${p.id}')">
        <header class="pc-head">
          <h3 class="pc-name">${esc(p.empresa || p.nombre || 'Sin nombre')}</h3>
          ${p.prioridad ? prioridadChip(p.prioridad) : ''}
        </header>
        <div class="pc-tags">
          ${p.tipo ? `<span class="tag tag-tipo">${esc(p.tipo)}</span>` : ''}
          ${p.subtipo ? `<span class="tag tag-sub">${esc(p.subtipo)}</span>` : (p.rubro ? `<span class="tag">${esc(p.rubro)}</span>` : '')}
          ${estadoChip(p.estado)}
        </div>
        <div class="pc-loc">
          <strong>${esc(p.ciudad) || 'Sin ciudad'}</strong>${p.direccion ? ` · ${esc(p.direccion)}` : ''}
          ${p.km !== undefined && p.km !== '' && p.km !== null ? `<span class="pc-km">a ${esc(p.km)} km</span>` : ''}
        </div>
        ${obs ? `<p class="pc-obs">${esc(obs.length > 200 ? obs.slice(0, 200) + '…' : obs)}</p>` : ''}
        <div class="pc-actions" onclick="event.stopPropagation()">
          ${wa ? `<a class="pc-btn wa" target="_blank" href="${wa}" onclick="TNR.marcarContacto('${p.id}','WhatsApp')">${icon('whatsapp')} WhatsApp</a>` : ''}
          ${ig ? `<a class="pc-btn ig" target="_blank" href="${ig}" onclick="TNR.marcarContacto('${p.id}','Instagram')">${icon('instagram')} Instagram</a>` : ''}
          ${p.email ? `<a class="pc-btn mail" href="mailto:${esc(p.email)}" onclick="TNR.marcarContacto('${p.id}','Mail')">${icon('mail')} Mail</a>` : ''}
          ${maps ? `<a class="pc-btn maps" target="_blank" href="${esc(maps)}">${icon('map-pin')} Cómo llegar</a>` : ''}
          ${web ? `<a class="pc-btn" target="_blank" href="${esc(web)}">${icon('globe')} Web</a>` : ''}
        </div>
      </article>`;
    }).join('')}</div>`;
  }
  function waNum(s) { return String(s).replace(/\D/g, '').replace(/^0/, '').replace(/^15/, '11'); }
  // El WhatsApp puede venir como número o como link (wa.me, wa.link, linktr.ee…): devolvemos el href correcto.
  function waHref(v, texto) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/^(wa\.me|wa\.link|api\.whatsapp|chat\.whatsapp|linktr\.ee|taplink|bit\.ly|goo\.su)/i.test(s)) return 'https://' + s;
    const n = waNum(s);
    return n ? `https://wa.me/${n}${texto ? '?text=' + encodeURIComponent(texto) : ''}` : '';
  }

  /* ---------- Formulario de prospecto (manual) ---------- */
  function formProspecto(p) {
    p = p || {};
    const f = (k, lbl, type = 'text', full = false) => `
      <div class="field ${full ? 'full' : ''}"><label>${lbl}</label>
      <input type="${type}" name="${k}" value="${esc(p[k] || '')}" /></div>`;
    const sel = (k, lbl, opts, full = false) => `
      <div class="field ${full ? 'full' : ''}"><label>${lbl}</label>
      <select name="${k}">${opts.map(o => `<option ${p[k] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
    return `<form id="formProspecto">
      <div class="form-grid">
        ${f('nombre', 'Nombre del contacto')}
        ${f('empresa', 'Empresa')}
        ${f('rubro', 'Rubro')}
        ${f('direccion', 'Dirección')}
        ${f('ciudad', 'Ciudad')}
        ${f('telefono', 'Teléfono', 'tel')}
        ${f('whatsapp', 'WhatsApp', 'tel')}
        ${f('email', 'Email', 'email')}
        ${f('instagram', 'Instagram')}
        ${f('facebook', 'Facebook')}
        ${f('linkedin', 'LinkedIn')}
        ${f('sitioWeb', 'Sitio Web')}
        ${f('horarios', 'Horarios')}
        ${f('maps', 'Google Maps')}
        ${f('responsable', 'Responsable')}
        ${sel('tipo', 'Tipo de prospecto', ['', ...DB.TIPOS_PROSPECTO])}
        ${sel('subtipo', 'Rubro (si es del canal ferretero)', ['', ...DB.SUBTIPOS])}
        ${sel('metodoContacto', 'Método de contacto', ['', ...DB.METODOS_CONTACTO])}
        ${sel('estado', 'Estado', DB.ESTADOS_LEAD.map(e => e.id))}
        ${sel('prioridad', 'Prioridad (A = más cerca de la base)', ['', ...DB.PRIORIDADES])}
        ${f('gancho', 'Gancho de venta', 'text', true)}
        <div class="field"><label>Fecha de seguimiento</label><input type="date" name="fechaSeguimiento" value="${esc(p.fechaSeguimiento || '')}" /></div>
        ${f('proximaAccion', 'Próxima acción', 'text', true)}
        <div class="field full"><label>Mensaje personalizado <span class="lbl-hint">(si lo cargás, es el que sale en "Generar mensaje")</span></label><textarea name="mensaje">${esc(p.mensaje || '')}</textarea></div>
        <div class="field full"><label>Observaciones</label><textarea name="observaciones">${esc(p.observaciones || '')}</textarea></div>
      </div>
      <div class="form-foot">
        <button type="button" class="btn-secondary" onclick="TNR.cerrar()">Cancelar</button>
        <button type="submit" class="btn-primary">${p.id ? 'Guardar cambios' : 'Crear prospecto'}</button>
      </div>
    </form>`;
  }

  function readForm(formId) {
    const form = $('#' + formId);
    const fd = new FormData(form);
    const data = {};
    fd.forEach((v, k) => { if (k !== 'servicios') data[k] = (v || '').toString().trim(); });
    // 'servicios' es multi-valor (checkboxes): se lee como array
    if (form.querySelector('[name="servicios"]')) data.servicios = fd.getAll('servicios').filter(Boolean);
    return data;
  }

  function nuevoProspecto(prefill) {
    openModal('Nuevo prospecto', formProspecto(prefill || {}));
    $('#formProspecto').onsubmit = (e) => {
      e.preventDefault();
      const d = readForm('formProspecto');
      if (!d.nombre && !d.empresa) { toast('Ingresá al menos nombre o empresa', 'err'); return; }
      DB.crearProspecto(d);
      closeModal(); toast('Prospecto creado', 'ok'); render();
    };
  }
  function editarProspecto(id) {
    const p = DB.getProspecto(id);
    openModal('Editar prospecto', formProspecto(p));
    $('#formProspecto').onsubmit = (e) => {
      e.preventDefault();
      DB.actualizarProspecto(id, readForm('formProspecto'));
      closeModal(); toast('Cambios guardados', 'ok');
      if (current === 'prospectos') render(); else abrirProspecto(id);
    };
  }
  function borrarProspecto(id) {
    const p = DB.getProspecto(id);
    confirmDialog('Eliminar prospecto', `¿Eliminar el prospecto "${p.empresa || p.nombre}"? Esta acción no se puede deshacer.`, 'Eliminar', () => { DB.eliminarProspecto(id); toast('Prospecto eliminado'); render(); }, true);
  }

  /* ---------- Chat inteligente ---------- */
  function nuevoProspectoChat() {
    const ejemplos = [
      'Juan Pérez, dueño de una inmobiliaria en Morón. Lo llamé hoy. Me atendió. Está interesado en una página web. Que lo contacte el viernes.',
      'Estudio Contable ABC en Castelar. WhatsApp enviado. No respondió. Recontactar dentro de 7 días.',
      'Gimnasio FitZone, Ituzaingó. @fitzone. Interesado en gestión de redes. Reunión agendada para el martes.',
    ];
    openModal('Chat inteligente · Cargar prospecto', `
      <div class="chat-box">
        <textarea class="chat-input" id="chatInput" placeholder="Escribí en lenguaje natural lo que sabés del prospecto…"></textarea>
        <div class="flex" style="justify-content:space-between;margin-top:12px">
          <span class="muted" style="font-size:12px">El sistema interpreta el texto y completa los campos automáticamente.</span>
          <button class="btn-primary" id="btnParse">Interpretar ${icon('arrow-right')}</button>
        </div>
      </div>
      <div style="margin-top:16px"><div class="muted" style="font-size:12px;margin-bottom:8px">Ejemplos (click para probar):</div>
        <div class="chat-examples">${ejemplos.map(e => `<button class="chat-ex">${esc(e)}</button>`).join('')}</div>
      </div>
      <div id="parseResult"></div>
    `);
    $('#btnParse').onclick = doParse;
    $$('.chat-ex').forEach(b => b.onclick = () => { $('#chatInput').value = b.textContent; doParse(); });
  }

  function doParse() {
    const txt = $('#chatInput').value.trim();
    if (!txt) { toast('Escribí algo primero', 'err'); return; }
    const parsed = Parser.parse(txt);
    const campos = [
      ['nombre', 'Nombre'], ['empresa', 'Empresa'], ['rubro', 'Rubro'], ['ciudad', 'Ciudad'],
      ['metodoContacto', 'Método'], ['estado', 'Estado'], ['telefono', 'Teléfono'], ['whatsapp', 'WhatsApp'],
      ['email', 'Email'], ['instagram', 'Instagram'], ['sitioWeb', 'Sitio web'],
      ['proximaAccion', 'Próxima acción'], ['fechaSeguimiento', 'Seguimiento'],
    ].filter(([k]) => parsed[k]);
    $('#parseResult').innerHTML = `
      <div class="divider"></div>
      <div class="flex" style="justify-content:space-between"><strong style="font-size:13px">Datos detectados</strong>
      <span class="muted" style="font-size:12px">${campos.length} campos</span></div>
      <div class="parse-preview">
        ${campos.map(([k, l]) => `<div class="parse-item"><div class="p-key">${l}</div><div class="p-val">${k === 'fechaSeguimiento' ? fmtDate(parsed[k]) : esc(parsed[k])}</div></div>`).join('')}
      </div>
      <div class="form-foot">
        <button class="btn-secondary" onclick="TNR.revisarParse()">Revisar / editar campos</button>
        <button class="btn-primary" id="btnConfirmParse">${icon('check')} Crear prospecto</button>
      </div>`;
    doParse._last = parsed;
    $('#btnConfirmParse').onclick = () => {
      DB.crearProspecto(parsed);
      closeModal(); toast('Prospecto creado desde chat', 'ok'); render();
    };
  }
  function revisarParse() {
    nuevoProspecto(doParse._last || {});
  }

  /* ---------- Detalle de prospecto ---------- */
  function abrirProspecto(id) {
    const p = DB.getProspecto(id);
    if (!p) return;
    const link = (val, href, label) => val ? `<a class="text-link" target="_blank" href="${href}">${label || val}</a>` : '<span class="cell-dim">—</span>';
    const fila = (l, v) => `<div class="field"><label>${l}</label><div style="font-size:13px;padding:4px 0">${v}</div></div>`;
    openModal(p.empresa || p.nombre || 'Prospecto', `
      <div class="flex gap-wrap" style="justify-content:space-between;margin-bottom:16px">
        <div>${estadoChip(p.estado)} ${p.rubro ? `<span class="tag">${esc(p.rubro)}</span>` : ''}</div>
        <div class="pill-row">
          <select id="estadoQuick" style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:8px;font-size:12px">
            ${DB.ESTADOS_LEAD.map(e => `<option ${e.id === p.estado ? 'selected' : ''}>${e.id}</option>`).join('')}
          </select>
          ${tieneWA(p) ? `<a class="btn-secondary" target="_blank" href="${waHref(p.whatsapp)}" style="padding:6px 12px">${icon('whatsapp')} WhatsApp</a>` : ''}
          <button class="btn-secondary" style="padding:6px 12px" onclick="TNR.editarProspecto('${p.id}')">${icon('edit')} Editar</button>
        </div>
      </div>
      <div class="form-grid">
        ${fila('Contacto', esc(p.nombre) || '—')}
        ${fila('Empresa', esc(p.empresa) || '—')}
        ${fila('Dirección', p.direccion ? link(p.direccion, 'https://www.google.com/maps/search/' + encodeURIComponent(p.direccion + ' ' + (p.ciudad || ''))) : '—')}
        ${fila('Ciudad', [p.ciudad, p.provincia].filter(Boolean).map(esc).join(', ') || '—')}
        ${fila('Método de contacto', esc(p.metodoContacto) || '—')}
        ${fila('Teléfono', esc(p.telefono) || '—')}
        ${fila('WhatsApp', esc(p.whatsapp) || '—')}
        ${fila('Email', p.email ? link(p.email, 'mailto:' + p.email) : '—')}
        ${fila('Instagram', p.instagram ? link(p.instagram, 'https://instagram.com/' + p.instagram.replace('@', '')) : '—')}
        ${fila('Facebook', p.facebook ? link(p.facebook, (p.facebook.startsWith('http') ? '' : 'https://') + p.facebook) : '—')}
        ${fila('LinkedIn', p.linkedin ? link(p.linkedin, (p.linkedin.startsWith('http') ? '' : 'https://') + p.linkedin) : '—')}
        ${fila('Sitio web', p.sitioWeb ? link(p.sitioWeb, (p.sitioWeb.startsWith('http') ? '' : 'https://') + p.sitioWeb) : '<strong style="color:#3ecf8e">Sin web — oportunidad</strong>')}
        ${fila('Canal', canalChip(p.canal))}
        ${fila('Nivel de oportunidad', oportunidadCell(p.oportunidad))}
        ${fila('Google Maps', p.maps ? link(p.maps, p.maps, 'Abrir en Maps') : '—')}
        ${fila('Horarios', esc(p.horarios) || '—')}
        ${fila('Reputación', (p.puntuacion || p.reseñas) ? `${esc(p.puntuacion || '—')} ★ · ${esc(p.reseñas || 0)} reseñas` : '—')}
        ${fila('Responsable', esc(p.responsable) || '—')}
        ${fila('Contactado por', (p.canalesContacto || []).length ? esc((p.canalesContacto || []).join(' · ')) : '—')}
        ${fila('Próxima acción', esc(p.proximaAccion) || '—')}
        ${fila('Fecha de seguimiento', p.fechaSeguimiento ? fmtDate(p.fechaSeguimiento) : '—')}
      </div>
      ${p.gancho ? `<div class="field full mt-12"><label>Gancho de venta</label><div style="font-size:13px;font-weight:600;color:var(--accent)">${esc(p.gancho)}</div></div>` : ''}
      ${p.observaciones ? `<div class="field full mt-12"><label>Observaciones</label><div style="font-size:13px">${esc(p.observaciones)}</div></div>` : ''}
      <div class="divider"></div>
      <div class="flex" style="justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="font-size:13px">${icon('sparkles')} Análisis de oportunidad</strong>
        <button class="btn-secondary" style="padding:5px 10px;font-size:12px" onclick="TNR.analizarProspecto('${p.id}')">${p.analisis ? 'Re-analizar' : 'Analizar negocio'}</button>
      </div>
      <div id="iaBox">${renderIaBox(p)}</div>
      <div class="divider"></div>
      <div style="margin-bottom:8px"><strong style="font-size:13px">${icon('message-square')} Generar mensaje</strong></div>
      <div class="msg-canales">
        ${canalesDe(p).map(cn => `<button class="btn-secondary msg-cn" data-canal="${cn}" style="padding:6px 11px;font-size:12px" onclick="TNR.genMensaje('${p.id}','${cn}')">${cn}</button>`).join('')}
      </div>
      <div id="msgBox"></div>
      <div class="divider"></div>
      <div class="flex" style="justify-content:space-between;margin-bottom:8px">
        <strong style="font-size:13px">Historial</strong>
        <button class="btn-secondary" style="padding:5px 10px;font-size:12px" onclick="TNR.convertirCliente('${p.id}')">${icon('star')} Convertir en cliente</button>
      </div>
      <div class="add-note">
        <select id="noteTipo"><option>Nota</option><option>Llamada</option><option>Mensaje</option><option>Reunión</option><option>Seguimiento</option></select>
        <input id="noteText" placeholder="Agregar al historial…" />
        <button class="btn-secondary" id="btnNote" style="padding:8px 14px">${icon('plus')}</button>
      </div>
      <div class="timeline mt-12">${(p.historial || []).map(h => `
        <div class="tl-item"><div class="tl-dot"></div><div class="tl-content">
          <div class="tl-type">${esc(h.tipo)}</div><div class="tl-text">${esc(h.texto)}</div>
          <div class="tl-date">${fmtDateTime(h.fecha)}</div></div></div>`).join('')}</div>
    `);
    $('#estadoQuick').onchange = (e) => { DB.actualizarProspecto(id, { estado: e.target.value }); toast('Estado actualizado', 'ok'); abrirProspecto(id); if (current === 'prospectos' || current === 'dashboard') render(); };
    const addNote = () => {
      const txt = $('#noteText').value.trim();
      if (!txt) return;
      DB.agregarHistorial(id, $('#noteTipo').value, txt);
      abrirProspecto(id);
    };
    $('#btnNote').onclick = addNote;
    $('#noteText').onkeydown = (e) => { if (e.key === 'Enter') addNote(); };
    // El mensaje ya sale armado en el canal principal del prospecto (no hay que buscarlo en observaciones)
    genMensaje(id, canalesDe(p)[0]);
  }

  // Canal principal según el prospecto: pauta → Email; método Instagram → Instagram; si no, WhatsApp.
  function canalesDe(p) {
    const todos = ['WhatsApp', 'Instagram', 'Email', 'Llamada'];
    const met = String(p.metodoContacto || '').toLowerCase();
    let pref = 'WhatsApp';
    if (esPauta(p) || /mail/.test(met)) pref = 'Email';
    else if (/instagram/.test(met)) pref = 'Instagram';
    else if (/llamada|visita|cold/.test(met)) pref = 'Llamada';
    else if (!tieneWA(p) && p.email) pref = 'Email';
    return [pref].concat(todos.filter(c => c !== pref));
  }

  function convertirCliente(id) {
    if (!confirm('¿Convertir este prospecto en cliente? Se creará una ficha de cliente y el prospecto pasará a "Ganado".')) return;
    const c = DB.convertirEnCliente(id);
    closeModal(); toast('Cliente creado', 'ok');
    setView('clientes'); setTimeout(() => abrirCliente(c.id), 100);
  }

  /* ============================================================
     ANÁLISIS DE OPORTUNIDAD + GENERADOR DE MENSAJE
     (todo del lado del navegador, sin API key)
     ============================================================ */
  const AGENCIA = 'Tu Negocio En Las Redes';

  function analizarNegocio(p) {
    const has = {
      web: !!String(p.sitioWeb || '').trim(),
      ig: !!String(p.instagram || '').trim(),
      wa: !!String(p.whatsapp || p.telefono || '').trim(),
      email: !!String(p.email || '').trim(),
      fb: !!String(p.facebook || '').trim(),
    };
    const reglas = [
      { ok: has.web,   peso: 34, falta: 'No tiene página web' },
      { ok: has.ig,    peso: 24, falta: 'No tiene Instagram (o no lo encontramos)' },
      { ok: has.wa,    peso: 16, falta: 'Sin WhatsApp de contacto directo' },
      { ok: has.email, peso: 14, falta: 'Sin email de contacto' },
      { ok: has.fb,    peso: 12, falta: 'Sin página de Facebook' },
    ];
    let falta = 0, total = 0; const motivos = [];
    reglas.forEach(r => { total += r.peso; if (!r.ok) { falta += r.peso; motivos.push(r.falta); } });
    return { score: total ? Math.round(falta / total * 100) : 0, motivos, servicio: servicioRecomendado(p), fecha: DB.nowISO() };
  }

  function renderIaBox(p) {
    if (!p.analisis) return `<div class="cell-dim" style="font-size:12.5px">Tocá <strong>Analizar negocio</strong> para calcular el score de oportunidad y ver qué le falta.</div>`;
    const a = p.analisis;
    const col = a.score >= 70 ? '#3ecf8e' : a.score >= 45 ? '#f5c451' : '#ff5d6c';
    const svc = a.servicio || servicioRecomendado(p);
    return `<div class="ia-result">
      <div class="ia-score" style="color:${col}">${a.score}<span>/100</span><small>oportunidad</small></div>
      <div class="ia-motivos">
        <div class="ia-label">Oportunidades detectadas</div>
        ${a.motivos.length ? `<ul>${a.motivos.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '<div class="cell-dim" style="font-size:12.5px">Tiene una presencia digital sólida. Buen candidato para mantenimiento/mejoras.</div>'}
        <div class="ia-servicio">${icon('target', 14)} Servicio recomendado: <strong>${esc(svc)}</strong></div>
      </div>
    </div>`;
  }

  // --- Generación de mensajes natural (P1+P2): usa datos reales del prospecto ---
  function reseñasDe(p) {
    const m = String(p.observaciones || '').match(/([\d][\d.]*)\s*rese/i);
    if (!m) return null;
    const n = parseInt(m[1].replace(/\./g, ''), 10);
    return n > 0 ? n : null;
  }
  function nombreNat(p) {
    let n = String(p.empresa || p.nombre || 'tu negocio').trim();
    if (!/\s/.test(n) && /[._]/.test(n)) n = n.replace(/[._]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
    return n;
  }
  function rubroNat(p) { const r = String(p.rubro || '').toLowerCase().trim(); return r || 'negocios como el suyo'; }

  /* --- Campaña Mundo Ferretero: planes de pauta vigentes --- */
  const MF_MAIL = 'comercial@mundoferretero.com.ar';
  const MF_PLANES = [
    ['Presencia', 'u$s200/mes', 'Banner en Home + Banner en mailings + Reporte mensual básico'],
    ['Profesional', 'u$s350/mes', 'Todo lo de Presencia + Nota destacada en el portal + Mailing exclusivo + Reporte mensual de resultados'],
    ['Premium', 'u$s450/mes', 'Todo lo de Profesional + Entrevista personalizada + Informe de mercado + Encuesta patrocinada + Reporte mensual completo'],
  ];
  const esPauta = (p) => String(p.segmento || '').indexOf('Empresas para pauta') >= 0;
  function asuntoMail(p) {
    const emp = p.empresa || p.nombre || '';
    return esPauta(p) ? `Pauta en Mundo Ferretero — ${emp}`.trim() : `Una idea para ${emp}`.trim();
  }

  // Servicio recomendado (P2): nunca vacío; ante la duda, Página Web.
  function servicioRecomendado(p) {
    if (esPauta(p)) return 'Pauta en Mundo Ferretero';
    const web = tieneWeb(p), ig = tieneIG(p);
    const obs = String(p.observaciones || '').toLowerCase();
    if (!web) return 'Página Web';
    if (!ig || /abandonad|sin contenido|no public|redes flojas|poco contenido/.test(obs)) return 'Gestión de Redes';
    if (/reserva|turno|whatsapp manual|agenda|muchos clientes|recordatori/.test(obs)) return 'CRM';
    return (p.servicios && p.servicios[0]) || 'Página Web';
  }
  // Frase de oportunidad concreta según lo que le falta.
  function oportunidadNat(p) {
    const r = reseñasDe(p), web = tieneWeb(p), ig = tieneIG(p);
    if (!web && r) return `vi que tienen muy buenas reseñas en Google (más de ${r}), pero no encontré una página web donde muestren todos sus servicios y faciliten el contacto`;
    if (!web) return `vi que todavía no tienen una página web donde mostrar sus servicios y que los clientes los contacten fácil`;
    if (!ig) return `vi que tienen buena reputación, pero no encontré un Instagram activo para mostrar el día a día y atraer clientes nuevos`;
    return `creo que hay margen para ordenar la operación y aprovechar mejor a sus clientes actuales`;
  }
  function ofertaNat(servicio, rubro) {
    switch (servicio) {
      case 'Gestión de Redes': return `Justamente nos dedicamos a la gestión de redes de ${rubro}: contenido, diseño y más consultas.`;
      case 'CRM': return `Justamente les armamos un sistema para ordenar los turnos/clientes que hoy manejan por WhatsApp y no perder ventas.`;
      case 'SaaS': return `Justamente desarrollamos el sistema de reservas/gestión para ${rubro}, para que no dependan del WhatsApp manual.`;
      case 'Aplicación Web': case 'App personalizada': return `Justamente desarrollamos apps a medida para automatizar procesos y escalar.`;
      default: return `Justamente ayudamos a ${rubro} a tener una página web profesional y conseguir más consultas.`;
    }
  }

  // ── Mensajes de WhatsApp que no se repiten ───────────────────────────────
  // WhatsApp banea por PATRON: si 30 personas reciben el mismo texto, lo detecta.
  // Cada prospecto recibe una apertura, un cuerpo y un cierre distintos, elegidos
  // de forma estable a partir de su id (el mismo prospecto siempre da el mismo
  // mensaje, pero dos prospectos seguidos nunca dan el mismo).
  function hashId(s) {
    let h = 0;
    for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  const pick = (arr, id, salt) => arr[(hashId(id + '|' + salt)) % arr.length];

  // Dato concreto y verificable del negocio: es lo que hace que no parezca plantilla.
  function dsGancho(p) {
    const rv = parseInt(p['reseñas'] || p.resenas || 0, 10) || 0;
    const pu = String(p.puntuacion || '').replace(',', '.');
    const tieneIG = p.instagram && !/^no|no encontrado/i.test(String(p.instagram));
    const tieneWeb = p.sitioWeb && !/^no|no tiene/i.test(String(p.sitioWeb));
    const out = [];
    if (rv >= 100 && pu) out.push(`vi que tienen ${rv} reseñas en Google con ${pu} de promedio`);
    else if (rv >= 30) out.push(`vi que tienen ${rv} reseñas en Google`);
    if (tieneIG && !tieneWeb) out.push(`los encontré por Instagram (${p.instagram})`);
    if (p.ciudad) out.push(`vi que están en ${p.ciudad}`);
    return out;
  }

  function mensajeWhatsApp(p) {
    const id = p.id || (p.empresa || '') + (p.ciudad || '');
    const emp = p.empresa || p.nombre || '';
    const ciu = p.ciudad || 'la zona';
    const tieneWeb = p.sitioWeb && !/^no|no tiene/i.test(String(p.sitioWeb));
    const tieneIG = p.instagram && !/^no|no encontrado/i.test(String(p.instagram));
    const datos = dsGancho(p);
    const dato = datos.length ? pick(datos, id, 'd') : '';

    const saludos = ['Hola', 'Buenas', 'Hola, ¿qué tal?', 'Buen día', '¿Cómo va?'];
    const presenta = [
      'Soy Mateo, de Tu Negocio En Las Redes, una agencia acá de zona oeste',
      'Te escribo de Tu Negocio En Las Redes, somos una agencia de zona oeste',
      'Soy Mateo, trabajo con negocios de la zona haciendo webs y redes',
      'Te contacto de Tu Negocio En Las Redes, agencia de la zona',
    ];
    // El medio del mensaje cambia según lo que le falta al negocio, que es el motivo real del contacto.
    let cuerpos;
    if (!tieneWeb && tieneIG) cuerpos = [
      `Estuve viendo ${emp} y me llamó la atención que tienen el Instagram andando pero no tienen página web.`,
      `Vi el Instagram de ${emp} y está bueno, pero cuando los busqué en Google no encontré página propia.`,
      `Me puse a mirar ${emp} y noté que están en Instagram pero les falta la web.`,
    ];
    else if (!tieneWeb) cuerpos = [
      `Estuve mirando ${emp} y vi que no tienen página web propia.`,
      `Busqué ${emp} en Google y no aparece una web del negocio.`,
      `Vi que ${emp} no tiene sitio web, y en su rubro el cliente googlea antes de ir.`,
    ];
    else cuerpos = [
      `Estuve viendo la web de ${emp} y creo que se le puede sacar bastante más provecho.`,
      `Miré el sitio de ${emp} y hay cosas que hoy le estarían costando consultas.`,
    ];

    const cierres = [
      '¿Te puedo mandar un ejemplo de cómo quedaría? Sin compromiso.',
      'Si querés te muestro una demo hecha para el negocio y decidís con eso a la vista.',
      '¿Te interesa que te pase una idea concreta? Son 2 minutos de lectura.',
      'Te puedo armar una muestra gratis para que veas cómo se vería. ¿Te sirve?',
      '¿Lo charlamos? Si no es el momento, no hay drama.',
    ];

    const saludo = pick(saludos, id, 's');
    const quien = pick(presenta, id, 'q');
    const cuerpo = pick(cuerpos, id, 'c');
    const cierre = pick(cierres, id, 'f');
    const linea = dato ? ` ${dato.charAt(0).toUpperCase() + dato.slice(1)}.` : '';

    return `${saludo}! ${quien}.\n\n${cuerpo}${linea}\n\n${cierre}`;
  }

  function generarMensaje(p, canal) {
    const emp = p.empresa || p.nombre || 'tu negocio';
    const nombre = nombreNat(p);
    const rubro = rubroNat(p);
    const servicio = servicioRecomendado(p);

    // 1) Mensaje propio cargado en el prospecto (campañas: Mundo Ferretero, etc.)
    if (p.mensaje) {
      const cuerpo = String(p.mensaje).trim();
      const firma = esPauta(p) ? `Mundo Ferretero · ${MF_MAIL}` : AGENCIA;
      if (canal === 'Email') return `Asunto: ${asuntoMail(p)}\n\n${cuerpo}\n\nSaludos,\n[Tu nombre]\n${firma}`;
      if (canal === 'Llamada') return `GUION DE LLAMADA\n\nApertura: "${cuerpo}"\n\nSi piden más info:\n${MF_PLANES.map(x => `· ${x[0]} (${x[1]}): ${x[2]}`).join('\n')}\n\nCierre: "Le mando la info por mail y coordinamos una reunión de 15 minutos."`;
      return cuerpo;
    }

    // 2) WhatsApp a un prospecto comun: mensaje variado para no repetir texto entre contactos.
    //    Mandar 30 veces el mismo texto es lo que dispara el baneo de WhatsApp.
    if (canal === 'WhatsApp' && !esPauta(p)) return mensajeWhatsApp(p);

    // 3) Fallback para empresas de pauta sin mensaje propio: se vende PAUTA, no servicios de agencia.
    if (esPauta(p)) {
      const pitch = `Les escribo de Mundo Ferretero, el medio del canal ferretero (mundoferretero.com.ar). Publicamos contenido para dueños de ferreterías: gestión, productos y tendencias. ${emp} le vende justamente a ese público, por eso quería proponerles una reunión breve para mostrarles nuestro alcance y las opciones de pauta.`;
      const planes = MF_PLANES.map(x => `· Plan ${x[0]} — ${x[1]}: ${x[2]}`).join('\n');
      if (canal === 'Email') return `Asunto: ${asuntoMail(p)}\n\nHola equipo de ${emp},\n\n${pitch}\n\nLos planes son:\n${planes}\n\n¿Tienen 15 minutos esta semana?\n\nSaludos,\n[Tu nombre]\nMundo Ferretero · ${MF_MAIL}`;
      if (canal === 'Llamada') return `GUION DE LLAMADA\n\nApertura: "Hola, ¿hablo con ${emp}? Le llamo de Mundo Ferretero, el medio del canal ferretero."\nGancho: "${pitch}"\nPlanes:\n${planes}\nCierre: "Le mando la info por mail y coordinamos una reunión de 15 minutos."`;
      return `Hola, les escribo de Mundo Ferretero, el medio del canal ferretero. ${pitch}`;
    }

    const intro = `Estuve viendo su perfil y ${oportunidadNat(p)}.`;
    const oferta = ofertaNat(servicio, rubro);
    switch (canal) {
      case 'WhatsApp':
        return `Hola ${nombre} 👋 Soy de ${AGENCIA}. ${intro} ${oferta} ¿Les interesaría que les muestre una idea sin compromiso?`;
      case 'Instagram':
        return `¡Hola ${nombre}! Soy de ${AGENCIA} 🙌 ${intro} ${oferta} ¿Te muestro una propuesta sin compromiso?`;
      case 'Email':
        return `Asunto: Una idea para ${emp}\n\nHola equipo de ${emp},\n\nSoy [Tu nombre], de ${AGENCIA}. ${intro} ${oferta}\n\n¿Tienen 15 minutos esta semana para que les muestre una propuesta concreta, sin compromiso?\n\nSaludos,\n[Tu nombre] — ${AGENCIA}`;
      case 'Llamada':
        return `GUION DE LLAMADA\n\nApertura: "Hola, ¿hablo con ${emp}? Te llamo de ${AGENCIA}."\nGancho: "${intro}"\nValor: "${oferta}"\nPregunta: "¿Hoy cómo están consiguiendo clientes nuevos?"\nCierre: "Te propongo una reunión de 15 minutos para mostrarte una idea concreta. ¿Te viene bien mañana?"`;
    }
    return '';
  }

  function renderMsgBox(p, canal, txt) {
    const wa = waNum(p.whatsapp || p.telefono);
    // Al abrir el canal queda registrado en el prospecto (estado "Contactado por ...") sin tener que tocarlo a mano.
    const marcar = (cn) => `onclick="TNR.marcarContacto('${p.id}','${cn}')"`;
    let abrir = '';
    if (canal === 'WhatsApp' && wa) abrir = `<a class="btn-primary" style="padding:7px 12px" target="_blank" ${marcar('WhatsApp')} href="${waHref(p.whatsapp || p.telefono, txt)}">${icon('whatsapp')} Abrir WhatsApp</a>`;
    else if (canal === 'Email' && p.email) abrir = `<a class="btn-primary" style="padding:7px 12px" target="_blank" ${marcar('Mail')} href="mailto:${esc(p.email)}?subject=${encodeURIComponent(asuntoMail(p))}&body=${encodeURIComponent(txt.replace(/^Asunto:.*\n+/, ''))}">${icon('mail')} Abrir Email</a>`;
    else if (canal === 'Instagram' && p.instagram) abrir = `<a class="btn-primary" style="padding:7px 12px" target="_blank" ${marcar('Instagram')} href="https://instagram.com/${esc(String(p.instagram).replace('@', ''))}">${icon('instagram')} Abrir Instagram</a>`;
    const ya = (p.canalesContacto || []).length
      ? `<div class="msg-ya">Ya contactado por: ${(p.canalesContacto || []).map(esc).join(' · ')}</div>` : '';
    return `<div class="msg-canal-tag">${esc(canal)}</div>
      <textarea id="msgText" class="msg-text">${esc(txt)}</textarea>
      ${ya}
      <div class="msg-actions">
        <button class="btn-secondary" style="padding:7px 12px" onclick="TNR.copiarMsg()">${icon('copy')} Copiar</button>
        ${abrir}
        <button class="btn-ghost" style="padding:7px 12px;flex:none" onclick="TNR.marcarContacto('${p.id}','${canal === 'Email' ? 'Mail' : canal}',1)">Marcar contactado</button>
      </div>`;
  }

  // Registra el canal por el que se contactó y refresca la ficha para que se vea el estado nuevo.
  function marcarContacto(id, canal, avisar) {
    DB.registrarContacto(id, canal);
    if (avisar) toast('Marcado como contactado por ' + canal, 'ok');
    setTimeout(() => { const p = DB.getProspecto(id); if (p && $('#modalBody')) abrirProspecto(id); if (current === 'prospectos' || current === 'dashboard') render(); }, 350);
  }

  function analizarProspecto(id) {
    const p = DB.getProspecto(id); if (!p) return;
    const a = analizarNegocio(p);
    DB.actualizarProspecto(id, { analisis: a });
    const box = $('#iaBox'); if (box) box.innerHTML = renderIaBox(DB.getProspecto(id));
    toast('Análisis actualizado', 'ok');
  }
  function genMensaje(id, canal) {
    const p = DB.getProspecto(id); if (!p) return;
    const txt = generarMensaje(p, canal);
    const box = $('#msgBox'); if (box) box.innerHTML = renderMsgBox(p, canal, txt);
    document.querySelectorAll('#modalBody .msg-cn').forEach(b => b.classList.toggle('active', b.dataset.canal === canal));
  }
  function copiarMsg() {
    const t = $('#msgText'); if (!t) return;
    t.select();
    navigator.clipboard.writeText(t.value).then(() => toast('Mensaje copiado', 'ok')).catch(() => { try { document.execCommand('copy'); toast('Mensaje copiado', 'ok'); } catch (_) {} });
  }

  /* ============================================================
     CLIENTES
     ============================================================ */
  function renderClientes() {
    const list = DB.getClientes();
    view.innerHTML = `
      <div class="view-head">
        <div><h1>Clientes</h1><div class="sub">${list.filter(c => c.estado === 'Activo').length} activos · ${list.length} totales</div></div>
        <div class="head-actions"><button class="btn-primary" onclick="TNR.nuevoCliente()">${icon('plus')}Nuevo cliente</button></div>
      </div>
      ${list.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Cliente</th><th>Rubro</th><th>Ciudad</th><th>Fact. mensual</th><th>Saldo</th><th>Finanzas</th><th>Estado</th><th></th></tr></thead>
        <tbody>${list.map(c => {
          const mensual = c.servicios.filter(s => s.recurrente).reduce((a, s) => a + s.precio, 0);
          const fin = DB.finanzasCliente(c);
          const ec = c.estado === 'Activo' ? '#3ecf8e' : '#8b94a8';
          return `<tr onclick="TNR.abrirCliente('${c.id}')">
            <td data-label="Cliente"><div class="cell-strong">${esc(c.empresa || c.nombre)}</div>${c.empresa && c.nombre ? `<div class="cell-dim">${esc(c.nombre)}</div>` : ''}</td>
            <td data-label="Rubro">${c.rubro ? `<span class="tag">${esc(c.rubro)}</span>` : '—'}</td>
            <td data-label="Ciudad" class="cell-dim">${esc(c.ciudad) || '—'}</td>
            <td data-label="Fact. mensual" class="cell-strong">${mensual ? fmtMoney(mensual) : '—'}</td>
            <td data-label="Saldo" class="cell-strong" style="color:${fin.saldo > 0 ? fin.color : 'var(--text-dim)'}">${fin.saldo > 0 ? fmtMoney(fin.saldo) : '—'}</td>
            <td data-label="Finanzas"><span class="chip" style="background:${fin.color}22;color:${fin.color}"><span class="chip-dot" style="background:${fin.color}"></span>${fin.estado}</span></td>
            <td data-label="Estado"><span class="chip" style="background:${ec}22;color:${ec}"><span class="chip-dot" style="background:${ec}"></span>${esc(c.estado)}</span></td>
            <td data-label=""><div class="row-actions" onclick="event.stopPropagation()"><button class="icon-btn danger" onclick="TNR.borrarCliente('${c.id}')">${icon('trash')}</button></div></td>
          </tr>`;
        }).join('')}</tbody></table></div>`
        : emptyState('users', 'Sin clientes', 'Cargá tu primer cliente o convertí un prospecto ganado.', 'TNR.nuevoCliente()')}
    `;
  }

  function formCliente(c) {
    c = c || {};
    const f = (k, lbl, type = 'text', full = false) => `<div class="field ${full ? 'full' : ''}"><label>${lbl}</label><input type="${type}" name="${k}" value="${esc(c[k] || '')}" /></div>`;
    return `<form id="formCliente"><div class="form-grid">
      ${f('nombre', 'Nombre del contacto')}${f('empresa', 'Empresa')}${f('rubro', 'Rubro')}${f('ciudad', 'Ciudad')}
      ${f('provincia', 'Provincia')}${f('pais', 'País')}${f('telefono', 'Teléfono', 'tel')}${f('whatsapp', 'WhatsApp', 'tel')}
      ${f('email', 'Email', 'email')}${f('instagram', 'Instagram')}${f('sitioWeb', 'Sitio web')}${f('responsable', 'Responsable')}
      <div class="field"><label>Estado</label><select name="estado">${['Activo', 'Inactivo', 'Suspendido', 'Cancelado', 'Perdido'].map(e => `<option ${c.estado === e ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
      <div class="field full"><label>Observaciones</label><textarea name="observaciones">${esc(c.observaciones || '')}</textarea></div>
    </div><div class="form-foot"><button type="button" class="btn-secondary" onclick="TNR.cerrar()">Cancelar</button><button type="submit" class="btn-primary">${c.id ? 'Guardar' : 'Crear cliente'}</button></div></form>`;
  }
  function nuevoCliente() {
    openModal('Nuevo cliente', formCliente({}));
    $('#formCliente').onsubmit = (e) => { e.preventDefault(); const d = readForm('formCliente'); if (!d.nombre && !d.empresa) { toast('Ingresá nombre o empresa', 'err'); return; } DB.crearCliente(d); closeModal(); toast('Cliente creado', 'ok'); render(); };
  }
  function editarCliente(id) {
    openModal('Editar cliente', formCliente(DB.getCliente(id)));
    $('#formCliente').onsubmit = (e) => { e.preventDefault(); DB.actualizarCliente(id, readForm('formCliente')); closeModal(); toast('Cambios guardados', 'ok'); abrirCliente(id); };
  }
  function borrarCliente(id) {
    const c = DB.getCliente(id);
    confirmDialog('Eliminar cliente', `¿Eliminar al cliente "${c.empresa || c.nombre}"? Esta acción no se puede deshacer.`, 'Eliminar', () => { DB.eliminarCliente(id); toast('Cliente eliminado'); render(); }, true);
  }

  /* ---------- Detalle de cliente (tabs) ---------- */
  let clienteTab = 'datos';
  function abrirCliente(id, tab) {
    clienteTab = tab || 'datos';
    const c = DB.getCliente(id);
    if (!c) return;
    openModal(c.empresa || c.nombre, `
      <div class="tabs">
        ${['datos', 'servicios', 'produccion', 'facturacion', 'historial'].map(t =>
          `<button class="tab ${t === clienteTab ? 'active' : ''}" data-tab="${t}">${({ datos: 'Datos', servicios: 'Servicios', produccion: 'Producción', facturacion: 'Facturación', historial: 'Historial' })[t]}</button>`).join('')}
      </div>
      <div id="cliBody"></div>
    `);
    $$('#modal .tab').forEach(b => b.onclick = () => abrirCliente(id, b.dataset.tab));
    renderClienteTab(c);
  }

  function renderClienteTab(c) {
    const body = $('#cliBody');
    if (clienteTab === 'datos') {
      const fila = (l, v) => `<div class="field"><label>${l}</label><div style="font-size:13px;padding:4px 0">${v || '<span class="cell-dim">—</span>'}</div></div>`;
      body.innerHTML = `
        <div class="flex" style="justify-content:flex-end;margin-bottom:14px">
          ${c.whatsapp ? `<a class="btn-secondary" target="_blank" href="https://wa.me/${waNum(c.whatsapp)}" style="padding:6px 12px">${icon('whatsapp')} WhatsApp</a>` : ''}
          <button class="btn-secondary" style="padding:6px 12px" onclick="TNR.editarCliente('${c.id}')">${icon('edit')} Editar</button>
        </div>
        <div class="form-grid">
          ${fila('Contacto', esc(c.nombre))}${fila('Empresa', esc(c.empresa))}${fila('Rubro', esc(c.rubro))}
          ${fila('Ciudad', [c.ciudad, c.provincia].filter(Boolean).map(esc).join(', '))}
          ${fila('Teléfono', esc(c.telefono))}${fila('WhatsApp', esc(c.whatsapp))}
          ${fila('Email', c.email ? `<a class="text-link" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '')}
          ${fila('Instagram', c.instagram ? `<a class="text-link" target="_blank" href="https://instagram.com/${esc(c.instagram.replace('@', ''))}">${esc(c.instagram)}</a>` : '')}
          ${fila('Responsable', esc(c.responsable))}${fila('Estado', esc(c.estado))}
        </div>
        ${c.observaciones ? `<div class="field full mt-12"><label>Observaciones</label><div style="font-size:13px">${esc(c.observaciones)}</div></div>` : ''}`;
    }
    else if (clienteTab === 'servicios') {
      body.innerHTML = `
        <div class="flex" style="justify-content:space-between;margin-bottom:12px">
          <strong style="font-size:13px">Servicios contratados</strong>
          <div class="flex">
            <select id="srvPick" style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:8px;font-size:12px">
              ${DB.SERVICIOS.map(s => `<option value="${s.id}">${s.nombre} — ${fmtMoney(s.precio)}${s.recurrente ? '/mes' : ''}</option>`).join('')}
            </select>
            <button class="btn-secondary" style="padding:7px 12px" id="btnAddSrv">${icon('plus')}Agregar</button>
          </div>
        </div>

        <div class="content-card" style="margin-bottom:16px;border-style:dashed">
          <div class="cell-strong flex" style="font-size:13px;margin-bottom:10px;gap:7px">${icon('sliders')} Armar plan a medida</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px">
            <div class="field"><label>Nombre</label><input id="cpNombre" placeholder="Ej: Medio plan" /></div>
            <div class="field"><label>Carruseles</label><input id="cpCar" type="number" min="0" value="0" /></div>
            <div class="field"><label>Estáticas</label><input id="cpEst" type="number" min="0" value="0" /></div>
            <div class="field"><label>Reels</label><input id="cpReel" type="number" min="0" value="0" /></div>
            <div class="field"><label>Precio ($)</label><input id="cpPrecio" type="number" min="0" value="0" /></div>
          </div>
          <div class="flex" style="justify-content:space-between;margin-top:12px">
            <label class="flex" style="font-size:12px;color:var(--text-dim);cursor:pointer"><input type="checkbox" id="cpRec" checked style="width:auto" /> Mensual recurrente</label>
            <button class="btn-primary" style="padding:8px 16px" id="btnAddCustom">${icon('plus')}Agregar plan</button>
          </div>
        </div>

        ${c.servicios.length ? c.servicios.map(s => `
          <div class="content-card" style="margin-bottom:10px">
            <div class="flex" style="justify-content:space-between">
              <div><div class="cell-strong">${esc(s.nombre)}${s.custom ? ' <span class="tag" style="color:var(--accent)">a medida</span>' : ''}</div>
              <div class="cell-dim" style="font-size:12px">${s.detalle ? esc(s.detalle) + ' · ' : ''}${esc(s.cat)} · desde ${fmtDate(s.desde)}</div></div>
              <div class="flex"><span class="cell-strong">${fmtMoney(s.precio)}${s.recurrente ? '<span class="muted" style="font-weight:400">/mes</span>' : ''}</span>
              <button class="icon-btn danger" onclick="TNR.quitarSrv('${c.id}','${s.id}')">${icon('trash')}</button></div>
            </div></div>`).join('')
        : '<div class="muted" style="font-size:13px">Sin servicios. Elegí un plan del selector o armá uno a medida.</div>'}`;
      $('#btnAddSrv').onclick = () => { DB.agregarServicioCliente(c.id, $('#srvPick').value); toast('Servicio agregado', 'ok'); abrirCliente(c.id, 'servicios'); };
      $('#btnAddCustom').onclick = () => {
        const car = +$('#cpCar').value || 0, est = +$('#cpEst').value || 0, reel = +$('#cpReel').value || 0, precio = +$('#cpPrecio').value || 0;
        if (car + est + reel === 0) { toast('Poné al menos 1 contenido', 'err'); return; }
        DB.agregarServicioPersonalizado(c.id, { nombre: $('#cpNombre').value, carrusel: car, estatica: est, reel: reel, precio: precio, recurrente: $('#cpRec').checked });
        toast('Plan a medida agregado', 'ok'); abrirCliente(c.id, 'servicios');
      };
    }
    else if (clienteTab === 'produccion') {
      const tot = c.contenidos.length, pub = c.contenidos.filter(x => x.estado === 'Publicado').length, pend = tot - pub;
      const pct = tot ? Math.round(pub / tot * 100) : 0;
      body.innerHTML = `
        <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));margin-bottom:16px">
          ${kpi('Contratados', tot, '#1466bd', '')}${kpi('Publicados', pub, '#3ecf8e', '')}
          ${kpi('Pendientes', pend, '#f59e42', '')}${kpi('Avance', pct + '%', '#1C9FE2', '')}
        </div>
        <div class="progress-bar" style="height:10px;margin-bottom:16px"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="flex" style="justify-content:space-between;margin-bottom:12px"><strong style="font-size:13px">Calendario de contenido</strong>
          <button class="btn-secondary" style="padding:6px 12px" id="btnAddCont">${icon('plus')}Contenido</button></div>
        ${tot ? `<div class="cal-grid">${c.contenidos.map(ct => `
          <div class="content-card">
            <div class="cc-head"><span class="cc-type">${esc(ct.tipo)}</span><span class="cell-dim" style="font-size:11px">${esc(ct.titulo)}</span></div>
            <select onchange="TNR.setContEstado('${c.id}','${ct.id}',this.value)">
              ${DB.ESTADOS_CONTENIDO.map(e => `<option ${ct.estado === e ? 'selected' : ''}>${e}</option>`).join('')}
            </select>
          </div>`).join('')}</div>` : '<div class="muted" style="font-size:13px">Sin contenidos. Agregá un plan de redes o cargá contenidos manualmente.</div>'}`;
      $('#btnAddCont').onclick = () => {
        const tipo = prompt('Tipo (Carrusel / Estática / Reel):', 'Carrusel');
        if (!tipo) return;
        DB.agregarContenido(c.id, { tipo, titulo: tipo });
        abrirCliente(c.id, 'produccion');
      };
    }
    else if (clienteTab === 'facturacion') {
      const fin = DB.finanzasCliente(c);
      const pagos = c.pagos || [];
      body.innerHTML = `
        <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));margin-bottom:14px">
          ${kpi('Facturado', fmtMoney(fin.facturado), '#1466bd', '')}
          ${kpi('Cobrado', fmtMoney(fin.cobrado), '#3ecf8e', '')}
          ${kpi('Saldo', fmtMoney(fin.saldo), fin.color, fin.saldo > 0 ? 'Adeudado' : 'Sin deuda')}
        </div>
        <div class="flex gap-wrap" style="justify-content:space-between;margin-bottom:16px">
          <span class="chip" style="background:${fin.color}22;color:${fin.color}"><span class="chip-dot" style="background:${fin.color}"></span>${fin.estado}</span>
          <div class="flex gap-wrap">
            <button class="btn-secondary" style="padding:7px 12px" id="btnAddFc">${icon('plus')}Concepto facturado</button>
            <button class="btn-primary" style="padding:7px 12px" id="btnAddPago">${icon('plus')}Registrar pago</button>
          </div>
        </div>

        <div class="panel-title" style="font-size:13px;margin-bottom:8px">Historial de facturación</div>
        ${c.facturacion.length ? `<div class="table-wrap" style="margin-bottom:20px"><table><thead><tr><th>Concepto</th><th>Fecha</th><th>Monto</th><th>Observaciones</th><th></th></tr></thead>
          <tbody>${c.facturacion.map(f => `<tr>
            <td data-label="Concepto" class="cell-strong">${esc(f.concepto || '—')}</td>
            <td data-label="Fecha" class="cell-dim">${fmtDate(f.fecha)}</td>
            <td data-label="Monto" class="cell-strong">${fmtMoney(f.monto)}</td>
            <td data-label="Obs." class="cell-dim">${esc(f.observaciones || '—')}</td>
            <td data-label=""><div class="row-actions">
              <button class="icon-btn" title="Editar" onclick="TNR.editarFactura('${c.id}','${f.id}')">${icon('edit')}</button>
              <button class="icon-btn" title="Duplicar" onclick="TNR.duplicarFactura('${c.id}','${f.id}')">${icon('copy')}</button>
              <button class="icon-btn danger" title="Eliminar" onclick="TNR.borrarFactura('${c.id}','${f.id}')">${icon('trash')}</button>
            </div></td>
          </tr>`).join('')}</tbody></table></div>`
        : '<div class="muted" style="font-size:13px;margin-bottom:20px">Sin conceptos facturados.</div>'}

        <div class="panel-title" style="font-size:13px;margin-bottom:8px">Historial de pagos</div>
        ${pagos.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Observaciones</th><th></th></tr></thead>
          <tbody>${pagos.map(p => `<tr>
            <td data-label="Fecha" class="cell-dim">${fmtDate(p.fecha)}</td>
            <td data-label="Monto" class="cell-strong" style="color:#3ecf8e">${fmtMoney(p.monto)}</td>
            <td data-label="Método"><span class="tag">${esc(p.metodo)}</span></td>
            <td data-label="Obs." class="cell-dim">${esc(p.observaciones || '—')}</td>
            <td data-label=""><div class="row-actions">
              <button class="icon-btn" title="Editar" onclick="TNR.editarPago('${c.id}','${p.id}')">${icon('edit')}</button>
              <button class="icon-btn danger" title="Eliminar" onclick="TNR.borrarPago('${c.id}','${p.id}')">${icon('trash')}</button>
            </div></td>
          </tr>`).join('')}</tbody></table></div>`
        : '<div class="muted" style="font-size:13px">Sin pagos registrados. Usá “Registrar pago”.</div>'}`;
      $('#btnAddFc').onclick = () => formFactura(c.id);
      $('#btnAddPago').onclick = () => formPago(c.id);
    }
    else if (clienteTab === 'historial') {
      body.innerHTML = `
        <div class="add-note"><select id="cNoteTipo"><option>Nota</option><option>Llamada</option><option>Mensaje</option><option>Reunión</option><option>Entrega</option></select>
        <input id="cNoteText" placeholder="Agregar al historial…" /><button class="btn-secondary" id="cBtnNote" style="padding:8px 14px">${icon('plus')}</button></div>
        <div class="timeline mt-20">${(c.historial || []).map(h => `<div class="tl-item"><div class="tl-dot"></div><div class="tl-content">
          <div class="tl-type">${esc(h.tipo)}</div><div class="tl-text">${esc(h.texto)}</div><div class="tl-date">${fmtDateTime(h.fecha)}</div></div></div>`).join('')}</div>`;
      const add = () => { const t = $('#cNoteText').value.trim(); if (!t) return; DB.agregarHistorialCliente(c.id, $('#cNoteTipo').value, t); abrirCliente(c.id, 'historial'); };
      $('#cBtnNote').onclick = add;
      $('#cNoteText').onkeydown = e => { if (e.key === 'Enter') add(); };
    }
  }

  /* ---------- Formularios financieros ---------- */
  function formFactura(clienteId, fcId) {
    const c = DB.getCliente(clienteId);
    const f = fcId ? c.facturacion.find(x => x.id === fcId) : null;
    openModal(fcId ? 'Editar concepto facturado' : 'Nuevo concepto facturado', `
      <form id="formFc"><div class="form-grid">
        <div class="field full"><label>Concepto / Servicio</label><input name="concepto" value="${esc(f ? f.concepto : '')}" placeholder="Ej: Plan Básico — Junio" /></div>
        <div class="field"><label>Importe ($)</label><input name="monto" type="number" min="0" step="1" value="${f ? f.monto : ''}" /></div>
        <div class="field"><label>Fecha</label><input name="fecha" type="date" value="${f ? (f.fecha || '').slice(0, 10) : todayStr()}" /></div>
        <div class="field full"><label>Observaciones</label><textarea name="observaciones">${esc(f ? (f.observaciones || '') : '')}</textarea></div>
      </div><div class="form-foot">
        <button type="button" class="btn-secondary" onclick="TNR.volverCliente('${clienteId}','facturacion')">Cancelar</button>
        <button type="submit" class="btn-primary">${fcId ? 'Guardar cambios' : 'Agregar'}</button>
      </div></form>`);
    $('#formFc').onsubmit = (e) => {
      e.preventDefault();
      const d = readForm('formFc');
      if (!d.concepto && !(+d.monto)) { toast('Completá concepto e importe', 'err'); return; }
      const datos = { concepto: d.concepto, monto: +d.monto || 0, fecha: d.fecha, observaciones: d.observaciones };
      if (fcId) DB.actualizarFactura(clienteId, fcId, datos); else DB.agregarFactura(clienteId, datos);
      toast('Facturación guardada', 'ok'); abrirCliente(clienteId, 'facturacion');
    };
  }

  function formPago(clienteId, pagoId) {
    const c = DB.getCliente(clienteId);
    const p = pagoId ? (c.pagos || []).find(x => x.id === pagoId) : null;
    const fin = DB.finanzasCliente(c);
    const metodos = ['Efectivo', 'Transferencia', 'Mercado Pago', 'Tarjeta', 'Otro'];
    openModal(pagoId ? 'Editar pago' : 'Registrar pago', `
      <form id="formPg"><div class="form-grid">
        <div class="field"><label>Monto ($)</label><input name="monto" type="number" min="0" step="1" value="${p ? p.monto : ''}" /></div>
        <div class="field"><label>Fecha</label><input name="fecha" type="date" value="${p ? (p.fecha || '').slice(0, 10) : todayStr()}" /></div>
        <div class="field"><label>Método</label><select name="metodo">${metodos.map(m => `<option ${p && p.metodo === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="field"><label>Saldo actual</label><div style="font-size:15px;font-weight:700;color:${fin.color};padding:7px 0">${fmtMoney(fin.saldo)}</div></div>
        <div class="field full"><label>Observaciones</label><textarea name="observaciones">${esc(p ? (p.observaciones || '') : '')}</textarea></div>
      </div><div class="form-foot">
        <button type="button" class="btn-secondary" onclick="TNR.volverCliente('${clienteId}','facturacion')">Cancelar</button>
        <button type="submit" class="btn-primary">${pagoId ? 'Guardar cambios' : 'Registrar pago'}</button>
      </div></form>`);
    $('#formPg').onsubmit = (e) => {
      e.preventDefault();
      const d = readForm('formPg');
      if (!(+d.monto)) { toast('Ingresá el monto del pago', 'err'); return; }
      const datos = { monto: +d.monto || 0, fecha: d.fecha, metodo: d.metodo, observaciones: d.observaciones };
      if (pagoId) DB.actualizarPago(clienteId, pagoId, datos); else DB.registrarPago(clienteId, datos);
      toast('Pago guardado', 'ok'); abrirCliente(clienteId, 'facturacion');
    };
  }

  /* ============================================================
     TAREAS — la pantalla vive en so-vista.js (window.SOVista).
     Acá quedan sólo los atajos que usan otras vistas del CRM.
     ============================================================ */
  function nuevaTarea(prefill) { if (window.SO) SO.nuevaTarea(prefill); }
  function editarTarea(id) { if (window.SO) SO.abrirTarea(id); }
  function finalizarTarea(id) { DB.actualizarTarea(id, { estado: 'Finalizada' }); toast('Tarea finalizada', 'ok'); render(); }
  function borrarTarea(id) { confirmDialog('Eliminar tarea', '¿Eliminar esta tarea?', 'Eliminar', () => { DB.eliminarTarea(id); render(); }, true); }

  /* ============================================================
     NOTIFICACIONES
     ============================================================ */
  function notifDismissed() { try { return JSON.parse(localStorage.getItem('tnr_notif_dismissed') || '[]'); } catch (e) { return []; } }
  function notifDismiss(ids) { const s = new Set(notifDismissed()); (Array.isArray(ids) ? ids : [ids]).forEach(i => s.add(i)); localStorage.setItem('tnr_notif_dismissed', JSON.stringify([...s])); }

  function buildNotifs() {
    const out = [];
    DB.getProspectos().forEach(p => {
      if (p.fechaSeguimiento && !['Ganado', 'Perdido'].includes(p.estado)) {
        const d = daysUntil(p.fechaSeguimiento);
        if (d <= 3) out.push({ id: 'seg:' + p.id, tipo: 'Seguimiento', ic: 'bell', color: '#1C9FE2', titulo: `Seguir a ${p.empresa || p.nombre}`, meta: p.proximaAccion || p.estado, fecha: p.fechaSeguimiento, d, action: `TNR.abrirProspecto('${p.id}')` });
      }
    });
    DB.getTareas().forEach(t => {
      if (t.estado !== 'Finalizada' && t.fecha) {
        const d = daysUntil(t.fecha);
        if (d <= 3) out.push({ id: 'tk:' + t.id, tipo: 'Tarea', ic: 'check-square', color: '#f59e42', titulo: t.titulo, meta: t.responsable, fecha: t.fecha, d, action: `TNR.editarTarea('${t.id}')` });
      }
    });
    DB.getClientes().forEach(c => {
      if (c.estado !== 'Activo') return; // no cobranzas de clientes inactivos
      const fin = DB.finanzasCliente(c);
      if (fin.saldo > 0) {
        const venc = fin.estado === 'Vencido';
        out.push({ id: 'cb:' + c.id, tipo: 'Cobro', ic: 'wallet', color: venc ? '#ff5d6c' : '#f59e42', titulo: `Cobrar a ${c.empresa || c.nombre}`, meta: `${fin.estado} · adeuda ${fmtMoney(fin.saldo)}`, fecha: '', d: venc ? -1 : 0, action: `TNR.abrirCliente('${c.id}','facturacion')` });
      }
    });
    const dis = new Set(notifDismissed());
    return out.filter(n => !dis.has(n.id)).sort((a, b) => (a.d == null ? 99 : a.d) - (b.d == null ? 99 : b.d));
  }

  // Detección de inactividad operativa
  const SEV_COLOR = { amarillo: '#f5c451', naranja: '#f59e42', rojo: '#ff5d6c' };
  function buildInactividad() {
    const hoyMs = new Date(todayStr() + 'T00:00:00').getTime();
    const dias = (iso) => iso ? Math.floor((hoyMs - new Date(iso.slice(0, 10) + 'T00:00:00').getTime()) / 86400000) : null;
    const maxF = (arr, f) => { let m = null; arr.forEach(x => { const v = x[f]; if (v && (!m || v > m)) m = v; }); return m; };
    const clientes = DB.getClientes();
    let ultCli = null; clientes.forEach(c => { const h = (c.historial && c.historial[0]) ? c.historial[0].fecha : c.fechaCreacion; if (h && (!ultCli || h > ultCli)) ultCli = h; });
    let ultTarea = null; DB.getTareas().forEach(t => { if (t.estado === 'Finalizada') { const f = t.finalizadaEn || t.fechaCreacion; if (f && (!ultTarea || f > ultTarea)) ultTarea = f; } });
    const defs = [
      { d: dias(maxF(clientes, 'fechaCreacion')), w: 7, n: 14, r: 21, txt: 'no se registra una venta', accion: 'Cerrá un prospecto o sumá un cliente', view: 'clientes', ic: 'wallet' },
      { d: dias(maxF(DB.getProspectos(), 'fechaCreacion')), w: 3, n: 5, r: 7, txt: 'no se crea un lead', accion: 'Cargá nuevos prospectos', view: 'prospectos', ic: 'target' },
      { d: dias(ultCli), w: 7, n: 10, r: 15, txt: 'no se actualiza un cliente', accion: 'Revisá tus clientes activos', view: 'clientes', ic: 'users' },
      { d: dias(ultTarea), w: 3, n: 5, r: 7, txt: 'no se completa una tarea', accion: 'Completá tareas pendientes', view: 'tareas', ic: 'check-square' },
    ];
    const out = [];
    defs.forEach(def => {
      if (def.d == null) { out.push({ sev: 'rojo', frase: 'Todavía no hay registros: ' + def.txt.replace('no se ', ''), accion: def.accion, view: def.view, ic: def.ic }); return; }
      if (def.d >= def.w) { const sev = def.d >= def.r ? 'rojo' : def.d >= def.n ? 'naranja' : 'amarillo'; out.push({ sev, frase: `Hace ${def.d} día${def.d === 1 ? '' : 's'} que ${def.txt}`, accion: def.accion, view: def.view, ic: def.ic }); }
    });
    const ord = { rojo: 0, naranja: 1, amarillo: 2 };
    return out.sort((a, b) => ord[a.sev] - ord[b.sev]);
  }

  function renderNotificaciones() {
    const inact = buildInactividad();
    const list = buildNotifs();
    const reminders = list.map(n => {
      const cls = n.d < 0 ? 'overdue' : n.d === 0 ? 'today' : '';
      let dtxt;
      if (n.tipo === 'Cobro') dtxt = n.d < 0 ? 'Vencido' : 'A cobrar';
      else dtxt = n.d == null ? '' : n.d < 0 ? `Vencido hace ${Math.abs(n.d)}d` : n.d === 0 ? 'Hoy' : `En ${n.d} día${n.d > 1 ? 's' : ''}`;
      const metaFecha = n.fecha ? ' · ' + fmtDate(n.fecha) : '';
      return `<div class="notif-item ${cls}" style="cursor:pointer" onclick="${n.action}">
        <div class="n-ic" style="background:${n.color}22;color:${n.color}">${icon(n.ic, 18)}</div>
        <div class="n-body"><div class="n-title">${esc(n.titulo)}</div><div class="n-meta">${esc(n.tipo)} · ${esc(n.meta || '')}${metaFecha}</div></div>
        <span class="tag" style="${n.d < 0 ? 'color:#ff5d6c' : n.d === 0 ? 'color:#f5c451' : ''}">${dtxt}</span>
        <button class="notif-x" title="Descartar" onclick="event.stopPropagation();TNR.dismissNotif('${n.id}')">${icon('x', 15)}</button>
      </div>`;
    }).join('');

    view.innerHTML = `
      <div class="view-head">
        <div><h1>Notificaciones</h1><div class="sub">Alertas de inactividad y recordatorios</div></div>
        <div class="head-actions">
          ${list.length ? `<button class="btn-secondary" onclick="TNR.dismissAll()">${icon('trash')}<span class="btn-label"> Limpiar todas</span></button>` : ''}
          <button class="btn-secondary" onclick="TNR.activarNotif()">${icon('bell')}<span class="btn-label"> Activar en este dispositivo</span></button>
        </div>
      </div>

      <div class="panel-title" style="margin:2px 0 10px">Alertas de inactividad</div>
      ${inact.length ? inact.map(a => { const c = SEV_COLOR[a.sev]; return `<div class="notif-item" style="cursor:pointer;border-color:${c}" onclick="TNR.irA('${a.view}')">
        <div class="n-ic" style="background:${c}22;color:${c}">${icon(a.ic, 18)}</div>
        <div class="n-body"><div class="n-title">${esc(a.frase)}</div><div class="n-meta">Recomendado: ${esc(a.accion)}</div></div>
        <span class="tag" style="color:${c};text-transform:capitalize">${a.sev}</span>
      </div>`; }).join('')
        : `<div class="notif-item" style="border-color:#3ecf8e"><div class="n-ic" style="background:#3ecf8e22;color:#3ecf8e">${icon('check', 18)}</div><div class="n-body"><div class="n-title">Actividad al día</div><div class="n-meta">Ventas, leads, clientes y tareas con movimiento reciente</div></div></div>`}

      <div class="panel-title" style="margin:24px 0 10px">Recordatorios</div>
      ${reminders || '<div class="muted" style="font-size:13px">Sin seguimientos, tareas ni cobros próximos a vencer.</div>'}
    `;
  }
  function updateNotifBadge() {
    const overdue = buildNotifs().filter(x => x.d != null && x.d <= 0).length;
    const rojos = buildInactividad().filter(a => a.sev === 'rojo').length;
    const n = overdue + rojos;
    const b = $('#notifBadge');
    b.hidden = n === 0; b.textContent = n;
  }

  /* ============================================================
     BÚSQUEDA GLOBAL
     ============================================================ */
  function renderSearch() {
    const q = searchTerm.toLowerCase();
    const match = (o) => Object.values(o).some(v => typeof v === 'string' && v.toLowerCase().includes(q));
    const ps = DB.getProspectos().filter(p => match({ a: p.nombre, b: p.empresa, c: p.rubro, d: p.ciudad, e: p.estado, f: p.metodoContacto, g: p.observaciones }));
    const cs = DB.getClientes().filter(c => match({ a: c.nombre, b: c.empresa, c: c.rubro, d: c.ciudad, e: c.estado }) || c.servicios.some(s => s.nombre.toLowerCase().includes(q) || s.cat.toLowerCase().includes(q)));
    view.innerHTML = `
      <div class="view-head"><div><h1>Búsqueda: "${esc(searchTerm)}"</h1><div class="sub">${ps.length} prospectos · ${cs.length} clientes</div></div></div>
      ${ps.length ? `<div class="panel-title" style="margin:8px 0">Prospectos</div>${tablaProspectos(ps)}` : ''}
      ${cs.length ? `<div class="panel-title" style="margin:20px 0 8px">Clientes</div><div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Rubro</th><th>Ciudad</th><th>Estado</th></tr></thead><tbody>${cs.map(c => `<tr onclick="TNR.abrirCliente('${c.id}')"><td data-label="Cliente" class="cell-strong">${esc(c.empresa || c.nombre)}</td><td data-label="Rubro">${c.rubro ? `<span class="tag">${esc(c.rubro)}</span>` : '—'}</td><td data-label="Ciudad" class="cell-dim">${esc(c.ciudad) || '—'}</td><td data-label="Estado">${esc(c.estado)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${!ps.length && !cs.length ? emptyState('search', 'Sin resultados', `No se encontró nada para "${esc(searchTerm)}". Probá con un rubro, ciudad, estado o servicio.`) : ''}
    `;
  }
  $('#globalSearch').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    if (searchTerm) renderSearch(); else render();
  });

  /* ============================================================
     CALENDARIO
     ============================================================ */
  let calView = 'mes';
  let calCursor = new Date();
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DIAS_SEM = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function eventosDe(fechaStr) { return DB.getEventos().filter(e => e.fecha === fechaStr).sort((a, b) => (a.hora || '').localeCompare(b.hora || '')); }

  function renderCalendario() {
    let titulo;
    if (calView === 'dia') titulo = `${calCursor.getDate()} de ${MESES[calCursor.getMonth()]} ${calCursor.getFullYear()}`;
    else if (calView === 'semana') {
      const off = (calCursor.getDay() + 6) % 7; const s = new Date(calCursor); s.setDate(calCursor.getDate() - off);
      const e = new Date(s); e.setDate(s.getDate() + 6);
      titulo = `${s.getDate()} ${MESES[s.getMonth()].slice(0, 3)} – ${e.getDate()} ${MESES[e.getMonth()].slice(0, 3)} ${e.getFullYear()}`;
    } else titulo = `${MESES[calCursor.getMonth()]} ${calCursor.getFullYear()}`;

    view.innerHTML = `
      <div class="view-head">
        <div><h1>Calendario</h1><div class="sub">Agenda operativa del equipo</div></div>
        <div class="head-actions">
          <div class="seg">
            <button class="${calView === 'mes' ? 'active' : ''}" onclick="TNR.calVista('mes')">Mes</button>
            <button class="${calView === 'semana' ? 'active' : ''}" onclick="TNR.calVista('semana')">Semana</button>
            <button class="${calView === 'dia' ? 'active' : ''}" onclick="TNR.calVista('dia')">Día</button>
          </div>
          <button class="btn-primary" onclick="TNR.nuevoEvento()">${icon('plus')}<span class="btn-label"> Evento</span></button>
        </div>
      </div>
      <div class="cal-nav">
        <button class="icon-btn" onclick="TNR.calMover(-1)">${icon('chevron-left')}</button>
        <div class="cal-title">${titulo}</div>
        <button class="icon-btn" onclick="TNR.calMover(1)">${icon('chevron-right')}</button>
        <button class="btn-secondary" style="padding:7px 12px;margin-left:8px" onclick="TNR.calHoy()">Hoy</button>
      </div>
      ${calView === 'mes' ? calMes() : calView === 'semana' ? calSemana() : calDia()}
      <div class="cal-legend">${DB.CATEGORIAS_EVENTO.map(c => `<span class="cal-leg"><span class="cal-ev-dot" style="background:${c.color}"></span>${c.label}</span>`).join('')}</div>
    `;
  }

  function calMes() {
    const y = calCursor.getFullYear(), m = calCursor.getMonth();
    const off = (new Date(y, m, 1).getDay() + 6) % 7;
    const start = new Date(y, m, 1 - off);
    const todayS = todayStr();
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const ds = ymd(d), evs = eventosDe(ds), inMonth = d.getMonth() === m;
      cells += `<div class="cal-cell ${inMonth ? '' : 'out'} ${ds === todayS ? 'today' : ''}" onclick="TNR.nuevoEvento('${ds}')">
        <div class="cal-daynum">${d.getDate()}</div>
        <div class="cal-evs">${evs.slice(0, 3).map(e => { const c = DB.catEvento(e.tipo); return `<div class="cal-ev" style="background:${c.color}20;color:${c.color}" onclick="event.stopPropagation();TNR.editarEvento('${e.id}')"><span class="cal-ev-dot" style="background:${c.color}"></span>${e.hora ? esc(e.hora) + ' ' : ''}${esc(e.titulo)}</div>`; }).join('')}${evs.length > 3 ? `<div class="cal-more">+${evs.length - 3}</div>` : ''}</div>
      </div>`;
    }
    return `<div class="cal-month"><div class="cal-weekhead">${DIAS_SEM.map(d => `<div>${d}</div>`).join('')}</div><div class="cal-grid">${cells}</div></div>`;
  }

  function calSemana() {
    const off = (calCursor.getDay() + 6) % 7;
    const start = new Date(calCursor); start.setDate(calCursor.getDate() - off);
    const todayS = todayStr();
    let cols = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const ds = ymd(d), evs = eventosDe(ds);
      cols += `<div class="cal-wcol ${ds === todayS ? 'today' : ''}">
        <div class="cal-wday" onclick="TNR.nuevoEvento('${ds}')">${DIAS_SEM[i]} <strong>${d.getDate()}</strong></div>
        <div class="cal-wbody">${evs.map(calEvItem).join('') || '<div class="muted" style="font-size:11px;padding:8px 6px">—</div>'}</div>
      </div>`;
    }
    return `<div class="cal-week">${cols}</div>`;
  }

  function calDia() {
    const ds = ymd(calCursor), evs = eventosDe(ds);
    return `<div class="panel">${evs.length ? evs.map(calEvItem).join('') : '<div class="muted" style="font-size:13px">Sin eventos este día. Tocá “Evento” para agregar uno.</div>'}</div>`;
  }

  function calEvItem(e) {
    const c = DB.catEvento(e.tipo);
    const cli = e.clienteId ? DB.getCliente(e.clienteId) : null;
    return `<div class="cal-ev-item" onclick="TNR.editarEvento('${e.id}')">
      <span class="cal-ev-bar" style="background:${c.color}"></span>
      <div style="flex:1;min-width:0"><div class="cell-strong" style="font-size:13px">${e.hora ? esc(e.hora) + ' · ' : ''}${esc(e.titulo)}</div>
      <div class="cell-dim" style="font-size:12px">${c.label}${cli ? ' · ' + esc(cli.empresa || cli.nombre) : ''}${e.notas ? ' · ' + esc(e.notas) : ''}</div></div>
    </div>`;
  }

  function formEvento(eid, fechaPrefill) {
    const e = eid ? DB.getEvento(eid) : null;
    openModal(eid ? 'Editar evento' : 'Nuevo evento', `
      <form id="formEv"><div class="form-grid">
        <div class="field full"><label>Título</label><input name="titulo" value="${esc(e ? e.titulo : '')}" placeholder="Ej: Reunión con cliente" /></div>
        <div class="field"><label>Fecha</label><input name="fecha" type="date" value="${e ? e.fecha : (fechaPrefill || todayStr())}" /></div>
        <div class="field"><label>Hora</label><input name="hora" type="time" value="${esc(e ? e.hora : '')}" /></div>
        <div class="field"><label>Categoría</label><select name="tipo">${DB.CATEGORIAS_EVENTO.map(c => `<option value="${c.id}" ${e && e.tipo === c.id ? 'selected' : ''}>${c.label}</option>`).join('')}</select></div>
        <div class="field"><label>Cliente (opcional)</label><select name="clienteId"><option value="">—</option>${DB.getClientes().map(c => `<option value="${c.id}" ${e && e.clienteId === c.id ? 'selected' : ''}>${esc(c.empresa || c.nombre)}</option>`).join('')}</select></div>
        <div class="field full"><label>Notas</label><textarea name="notas">${esc(e ? e.notas : '')}</textarea></div>
      </div><div class="form-foot">
        ${eid ? `<button type="button" class="btn-secondary" style="margin-right:auto;color:var(--red)" onclick="TNR.borrarEvento('${eid}')">${icon('trash')} Eliminar</button>` : ''}
        <button type="button" class="btn-secondary" onclick="TNR.cerrar()">Cancelar</button>
        <button type="submit" class="btn-primary">${eid ? 'Guardar' : 'Crear evento'}</button>
      </div></form>`);
    $('#formEv').onsubmit = (ev) => {
      ev.preventDefault();
      const d = readForm('formEv');
      if (!d.titulo) { toast('Poné un título', 'err'); return; }
      if (eid) DB.actualizarEvento(eid, d); else DB.crearEvento(d);
      closeModal(); toast('Evento guardado', 'ok'); if (current === 'calendario') render();
    };
  }

  /* ============================================================
     PRODUCTIVIDAD (Metas + Cronómetro)
     ============================================================ */
  function mesId(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function mesAnterior(id) { const [y, m] = id.split('-').map(Number); const d = new Date(y, m - 2, 1); return mesId(d); }
  function mesLabel(id) { const [y, m] = id.split('-').map(Number); return `${MESES[m - 1]} ${y}`; }

  function metricasMes(id) {
    const inM = (iso) => iso && iso.slice(0, 7) === id;
    let facturacion = 0;
    DB.getClientes().forEach(c => (c.facturacion || []).forEach(f => { if (inM(f.fecha)) facturacion += (+f.monto || 0); }));
    return {
      leads: DB.getProspectos().filter(p => inM(p.fechaCreacion)).length,
      ventas: DB.getProspectos().filter(p => p.estado === 'Ganado' && inM(p.fechaCreacion)).length,
      clientes: DB.getClientes().filter(c => inM(c.fechaCreacion)).length,
      facturacion,
      reuniones: DB.getEventos().filter(e => e.tipo === 'reunion' && inM(e.fecha)).length,
      llamadas: DB.getEventos().filter(e => e.tipo === 'llamada' && inM(e.fecha)).length,
    };
  }

  function fmtDur(sec) {
    sec = Math.floor(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  }
  function fmtHMS(sec) {
    sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return [h, m, s].map(x => String(x).padStart(2, '0')).join(':');
  }

  /* --- Cronómetro (estado a nivel de módulo, persiste entre vistas) --- */
  const timer = { running: false, acc: 0, startedAt: 0, cat: 'Ventas', handle: null };
  function timerElapsed() { return timer.acc + (timer.running ? (Date.now() - timer.startedAt) / 1000 : 0); }
  function timerTick() { const el = document.getElementById('timerDisplay'); if (el) el.textContent = fmtHMS(timerElapsed()); }
  function timerStart() {
    if (timer.running) return;
    timer.startedAt = Date.now(); timer.running = true;
    if (!timer.handle) timer.handle = setInterval(timerTick, 1000);
    if (current === 'metas') renderMetas();
  }
  function timerPause() { if (!timer.running) return; timer.acc = timerElapsed(); timer.running = false; if (current === 'metas') renderMetas(); }
  function timerStop() {
    const total = timerElapsed();
    if (total >= 1) { DB.registrarTiempo({ categoria: timer.cat, segundos: Math.round(total) }); toast('Sesión guardada: ' + fmtDur(total), 'ok'); }
    timer.acc = 0; timer.running = false;
    if (current === 'metas') renderMetas();
  }
  function timerReset() { timer.acc = 0; timer.running = false; if (current === 'metas') renderMetas(); }

  function renderMetas() {
    const id = mesId();
    const meta = DB.getMeta(id) || {};
    const actual = metricasMes(id);
    const prev = metricasMes(mesAnterior(id));

    const metaRows = DB.METRICAS_META.map(mt => {
      const target = +meta[mt.id] || 0;
      const val = actual[mt.id] || 0;
      const pa = prev[mt.id] || 0;
      const pct = target > 0 ? Math.min(100, Math.round(val / target * 100)) : 0;
      const rest = Math.max(0, target - val);
      const fmtV = (n) => mt.money ? fmtMoney(n) : n;
      const delta = val - pa;
      const trend = delta > 0 ? `<span style="color:#3ecf8e">${icon('trending-up', 13)} +${mt.money ? fmtMoney(delta) : delta}</span>` : delta < 0 ? `<span style="color:#ff5d6c">${icon('trending-down', 13)} ${mt.money ? fmtMoney(delta) : delta}</span>` : `<span class="muted">=</span>`;
      const col = pct >= 100 ? '#3ecf8e' : pct >= 50 ? '#f5c451' : '#1C9FE2';
      return `<div class="meta-row">
        <div class="meta-top">
          <span class="meta-name">${mt.label}</span>
          <span class="meta-val">${fmtV(val)} <span class="muted">/ <input class="meta-input" type="number" min="0" id="meta_${mt.id}" value="${target || ''}" placeholder="meta" /></span></span>
        </div>
        <div class="progress-bar" style="height:9px"><div class="progress-fill" style="width:${pct}%;background:${col}"></div></div>
        <div class="meta-foot"><span>${pct}%${rest > 0 ? ` · faltan ${fmtV(rest)}` : ' · cumplida'}</span><span>${trend} <span class="muted">vs mes ant.</span></span></div>
      </div>`;
    }).join('');

    // Cronómetro stats
    const tiempos = DB.getTiempos();
    const todayS = todayStr(), mesActual = id;
    const sum = (fn) => tiempos.filter(fn).reduce((a, t) => a + t.segundos, 0);
    const hoy = sum(t => (t.fecha || '').slice(0, 10) === todayS);
    const semana = sum(t => { const d = daysUntil((t.fecha || '').slice(0, 10)); return d != null && d <= 0 && d > -7; });
    const mes = sum(t => (t.fecha || '').slice(0, 7) === mesActual);
    const byCat = {}; tiempos.forEach(t => byCat[t.categoria] = (byCat[t.categoria] || 0) + t.segundos);
    const topCat = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a])[0];
    const dias = new Set(tiempos.map(t => (t.fecha || '').slice(0, 10))); const totalAll = sum(() => true);
    const prom = dias.size ? totalAll / dias.size : 0;

    view.innerHTML = `
      <div class="view-head">
        <div><h1>Metas del mes</h1><div class="sub">Objetivos comerciales y cronómetro · ${mesLabel(id)}</div></div>
        <div class="head-actions"><button class="btn-primary" onclick="TNR.guardarMetas()">${icon('flag')}<span class="btn-label"> Guardar metas</span></button></div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <div class="panel-title">${icon('trophy', 16)} Metas del mes <span class="muted" style="font-weight:400;font-size:11px">editá el número objetivo</span></div>
          <div class="metas">${metaRows}</div>
        </div>

        <div class="panel">
          <div class="panel-title">${icon('clock', 16)} Cronómetro de productividad</div>
          <div class="timer-display" id="timerDisplay">${fmtHMS(timerElapsed())}</div>
          <div class="timer-cat">
            <label class="muted" style="font-size:12px">Categoría</label>
            <select id="timerCat" onchange="TNR.setTimerCat(this.value)" ${timer.running ? 'disabled' : ''}>
              ${DB.CATEGORIAS_TIEMPO.map(c => `<option ${timer.cat === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="timer-controls">
            ${timer.running
        ? `<button class="btn-secondary" onclick="TNR.timer('pause')">${icon('pause')} Pausar</button>`
        : `<button class="btn-primary" onclick="TNR.timer('start')">${icon('play')} ${timer.acc > 0 ? 'Reanudar' : 'Iniciar'}</button>`}
            <button class="btn-secondary" onclick="TNR.timer('stop')">${icon('stop')} Detener</button>
            <button class="btn-secondary" onclick="TNR.timer('reset')">${icon('reset')} Reiniciar</button>
          </div>
          <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-top:18px">
            ${kpi('Hoy', fmtDur(hoy), '#1C9FE2', '')}
            ${kpi('Semana', fmtDur(semana), '#7c5cff', '')}
            ${kpi('Mes', fmtDur(mes), '#3ecf8e', '')}
          </div>
          <div class="flex" style="justify-content:space-between;margin-top:14px;font-size:13px">
            <span class="muted">Actividad top</span><strong>${topCat ? esc(topCat) + ' (' + fmtDur(byCat[topCat]) + ')' : '—'}</strong>
          </div>
          <div class="flex" style="justify-content:space-between;margin-top:6px;font-size:13px">
            <span class="muted">Promedio diario</span><strong>${fmtDur(prom)}</strong>
          </div>
        </div>
      </div>
    `;
  }

  /* ============================================================
     EMPTY STATE
     ============================================================ */
  function emptyState(ic, title, text, action) {
    return `<div class="empty"><div class="e-ic">${icon(ic, 40)}</div><h3>${title}</h3><p>${text}</p>${action ? `<button class="btn-primary" onclick="${action}">${icon('plus')} Crear</button>` : ''}</div>`;
  }

  /* ============================================================
     SIDEBAR MÓVIL
     ============================================================ */
  const sidebar = $('#sidebar');
  let backdrop;
  function openSidebar() {
    sidebar.classList.add('open');
    if (!backdrop) { backdrop = document.createElement('div'); backdrop.className = 'sidebar-backdrop'; backdrop.onclick = closeSidebar; document.body.appendChild(backdrop); }
    backdrop.classList.add('show');
  }
  function closeSidebar() { sidebar.classList.remove('open'); if (backdrop) backdrop.classList.remove('show'); }
  $('#hamburger').onclick = () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar();

  /* Bottom nav (mobile) — navegación con una mano; reutiliza .nav-item para el estado activo */
  (function buildBottomNav() {
    // Lo que se toca todos los días, al alcance del pulgar. El resto, en "Más".
    const items = [
      { v: 'hoy', ic: 'sun', label: 'Hoy' },
      { v: 'tareas', ic: 'check-square', label: 'Tareas' },
      { v: 'proyectos', ic: 'folder', label: 'Proyectos' },
      { v: 'prospectos', ic: 'target', label: 'Prospección' },
      { v: '__more', ic: 'menu', label: 'Más' },
    ];
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.innerHTML = items.map(it => `<button class="bn-item${it.v !== '__more' ? ' nav-item' : ''}"${it.v !== '__more' ? ` data-view="${it.v}"` : ''} data-bn="${it.v}"><span class="bn-ic" data-ic="${it.ic}"></span><span>${it.label}</span></button>`).join('');
    document.getElementById('app').appendChild(nav);
    nav.querySelectorAll('button').forEach(b => b.onclick = () => {
      const v = b.dataset.bn;
      if (v === '__more') sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
      else setView(v);
    });
    if (window.Icons) Icons.paintStatic();
  })();

  /* ============================================================
     BACKUP / RESTORE
     ============================================================ */
  $('#btnQuickAdd').onclick = () => nuevoProspecto();
  $('#btnExport').onclick = () => {
    const blob = new Blob([DB.exportar()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tnr-backup-' + todayStr() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup descargado', 'ok');
  };
  /* Carga masiva de una base de prospección. A diferencia de "Restaurar", NO pisa nada. */
  function importarBase() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = () => {
      const file = inp.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const arr = Array.isArray(parsed) ? parsed : parsed.prospectos;
          const r = DB.importarProspectos(arr);
          toast(`${r.creados} prospectos importados${r.omitidos ? ` · ${r.omitidos} ya estaban` : ''}`, 'ok');
          renderProspectos();
        } catch (err) { toast('Archivo inválido: ' + err.message, 'err'); }
      };
      reader.readAsText(file);
    };
    inp.click();
  }

  $('#btnImport').onclick = () => $('#importFile').click();
  $('#importFile').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { DB.importar(reader.result); toast('Datos restaurados', 'ok'); render(); }
      catch (err) { toast('Archivo inválido', 'err'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  /* ============================================================
     API GLOBAL (para onclick inline)
     ============================================================ */
  window.TNR = {
    nuevoProspecto, editarProspecto, borrarProspecto, abrirProspecto, nuevoProspectoChat, revisarParse, convertirCliente,
    importarBase,
    clearFiltros: () => { Object.keys(pFilters).forEach(k => pFilters[k] = ''); pPage = 1; renderProspectos(); },
    analizarProspecto, genMensaje, copiarMsg, marcarContacto, mensajeWhatsApp,
    nuevoCliente, editarCliente, borrarCliente, abrirCliente,
    quitarSrv: (cid, sid) => { DB.quitarServicioCliente(cid, sid); abrirCliente(cid, 'servicios'); },
    setContEstado: (cid, ctid, v) => { DB.actualizarContenido(cid, ctid, { estado: v }); },
    volverCliente: (cid, tab) => abrirCliente(cid, tab),
    editarFactura: (cid, fid) => formFactura(cid, fid),
    duplicarFactura: (cid, fid) => { DB.duplicarFactura(cid, fid); toast('Concepto duplicado', 'ok'); abrirCliente(cid, 'facturacion'); },
    borrarFactura: (cid, fid) => confirmDialog('Eliminar facturación', '¿Seguro que deseas eliminar esta facturación?', 'Eliminar', () => { DB.eliminarFactura(cid, fid); toast('Facturación eliminada'); abrirCliente(cid, 'facturacion'); }, true),
    editarPago: (cid, pid) => formPago(cid, pid),
    borrarPago: (cid, pid) => confirmDialog('Eliminar pago', '¿Seguro que deseas eliminar este pago?', 'Eliminar', () => { DB.eliminarPago(cid, pid); toast('Pago eliminado'); abrirCliente(cid, 'facturacion'); }, true),
    nuevaTarea, editarTarea, finalizarTarea, borrarTarea, abrirTarea: editarTarea,
    // Calendario
    calVista: (v) => { calView = v; renderCalendario(); },
    calHoy: () => { calCursor = new Date(); renderCalendario(); },
    calMover: (delta) => {
      if (calView === 'mes') calCursor.setMonth(calCursor.getMonth() + delta);
      else if (calView === 'semana') calCursor.setDate(calCursor.getDate() + delta * 7);
      else calCursor.setDate(calCursor.getDate() + delta);
      calCursor = new Date(calCursor); renderCalendario();
    },
    nuevoEvento: (fecha) => formEvento(null, fecha),
    editarEvento: (id) => formEvento(id),
    borrarEvento: (id) => confirmDialog('Eliminar evento', '¿Eliminar este evento?', 'Eliminar', () => { DB.eliminarEvento(id); closeModal(); toast('Evento eliminado'); if (current === 'calendario') render(); }, true),
    // Productividad
    guardarMetas: () => {
      const id = mesId(); const vals = {};
      DB.METRICAS_META.forEach(mt => { const el = $('#meta_' + mt.id); if (el) vals[mt.id] = +el.value || 0; });
      DB.guardarMeta(id, vals); toast('Metas guardadas', 'ok'); renderMetas();
    },
    timer: (action) => { ({ start: timerStart, pause: timerPause, stop: timerStop, reset: timerReset }[action] || function () {})(); },
    setTimerCat: (c) => { timer.cat = c; },
    irA: (v) => setView(v),
    activarNotif: () => activarNotificaciones(),
    dismissNotif: (id) => { notifDismiss(id); if (current === 'notificaciones') renderNotificaciones(); updateNotifBadge(); },
    dismissAll: () => { const ids = buildNotifs().map(n => n.id); if (!ids.length) return; confirmDialog('Limpiar notificaciones', `¿Descartar las ${ids.length} notificaciones? Podrás volver a verlas si cambian los datos.`, 'Limpiar todas', () => { notifDismiss(ids); if (current === 'notificaciones') renderNotificaciones(); updateNotifBadge(); toast('Notificaciones limpiadas', 'ok'); }); },
    cerrar: closeModal,
  };

  /* ---------- Estado de conexión ---------- */
  function setCloudStatus(online) {
    const el = $('#cloudStatus'), txt = $('#cloudStatusText');
    if (!el) return;
    if (online) { el.className = 'cloud-status online'; txt.textContent = 'Nube conectada · datos compartidos'; el.title = 'Vos y tu equipo ven los mismos datos en tiempo real.'; }
    else { el.className = 'cloud-status local'; txt.textContent = 'Modo local (este dispositivo)'; el.title = 'Sin conexión a la nube. Los datos se guardan solo en este navegador.'; }
  }

  /* ---------- PWA + Notificaciones del dispositivo ---------- */
  function initPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(e => console.warn('No se pudo registrar el service worker', e));
    }
  }
  function notifSoportada() { return 'Notification' in window; }
  function activarNotificaciones() {
    if (!notifSoportada()) { toast('Este navegador no soporta notificaciones', 'err'); return; }
    Notification.requestPermission().then(async (p) => {
      if (p !== 'granted') { toast('No se concedió el permiso de notificaciones', 'err'); return; }
      toast('Notificaciones activadas en este dispositivo', 'ok');
      notificarResumen(true);
      // Push remoto (app cerrada): solo si hay VAPID configurada + soporte
      if (window.VAPID_PUBLIC && navigator.serviceWorker && 'PushManager' in window) {
        try {
          const reg = await navigator.serviceWorker.ready;
          let sub = await reg.pushManager.getSubscription();
          if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(window.VAPID_PUBLIC) });
          const ok = await DB.guardarPushSub(sub.toJSON());
          if (ok) toast('Push remoto activado en este dispositivo', 'ok');
        } catch (e) { console.warn('No se pudo suscribir al push', e); }
      }
    });
  }
  function urlB64ToUint8(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const base = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base);
    return Uint8Array.from(Array.prototype.map.call(raw, c => c.charCodeAt(0)));
  }
  // Muestra un resumen de alertas (una vez por día, salvo que se fuerce)
  function notificarResumen(force) {
    if (!notifSoportada() || Notification.permission !== 'granted') return;
    const hoy = todayStr();
    if (!force && localStorage.getItem('tnr_lastNotif') === hoy) return;
    const inact = buildInactividad().filter(a => a.sev === 'rojo' || a.sev === 'naranja');
    const overdue = buildNotifs().filter(x => x.d != null && x.d <= 0);
    const total = inact.length + overdue.length;
    if (total === 0) return;
    localStorage.setItem('tnr_lastNotif', hoy);
    const lineas = [];
    if (inact[0]) lineas.push(inact[0].frase);
    if (overdue.length) lineas.push(`${overdue.length} recordatorio${overdue.length > 1 ? 's' : ''} por vencer`);
    const titulo = `TNR · ${total} alerta${total > 1 ? 's' : ''}`;
    const opts = { body: lineas.join(' · '), icon: 'logo.png', badge: 'logo.png', tag: 'tnr-resumen' };
    // Preferir el service worker (funciona mejor en mobile / PWA instalada)
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(reg => reg.showNotification(titulo, opts)).catch(() => { try { new Notification(titulo, opts); } catch (_) {} });
    } else { try { new Notification(titulo, opts); } catch (_) {} }
  }

  /* ============================================================
     TEMA
     ------------------------------------------------------------
     Dos paletas sobre el mismo sistema: "azul" (el marino de marca) y
     "oscuro" (negro neutro). Sólo cambian los colores base; el celeste
     del logo se queda en las dos.

     Se guarda en ESTE aparato, no en la nube: el celular puede estar en
     oscuro y la compu en azul, y a nadie le cambia el tema porque el otro
     lo tocó. La aplicación inicial la hace un script en el <head>, antes
     de pintar, para que no haya parpadeo al abrir.
     ============================================================ */
  const TEMAS = { azul: '#0b2240', oscuro: '#0a0a0d' };
  function temaActual() {
    try { return localStorage.getItem('tnr_tema') || 'azul'; } catch (e) { return 'azul'; }
  }
  function aplicarTema(id) {
    if (!TEMAS[id]) id = 'azul';
    if (id === 'azul') document.documentElement.removeAttribute('data-tema');
    else document.documentElement.setAttribute('data-tema', id);
    try { localStorage.setItem('tnr_tema', id); } catch (e) {}
    // La barra del navegador en el celular también tiene que acompañar.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', TEMAS[id]);
    $$('#temaPick button').forEach(b => b.classList.toggle('on', b.dataset.tema === id));
  }
  function initTema() {
    aplicarTema(temaActual());
    $$('#temaPick button').forEach(b => b.onclick = () => {
      aplicarTema(b.dataset.tema);
      toast(b.dataset.tema === 'oscuro' ? 'Tema oscuro' : 'Tema azul TNR', 'ok');
    });
  }

  /* ---------- Quién está usando el CRM ---------- */
  function pintarUsuario() {
    const p = window.Auth && Auth.perfil;
    const box = $('#userBox');
    if (!box) return;
    if (!p) { box.hidden = true; return; }
    box.hidden = false;
    $('#userName').textContent = p.nombre;
    $('#userMail').textContent = p.email || '';
    const salir = $('#btnSalir');
    if (salir) salir.onclick = () => confirmDialog('Cerrar sesión', '¿Salir del sistema en este dispositivo?', 'Salir', () => Auth.salir());
    if (window.Icons) Icons.paintStatic();
  }

  /* ---------- Arranque de la app (ya con sesión) ---------- */
  function arrancarApp() {
    if (window.Icons) Icons.paintStatic(); // iconos estáticos del sidebar/topbar/modal
    initTema();
    initPWA();
    pintarUsuario();
    DB.onRemoteChange = () => { searchTerm ? renderSearch() : render(); };
    setView('hoy'); // render inmediato con datos locales/cacheados
    DB.init().then((online) => {
      setCloudStatus(online);
      // Recién ahora, con los datos de la nube abajo, se fabrica el día:
      // si se generara antes, se duplicarían tareas que ya existen allá.
      try { if (window.Sistema) Sistema.arrancar(); } catch (e) { console.error('Sistema', e); }
      searchTerm ? renderSearch() : render(); // refresco con datos de la nube
      // Recordatorios con horario propio (ver recordatorios.js). Reemplaza al
      // aviso único que salía al abrir la app.
      if (window.Recordatorios) Recordatorios.arrancar();
    }).catch((e) => { console.error(e); setCloudStatus(false); });

    // Si el celular quedó abierto de un día para el otro, al volver a la app
    // se rearma el día en vez de mostrar las tareas de ayer.
    let ultimoDia = todayStr();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const h = todayStr();
      if (h === ultimoDia) return;
      ultimoDia = h;
      try { if (window.Sistema) Sistema.arrancar(); } catch (e) { console.error(e); }
      render();
    });
  }

  /* ---------- Init: primero la puerta, después la casa ---------- */
  function entrarAlCRM() {
    document.getElementById('app').hidden = false;
    arrancarApp();
  }
  if (window.Auth) {
    Auth.init().then(sesion => {
      // Con sesión abierta también se muestra la bienvenida: el CRM se arma
      // detrás y así no se ve el armado a medio hacer. Se puede saltear con
      // un toque.
      if (sesion) Auth.bienvenida(Auth.perfil, entrarAlCRM);
      else Auth.mostrarLogin(() => arrancarApp());
    }).catch(e => {
      console.error('Auth', e);
      entrarAlCRM();
    });
  } else {
    entrarAlCRM();
  }
})();
