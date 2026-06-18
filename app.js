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
  function todayStr() { return new Date().toISOString().slice(0, 10); }
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

  /* ---------- Chips ---------- */
  function estadoChip(estado) {
    const c = DB.estadoColor(estado);
    return `<span class="chip" style="background:${c}22;color:${c}"><span class="chip-dot" style="background:${c}"></span>${esc(estado)}</span>`;
  }
  function prioridadChip(p) {
    const map = { 'Baja': '#8b94a8', 'Media': '#5b8cff', 'Alta': '#f59e42', 'Urgente': '#ff5d6c' };
    const c = map[p] || '#8b94a8';
    return `<span class="chip" style="background:${c}22;color:${c}"><span class="chip-dot" style="background:${c}"></span>${esc(p)}</span>`;
  }
  function tareaChip(e) {
    const map = { 'Pendiente': '#f59e42', 'En Curso': '#5b8cff', 'Finalizada': '#3ecf8e' };
    const c = map[e] || '#8b94a8';
    return `<span class="chip" style="background:${c}22;color:${c}"><span class="chip-dot" style="background:${c}"></span>${esc(e)}</span>`;
  }

  /* ---------- Estado de la app ---------- */
  let current = 'dashboard';
  let searchTerm = '';
  const pFilters = { rubro: '', ciudad: '', estado: '', metodo: '' };

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
    ({ dashboard: renderDashboard, prospectos: renderProspectos, clientes: renderClientes, calendario: renderCalendario, tareas: renderTareas, productividad: renderProductividad, notificaciones: renderNotificaciones }[current] || renderDashboard)();
    updateNotifBadge();
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

    view.innerHTML = `
      <div class="view-head">
        <div><h1>Dashboard</h1><div class="sub">Resumen general de la operación · ${fmtDate(todayStr())}</div></div>
      </div>

      <div class="kpi-grid">
        ${kpi('Prospectos totales', ps.length, '#5b8cff', 'En base de datos')}
        ${kpi('Interesados', interesados, '#7c5cff', 'En pipeline activo')}
        ${kpi('Reuniones', reuniones, '#f472b6', 'Agendadas')}
        ${kpi('Ventas cerradas', ganados, '#3ecf8e', 'Prospectos ganados')}
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
    return list.map(t => `<div class="flex" style="justify-content:space-between;padding:7px 0">
      <span style="font-size:13px">${esc(t.titulo)}</span>${prioridadChip(t.prioridad)}</div>`).join('');
  }

  /* ============================================================
     PROSPECTOS
     ============================================================ */
  function renderProspectos() {
    const all = DB.getProspectos();
    const rubros = [...new Set(all.map(p => p.rubro).filter(Boolean))].sort();
    const ciudades = [...new Set(all.map(p => p.ciudad).filter(Boolean))].sort();

    let list = all.filter(p =>
      (!pFilters.rubro || p.rubro === pFilters.rubro) &&
      (!pFilters.ciudad || p.ciudad === pFilters.ciudad) &&
      (!pFilters.estado || p.estado === pFilters.estado) &&
      (!pFilters.metodo || p.metodoContacto === pFilters.metodo)
    );

    view.innerHTML = `
      <div class="view-head">
        <div><h1>Prospectos</h1><div class="sub">CRM de prospectos · ${all.length} en base</div></div>
        <div class="head-actions">
          <button class="btn-secondary" onclick="TNR.nuevoProspectoChat()">${icon('sparkles')} Chat inteligente</button>
          <button class="btn-primary" onclick="TNR.nuevoProspecto()">${icon('plus')}Nuevo prospecto</button>
        </div>
      </div>

      <div class="filters">
        ${selectFilter('rubro', 'Rubro', rubros, pFilters.rubro)}
        ${selectFilter('ciudad', 'Ciudad', ciudades, pFilters.ciudad)}
        ${selectFilter('estado', 'Estado', DB.ESTADOS_LEAD.map(e => e.id), pFilters.estado)}
        ${selectFilter('metodo', 'Método', DB.METODOS_CONTACTO, pFilters.metodo)}
        ${(pFilters.rubro || pFilters.ciudad || pFilters.estado || pFilters.metodo) ? `<button class="filter-clear" onclick="TNR.clearFiltros()">Limpiar filtros</button>` : ''}
        <span class="result-count">${list.length} resultado${list.length !== 1 ? 's' : ''}</span>
      </div>

      ${list.length ? tablaProspectos(list) : emptyState('target', 'Sin prospectos', 'Cargá tu primer prospecto con el formulario o con el chat inteligente.', 'TNR.nuevoProspecto()')}
    `;

    $$('#view .filters select').forEach(s => s.onchange = () => { pFilters[s.dataset.f] = s.value; renderProspectos(); });
  }

  function selectFilter(key, label, opts, val) {
    return `<select data-f="${key}"><option value="">${label}: todos</option>${opts.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }

  function tablaProspectos(list) {
    return `<div class="table-wrap"><table>
      <thead><tr><th>Empresa / Contacto</th><th>Rubro</th><th>Ciudad</th><th>Estado</th><th>Método</th><th>Seguimiento</th><th></th></tr></thead>
      <tbody>${list.map(p => {
        const d = daysUntil(p.fechaSeguimiento);
        const segTag = p.fechaSeguimiento ? (d < 0 ? `<span class="tag" style="color:#ff5d6c">${fmtDate(p.fechaSeguimiento)}</span>` : d === 0 ? `<span class="tag" style="color:#f5c451">hoy</span>` : fmtDate(p.fechaSeguimiento)) : '<span class="cell-dim">—</span>';
        return `<tr onclick="TNR.abrirProspecto('${p.id}')">
          <td data-label="Empresa"><div class="cell-strong">${esc(p.empresa || p.nombre || 'Sin nombre')}</div>${p.empresa && p.nombre ? `<div class="cell-dim">${esc(p.nombre)}</div>` : ''}</td>
          <td data-label="Rubro">${p.rubro ? `<span class="tag">${esc(p.rubro)}</span>` : '<span class="cell-dim">—</span>'}</td>
          <td data-label="Ciudad" class="cell-dim">${esc(p.ciudad) || '—'}</td>
          <td data-label="Estado">${estadoChip(p.estado)}</td>
          <td data-label="Método" class="cell-dim">${esc(p.metodoContacto) || '—'}</td>
          <td data-label="Seguimiento">${segTag}</td>
          <td data-label=""><div class="row-actions" onclick="event.stopPropagation()">
            ${p.whatsapp ? `<a class="icon-btn" title="WhatsApp" target="_blank" href="https://wa.me/${waNum(p.whatsapp)}">${icon('whatsapp')}</a>` : ''}
            <button class="icon-btn" title="Editar" onclick="TNR.editarProspecto('${p.id}')">${icon('edit')}</button>
            <button class="icon-btn danger" title="Eliminar" onclick="TNR.borrarProspecto('${p.id}')">${icon('trash')}</button>
          </div></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }
  function waNum(s) { return String(s).replace(/\D/g, '').replace(/^0/, '').replace(/^15/, '11'); }

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
        ${f('ciudad', 'Ciudad')}
        ${f('telefono', 'Teléfono', 'tel')}
        ${f('whatsapp', 'WhatsApp', 'tel')}
        ${f('instagram', 'Instagram')}
        ${f('sitioWeb', 'Sitio Web')}
        ${f('responsable', 'Responsable')}
        ${sel('metodoContacto', 'Método de contacto', ['', ...DB.METODOS_CONTACTO])}
        ${sel('estado', 'Estado', DB.ESTADOS_LEAD.map(e => e.id))}
        ${f('proximaAccion', 'Próxima acción', 'text', true)}
        <div class="field"><label>Fecha de seguimiento</label><input type="date" name="fechaSeguimiento" value="${esc(p.fechaSeguimiento || '')}" /></div>
        <div class="field full"><label>Observaciones</label><textarea name="observaciones">${esc(p.observaciones || '')}</textarea></div>
      </div>
      <div class="form-foot">
        <button type="button" class="btn-secondary" onclick="TNR.cerrar()">Cancelar</button>
        <button type="submit" class="btn-primary">${p.id ? 'Guardar cambios' : 'Crear prospecto'}</button>
      </div>
    </form>`;
  }

  function readForm(formId) {
    const data = {};
    new FormData($('#' + formId)).forEach((v, k) => data[k] = (v || '').toString().trim());
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
    if (!confirm(`¿Eliminar el prospecto "${p.empresa || p.nombre}"? Esta acción no se puede deshacer.`)) return;
    DB.eliminarProspecto(id); toast('Prospecto eliminado'); render();
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
          ${p.whatsapp ? `<a class="btn-secondary" target="_blank" href="https://wa.me/${waNum(p.whatsapp)}" style="padding:6px 12px">${icon('whatsapp')} WhatsApp</a>` : ''}
          <button class="btn-secondary" style="padding:6px 12px" onclick="TNR.editarProspecto('${p.id}')">${icon('edit')} Editar</button>
        </div>
      </div>
      <div class="form-grid">
        ${fila('Contacto', esc(p.nombre) || '—')}
        ${fila('Empresa', esc(p.empresa) || '—')}
        ${fila('Ciudad', [p.ciudad, p.provincia].filter(Boolean).map(esc).join(', ') || '—')}
        ${fila('Método de contacto', esc(p.metodoContacto) || '—')}
        ${fila('Teléfono', esc(p.telefono) || '—')}
        ${fila('WhatsApp', esc(p.whatsapp) || '—')}
        ${fila('Email', p.email ? link(p.email, 'mailto:' + p.email) : '—')}
        ${fila('Instagram', p.instagram ? link(p.instagram, 'https://instagram.com/' + p.instagram.replace('@', '')) : '—')}
        ${fila('Sitio web', p.sitioWeb ? link(p.sitioWeb, (p.sitioWeb.startsWith('http') ? '' : 'https://') + p.sitioWeb) : '—')}
        ${fila('Responsable', esc(p.responsable) || '—')}
        ${fila('Próxima acción', esc(p.proximaAccion) || '—')}
        ${fila('Fecha de seguimiento', p.fechaSeguimiento ? fmtDate(p.fechaSeguimiento) : '—')}
      </div>
      ${p.observaciones ? `<div class="field full mt-12"><label>Observaciones</label><div style="font-size:13px">${esc(p.observaciones)}</div></div>` : ''}
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
  }

  function convertirCliente(id) {
    if (!confirm('¿Convertir este prospecto en cliente? Se creará una ficha de cliente y el prospecto pasará a "Ganado".')) return;
    const c = DB.convertirEnCliente(id);
    closeModal(); toast('Cliente creado', 'ok');
    setView('clientes'); setTimeout(() => abrirCliente(c.id), 100);
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
    if (!confirm(`¿Eliminar al cliente "${c.empresa || c.nombre}"?`)) return;
    DB.eliminarCliente(id); toast('Cliente eliminado'); render();
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
     TAREAS
     ============================================================ */
  let tareaFiltro = 'todas';
  function renderTareas() {
    let list = DB.getTareas();
    if (tareaFiltro !== 'todas') list = list.filter(t => t.estado === tareaFiltro);
    view.innerHTML = `
      <div class="view-head">
        <div><h1>Tareas</h1><div class="sub">${DB.getTareas().filter(t => t.estado !== 'Finalizada').length} pendientes</div></div>
        <div class="head-actions"><button class="btn-primary" onclick="TNR.nuevaTarea()">${icon('plus')}Nueva tarea</button></div>
      </div>
      <div class="filters">
        ${['todas', ...DB.ESTADOS_TAREA].map(f => `<button class="btn-ghost" style="flex:none;${tareaFiltro === f ? 'background:var(--panel-2);color:var(--text);border-color:var(--border-2)' : ''}" onclick="TNR.filtrarTareas('${f}')">${f === 'todas' ? 'Todas' : f}</button>`).join('')}
      </div>
      ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Tarea</th><th>Responsable</th><th>Vence</th><th>Prioridad</th><th>Estado</th><th></th></tr></thead>
        <tbody>${list.map(t => {
          const d = daysUntil(t.fecha);
          const venc = t.fecha ? (d < 0 && t.estado !== 'Finalizada' ? `<span class="tag" style="color:#ff5d6c">${fmtDate(t.fecha)}</span>` : fmtDate(t.fecha)) : '<span class="cell-dim">—</span>';
          return `<tr onclick="TNR.editarTarea('${t.id}')">
            <td data-label="Tarea"><div class="cell-strong">${esc(t.titulo)}</div>${t.observaciones ? `<div class="cell-dim">${esc(t.observaciones)}</div>` : ''}</td>
            <td data-label="Responsable" class="cell-dim">${esc(t.responsable) || '—'}</td><td data-label="Vence">${venc}</td>
            <td data-label="Prioridad">${prioridadChip(t.prioridad)}</td><td data-label="Estado">${tareaChip(t.estado)}</td>
            <td data-label=""><div class="row-actions" onclick="event.stopPropagation()">
              ${t.estado !== 'Finalizada' ? `<button class="icon-btn" title="Finalizar" onclick="TNR.finalizarTarea('${t.id}')">${icon('check')}</button>` : ''}
              <button class="icon-btn danger" onclick="TNR.borrarTarea('${t.id}')">${icon('trash')}</button></div></td>
          </tr>`;
        }).join('')}</tbody></table></div>`
        : emptyState('check-square', 'Sin tareas', 'Creá tareas para organizar seguimientos, entregas y cobros.', 'TNR.nuevaTarea()')}
    `;
  }
  function formTarea(t) {
    t = t || {};
    return `<form id="formTarea"><div class="form-grid">
      <div class="field full"><label>Título</label><input name="titulo" value="${esc(t.titulo || '')}" /></div>
      <div class="field"><label>Responsable</label><input name="responsable" value="${esc(t.responsable || 'Mateo')}" /></div>
      <div class="field"><label>Fecha</label><input type="date" name="fecha" value="${esc(t.fecha || '')}" /></div>
      <div class="field"><label>Prioridad</label><select name="prioridad">${DB.PRIORIDADES.map(p => `<option ${t.prioridad === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      <div class="field"><label>Estado</label><select name="estado">${DB.ESTADOS_TAREA.map(e => `<option ${t.estado === e ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
      <div class="field full"><label>Observaciones</label><textarea name="observaciones">${esc(t.observaciones || '')}</textarea></div>
    </div><div class="form-foot"><button type="button" class="btn-secondary" onclick="TNR.cerrar()">Cancelar</button><button type="submit" class="btn-primary">${t.id ? 'Guardar' : 'Crear tarea'}</button></div></form>`;
  }
  function nuevaTarea() {
    openModal('Nueva tarea', formTarea({ prioridad: 'Media', estado: 'Pendiente' }));
    $('#formTarea').onsubmit = e => { e.preventDefault(); const d = readForm('formTarea'); if (!d.titulo) { toast('Poné un título', 'err'); return; } DB.crearTarea(d); closeModal(); toast('Tarea creada', 'ok'); render(); };
  }
  function editarTarea(id) {
    const t = DB.getTareas().find(x => x.id === id);
    openModal('Editar tarea', formTarea(t));
    $('#formTarea').onsubmit = e => { e.preventDefault(); DB.actualizarTarea(id, readForm('formTarea')); closeModal(); toast('Tarea actualizada', 'ok'); render(); };
  }
  function finalizarTarea(id) { DB.actualizarTarea(id, { estado: 'Finalizada' }); toast('Tarea finalizada', 'ok'); render(); }
  function borrarTarea(id) { if (!confirm('¿Eliminar tarea?')) return; DB.eliminarTarea(id); render(); }

  /* ============================================================
     NOTIFICACIONES
     ============================================================ */
  function buildNotifs() {
    const out = [];
    DB.getProspectos().forEach(p => {
      if (p.fechaSeguimiento && !['Ganado', 'Perdido'].includes(p.estado)) {
        const d = daysUntil(p.fechaSeguimiento);
        if (d <= 3) out.push({ tipo: 'Seguimiento', ic: 'bell', color: '#1C9FE2', titulo: `Seguir a ${p.empresa || p.nombre}`, meta: p.proximaAccion || p.estado, fecha: p.fechaSeguimiento, d, action: `TNR.abrirProspecto('${p.id}')` });
      }
    });
    DB.getTareas().forEach(t => {
      if (t.estado !== 'Finalizada' && t.fecha) {
        const d = daysUntil(t.fecha);
        if (d <= 3) out.push({ tipo: 'Tarea', ic: 'check-square', color: '#f59e42', titulo: t.titulo, meta: t.responsable, fecha: t.fecha, d, action: `TNR.editarTarea('${t.id}')` });
      }
    });
    DB.getClientes().forEach(c => {
      if (c.estado !== 'Activo') return; // no cobranzas de clientes inactivos
      const fin = DB.finanzasCliente(c);
      if (fin.saldo > 0) {
        const venc = fin.estado === 'Vencido';
        out.push({ tipo: 'Cobro', ic: 'wallet', color: venc ? '#ff5d6c' : '#f59e42', titulo: `Cobrar a ${c.empresa || c.nombre}`, meta: `${fin.estado} · adeuda ${fmtMoney(fin.saldo)}`, fecha: '', d: venc ? -1 : 0, action: `TNR.abrirCliente('${c.id}','facturacion')` });
      }
    });
    return out.sort((a, b) => (a.d == null ? 99 : a.d) - (b.d == null ? 99 : b.d));
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
      </div>`;
    }).join('');

    view.innerHTML = `
      <div class="view-head">
        <div><h1>Notificaciones</h1><div class="sub">Alertas de inactividad y recordatorios</div></div>
        <div class="head-actions"><button class="btn-secondary" onclick="TNR.activarNotif()">${icon('bell')}<span class="btn-label"> Activar en este dispositivo</span></button></div>
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
    if (current === 'productividad') renderProductividad();
  }
  function timerPause() { if (!timer.running) return; timer.acc = timerElapsed(); timer.running = false; if (current === 'productividad') renderProductividad(); }
  function timerStop() {
    const total = timerElapsed();
    if (total >= 1) { DB.registrarTiempo({ categoria: timer.cat, segundos: Math.round(total) }); toast('Sesión guardada: ' + fmtDur(total), 'ok'); }
    timer.acc = 0; timer.running = false;
    if (current === 'productividad') renderProductividad();
  }
  function timerReset() { timer.acc = 0; timer.running = false; if (current === 'productividad') renderProductividad(); }

  function renderProductividad() {
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
        <div><h1>Productividad</h1><div class="sub">Metas y tiempo · ${mesLabel(id)}</div></div>
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
    clearFiltros: () => { pFilters.rubro = pFilters.ciudad = pFilters.estado = pFilters.metodo = ''; renderProspectos(); },
    nuevoCliente, editarCliente, borrarCliente, abrirCliente,
    quitarSrv: (cid, sid) => { DB.quitarServicioCliente(cid, sid); abrirCliente(cid, 'servicios'); },
    setContEstado: (cid, ctid, v) => { DB.actualizarContenido(cid, ctid, { estado: v }); },
    volverCliente: (cid, tab) => abrirCliente(cid, tab),
    editarFactura: (cid, fid) => formFactura(cid, fid),
    duplicarFactura: (cid, fid) => { DB.duplicarFactura(cid, fid); toast('Concepto duplicado', 'ok'); abrirCliente(cid, 'facturacion'); },
    borrarFactura: (cid, fid) => { if (!confirm('¿Seguro que deseas eliminar esta facturación?')) return; DB.eliminarFactura(cid, fid); toast('Facturación eliminada'); abrirCliente(cid, 'facturacion'); },
    editarPago: (cid, pid) => formPago(cid, pid),
    borrarPago: (cid, pid) => { if (!confirm('¿Seguro que deseas eliminar este pago?')) return; DB.eliminarPago(cid, pid); toast('Pago eliminado'); abrirCliente(cid, 'facturacion'); },
    nuevaTarea, editarTarea, finalizarTarea, borrarTarea,
    filtrarTareas: (f) => { tareaFiltro = f; renderTareas(); },
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
    borrarEvento: (id) => { if (!confirm('¿Eliminar este evento?')) return; DB.eliminarEvento(id); closeModal(); toast('Evento eliminado'); if (current === 'calendario') render(); },
    // Productividad
    guardarMetas: () => {
      const id = mesId(); const vals = {};
      DB.METRICAS_META.forEach(mt => { const el = $('#meta_' + mt.id); if (el) vals[mt.id] = +el.value || 0; });
      DB.guardarMeta(id, vals); toast('Metas guardadas', 'ok'); renderProductividad();
    },
    timer: (action) => { ({ start: timerStart, pause: timerPause, stop: timerStop, reset: timerReset }[action] || function () {})(); },
    setTimerCat: (c) => { timer.cat = c; },
    irA: (v) => setView(v),
    activarNotif: () => activarNotificaciones(),
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

  /* ---------- Init ---------- */
  if (window.Icons) Icons.paintStatic(); // iconos estáticos del sidebar/topbar/modal
  initPWA();
  DB.onRemoteChange = () => { searchTerm ? renderSearch() : render(); };
  setView('dashboard'); // render inmediato con datos locales/cacheados
  DB.init().then((online) => {
    setCloudStatus(online);
    searchTerm ? renderSearch() : render(); // refresco con datos de la nube
    notificarResumen(false); // recordatorio al abrir (si ya dio permiso)
  }).catch((e) => { console.error(e); setCloudStatus(false); });
})();
