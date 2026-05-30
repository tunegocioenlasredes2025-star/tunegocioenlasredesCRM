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
    ({ dashboard: renderDashboard, prospectos: renderProspectos, clientes: renderClientes, tareas: renderTareas, notificaciones: renderNotificaciones }[current] || renderDashboard)();
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
    const inactivos = cs.filter(c => c.estado !== 'Activo').length;

    // Facturación
    let facMensual = 0, facAnual = 0;
    cs.forEach(c => c.servicios.forEach(s => { if (s.recurrente) facMensual += s.precio; }));
    cs.forEach(c => c.facturacion.forEach(f => { facAnual += f.monto; }));

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
          <div class="panel-title">Clientes & Facturación</div>
          <div class="kpi-grid" style="margin:0;grid-template-columns:1fr 1fr">
            ${kpi('Clientes activos', activos, '#3ecf8e', '')}
            ${kpi('Inactivos', inactivos, '#8b94a8', '')}
            ${kpi('Fact. mensual', fmtMoney(facMensual), '#f5c451', 'Servicios recurrentes')}
            ${kpi('Fact. total', fmtMoney(facAnual), '#38bdf8', 'Histórica')}
          </div>
        </div>
      </div>

      <div class="grid-3">
        ${kpiPanel('Producción de contenido', [
          ['Pendientes', pend, '#f59e42'], ['En proceso', proc, '#5b8cff'], ['Publicados', pub, '#3ecf8e'],
        ])}
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
          <button class="btn-secondary" onclick="TNR.nuevoProspectoChat()">💬 Chat inteligente</button>
          <button class="btn-primary" onclick="TNR.nuevoProspecto()">＋ Nuevo prospecto</button>
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

      ${list.length ? tablaProspectos(list) : emptyState('◎', 'Sin prospectos', 'Cargá tu primer prospecto con el formulario o con el chat inteligente.', 'TNR.nuevoProspecto()')}
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
          <td><div class="cell-strong">${esc(p.empresa || p.nombre || 'Sin nombre')}</div>${p.empresa && p.nombre ? `<div class="cell-dim">${esc(p.nombre)}</div>` : ''}</td>
          <td>${p.rubro ? `<span class="tag">${esc(p.rubro)}</span>` : '<span class="cell-dim">—</span>'}</td>
          <td class="cell-dim">${esc(p.ciudad) || '—'}</td>
          <td>${estadoChip(p.estado)}</td>
          <td class="cell-dim">${esc(p.metodoContacto) || '—'}</td>
          <td>${segTag}</td>
          <td><div class="row-actions" onclick="event.stopPropagation()">
            ${p.whatsapp ? `<a class="icon-btn" title="WhatsApp" target="_blank" href="https://wa.me/${waNum(p.whatsapp)}">✆</a>` : ''}
            <button class="icon-btn" title="Editar" onclick="TNR.editarProspecto('${p.id}')">✎</button>
            <button class="icon-btn danger" title="Eliminar" onclick="TNR.borrarProspecto('${p.id}')">🗑</button>
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
        ${f('provincia', 'Provincia')}
        ${f('pais', 'País')}
        ${f('telefono', 'Teléfono', 'tel')}
        ${f('whatsapp', 'WhatsApp', 'tel')}
        ${f('email', 'Email', 'email')}
        ${f('instagram', 'Instagram')}
        ${f('facebook', 'Facebook')}
        ${f('linkedin', 'LinkedIn')}
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
          <button class="btn-primary" id="btnParse">Interpretar →</button>
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
        <button class="btn-primary" id="btnConfirmParse">✓ Crear prospecto</button>
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
          ${p.whatsapp ? `<a class="btn-secondary" target="_blank" href="https://wa.me/${waNum(p.whatsapp)}" style="padding:6px 12px">✆ WhatsApp</a>` : ''}
          <button class="btn-secondary" style="padding:6px 12px" onclick="TNR.editarProspecto('${p.id}')">✎ Editar</button>
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
        <button class="btn-secondary" style="padding:5px 10px;font-size:12px" onclick="TNR.convertirCliente('${p.id}')">★ Convertir en cliente</button>
      </div>
      <div class="add-note">
        <select id="noteTipo"><option>Nota</option><option>Llamada</option><option>Mensaje</option><option>Reunión</option><option>Seguimiento</option></select>
        <input id="noteText" placeholder="Agregar al historial…" />
        <button class="btn-secondary" id="btnNote" style="padding:8px 14px">＋</button>
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
        <div class="head-actions"><button class="btn-primary" onclick="TNR.nuevoCliente()">＋ Nuevo cliente</button></div>
      </div>
      ${list.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Cliente</th><th>Rubro</th><th>Ciudad</th><th>Servicios</th><th>Fact. mensual</th><th>Producción</th><th>Estado</th><th></th></tr></thead>
        <tbody>${list.map(c => {
          const mensual = c.servicios.filter(s => s.recurrente).reduce((a, s) => a + s.precio, 0);
          const tot = c.contenidos.length, pub = c.contenidos.filter(x => x.estado === 'Publicado').length;
          const pct = tot ? Math.round(pub / tot * 100) : 0;
          const ec = c.estado === 'Activo' ? '#3ecf8e' : '#8b94a8';
          return `<tr onclick="TNR.abrirCliente('${c.id}')">
            <td><div class="cell-strong">${esc(c.empresa || c.nombre)}</div>${c.empresa && c.nombre ? `<div class="cell-dim">${esc(c.nombre)}</div>` : ''}</td>
            <td>${c.rubro ? `<span class="tag">${esc(c.rubro)}</span>` : '—'}</td>
            <td class="cell-dim">${esc(c.ciudad) || '—'}</td>
            <td class="cell-dim">${c.servicios.length || '—'}</td>
            <td class="cell-strong">${mensual ? fmtMoney(mensual) : '—'}</td>
            <td>${tot ? `<div class="flex"><span class="cell-dim">${pub}/${tot}</span><div class="progress-bar" style="width:60px"><div class="progress-fill" style="width:${pct}%"></div></div></div>` : '—'}</td>
            <td><span class="chip" style="background:${ec}22;color:${ec}"><span class="chip-dot" style="background:${ec}"></span>${esc(c.estado)}</span></td>
            <td><div class="row-actions" onclick="event.stopPropagation()"><button class="icon-btn danger" onclick="TNR.borrarCliente('${c.id}')">🗑</button></div></td>
          </tr>`;
        }).join('')}</tbody></table></div>`
        : emptyState('★', 'Sin clientes', 'Cargá tu primer cliente o convertí un prospecto ganado.', 'TNR.nuevoCliente()')}
    `;
  }

  function formCliente(c) {
    c = c || {};
    const f = (k, lbl, type = 'text', full = false) => `<div class="field ${full ? 'full' : ''}"><label>${lbl}</label><input type="${type}" name="${k}" value="${esc(c[k] || '')}" /></div>`;
    return `<form id="formCliente"><div class="form-grid">
      ${f('nombre', 'Nombre del contacto')}${f('empresa', 'Empresa')}${f('rubro', 'Rubro')}${f('ciudad', 'Ciudad')}
      ${f('provincia', 'Provincia')}${f('pais', 'País')}${f('telefono', 'Teléfono', 'tel')}${f('whatsapp', 'WhatsApp', 'tel')}
      ${f('email', 'Email', 'email')}${f('instagram', 'Instagram')}${f('sitioWeb', 'Sitio web')}${f('responsable', 'Responsable')}
      <div class="field"><label>Estado</label><select name="estado"><option ${c.estado === 'Activo' ? 'selected' : ''}>Activo</option><option ${c.estado === 'Inactivo' ? 'selected' : ''}>Inactivo</option></select></div>
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
          ${c.whatsapp ? `<a class="btn-secondary" target="_blank" href="https://wa.me/${waNum(c.whatsapp)}" style="padding:6px 12px">✆ WhatsApp</a>` : ''}
          <button class="btn-secondary" style="padding:6px 12px" onclick="TNR.editarCliente('${c.id}')">✎ Editar</button>
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
        <div class="flex" style="justify-content:space-between;margin-bottom:14px">
          <strong style="font-size:13px">Servicios contratados</strong>
          <div class="flex">
            <select id="srvPick" style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:8px;font-size:12px">
              ${DB.SERVICIOS.map(s => `<option value="${s.id}">${s.nombre} — ${fmtMoney(s.precio)}${s.recurrente ? '/mes' : ''}</option>`).join('')}
            </select>
            <button class="btn-secondary" style="padding:7px 12px" id="btnAddSrv">＋ Agregar</button>
          </div>
        </div>
        ${c.servicios.length ? c.servicios.map(s => `
          <div class="content-card" style="margin-bottom:10px">
            <div class="flex" style="justify-content:space-between">
              <div><div class="cell-strong">${esc(s.nombre)}</div><div class="cell-dim" style="font-size:12px">${esc(s.cat)} · desde ${fmtDate(s.desde)}</div></div>
              <div class="flex"><span class="cell-strong">${fmtMoney(s.precio)}${s.recurrente ? '<span class="muted" style="font-weight:400">/mes</span>' : ''}</span>
              <button class="icon-btn danger" onclick="TNR.quitarSrv('${c.id}','${s.id}')">🗑</button></div>
            </div></div>`).join('')
        : '<div class="muted" style="font-size:13px">Sin servicios. Agregá un plan desde el selector.</div>'}`;
      $('#btnAddSrv').onclick = () => { DB.agregarServicioCliente(c.id, $('#srvPick').value); toast('Servicio agregado', 'ok'); abrirCliente(c.id, 'servicios'); };
    }
    else if (clienteTab === 'produccion') {
      const tot = c.contenidos.length, pub = c.contenidos.filter(x => x.estado === 'Publicado').length, pend = tot - pub;
      const pct = tot ? Math.round(pub / tot * 100) : 0;
      body.innerHTML = `
        <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
          ${kpi('Contratados', tot, '#5b8cff', '')}${kpi('Publicados', pub, '#3ecf8e', '')}
          ${kpi('Pendientes', pend, '#f59e42', '')}${kpi('Avance', pct + '%', '#38bdf8', '')}
        </div>
        <div class="progress-bar" style="height:10px;margin-bottom:16px"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="flex" style="justify-content:space-between;margin-bottom:12px"><strong style="font-size:13px">Calendario de contenido</strong>
          <button class="btn-secondary" style="padding:6px 12px" id="btnAddCont">＋ Contenido</button></div>
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
      const total = c.facturacion.reduce((a, f) => a + f.monto, 0);
      const cobrado = c.facturacion.filter(f => f.pagado).reduce((a, f) => a + f.monto, 0);
      body.innerHTML = `
        <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
          ${kpi('Facturado', fmtMoney(total), '#5b8cff', '')}${kpi('Cobrado', fmtMoney(cobrado), '#3ecf8e', '')}${kpi('Pendiente', fmtMoney(total - cobrado), '#f59e42', '')}
        </div>
        <div class="flex" style="justify-content:flex-end;margin-bottom:12px"><button class="btn-secondary" style="padding:6px 12px" id="btnAddFc">＋ Concepto</button></div>
        ${c.facturacion.length ? `<div class="table-wrap"><table><thead><tr><th>Concepto</th><th>Fecha</th><th>Monto</th><th>Estado</th></tr></thead>
          <tbody>${c.facturacion.map(f => `<tr onclick="TNR.toggleFc('${c.id}','${f.id}')">
            <td>${esc(f.concepto)}</td><td class="cell-dim">${fmtDate(f.fecha)}</td><td class="cell-strong">${fmtMoney(f.monto)}</td>
            <td>${f.pagado ? '<span class="chip" style="background:#3ecf8e22;color:#3ecf8e"><span class="chip-dot" style="background:#3ecf8e"></span>Pagado</span>' : '<span class="chip" style="background:#f59e4222;color:#f59e42"><span class="chip-dot" style="background:#f59e42"></span>Pendiente</span>'}</td>
          </tr>`).join('')}</tbody></table></div><div class="muted mt-12" style="font-size:12px">Click en una fila para marcar como pagado/pendiente.</div>`
        : '<div class="muted" style="font-size:13px">Sin facturación registrada.</div>'}`;
      $('#btnAddFc').onclick = () => {
        const concepto = prompt('Concepto:'); if (!concepto) return;
        const monto = parseFloat(prompt('Monto:') || '0') || 0;
        DB.agregarFactura(c.id, { concepto, monto }); abrirCliente(c.id, 'facturacion');
      };
    }
    else if (clienteTab === 'historial') {
      body.innerHTML = `
        <div class="add-note"><select id="cNoteTipo"><option>Nota</option><option>Llamada</option><option>Mensaje</option><option>Reunión</option><option>Entrega</option></select>
        <input id="cNoteText" placeholder="Agregar al historial…" /><button class="btn-secondary" id="cBtnNote" style="padding:8px 14px">＋</button></div>
        <div class="timeline mt-20">${(c.historial || []).map(h => `<div class="tl-item"><div class="tl-dot"></div><div class="tl-content">
          <div class="tl-type">${esc(h.tipo)}</div><div class="tl-text">${esc(h.texto)}</div><div class="tl-date">${fmtDateTime(h.fecha)}</div></div></div>`).join('')}</div>`;
      const add = () => { const t = $('#cNoteText').value.trim(); if (!t) return; DB.agregarHistorialCliente(c.id, $('#cNoteTipo').value, t); abrirCliente(c.id, 'historial'); };
      $('#cBtnNote').onclick = add;
      $('#cNoteText').onkeydown = e => { if (e.key === 'Enter') add(); };
    }
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
        <div class="head-actions"><button class="btn-primary" onclick="TNR.nuevaTarea()">＋ Nueva tarea</button></div>
      </div>
      <div class="filters">
        ${['todas', ...DB.ESTADOS_TAREA].map(f => `<button class="btn-ghost" style="flex:none;${tareaFiltro === f ? 'background:var(--panel-2);color:var(--text);border-color:var(--border-2)' : ''}" onclick="TNR.filtrarTareas('${f}')">${f === 'todas' ? 'Todas' : f}</button>`).join('')}
      </div>
      ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Tarea</th><th>Responsable</th><th>Vence</th><th>Prioridad</th><th>Estado</th><th></th></tr></thead>
        <tbody>${list.map(t => {
          const d = daysUntil(t.fecha);
          const venc = t.fecha ? (d < 0 && t.estado !== 'Finalizada' ? `<span class="tag" style="color:#ff5d6c">${fmtDate(t.fecha)}</span>` : fmtDate(t.fecha)) : '<span class="cell-dim">—</span>';
          return `<tr onclick="TNR.editarTarea('${t.id}')">
            <td><div class="cell-strong">${esc(t.titulo)}</div>${t.observaciones ? `<div class="cell-dim">${esc(t.observaciones)}</div>` : ''}</td>
            <td class="cell-dim">${esc(t.responsable) || '—'}</td><td>${venc}</td>
            <td>${prioridadChip(t.prioridad)}</td><td>${tareaChip(t.estado)}</td>
            <td><div class="row-actions" onclick="event.stopPropagation()">
              ${t.estado !== 'Finalizada' ? `<button class="icon-btn" title="Finalizar" onclick="TNR.finalizarTarea('${t.id}')">✓</button>` : ''}
              <button class="icon-btn danger" onclick="TNR.borrarTarea('${t.id}')">🗑</button></div></td>
          </tr>`;
        }).join('')}</tbody></table></div>`
        : emptyState('✓', 'Sin tareas', 'Creá tareas para organizar seguimientos, entregas y cobros.', 'TNR.nuevaTarea()')}
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
        if (d <= 3) out.push({ tipo: 'Seguimiento', ic: '◔', color: '#5b8cff', titulo: `Seguir a ${p.empresa || p.nombre}`, meta: p.proximaAccion || p.estado, fecha: p.fechaSeguimiento, d, action: `TNR.abrirProspecto('${p.id}')` });
      }
    });
    DB.getTareas().forEach(t => {
      if (t.estado !== 'Finalizada' && t.fecha) {
        const d = daysUntil(t.fecha);
        if (d <= 3) out.push({ tipo: 'Tarea', ic: '✓', color: '#f59e42', titulo: t.titulo, meta: t.responsable, fecha: t.fecha, d, action: `TNR.editarTarea('${t.id}')` });
      }
    });
    DB.getClientes().forEach(c => {
      c.facturacion.filter(f => !f.pagado).forEach(f => {
        out.push({ tipo: 'Cobro', ic: '$', color: '#3ecf8e', titulo: `Cobrar: ${f.concepto}`, meta: `${c.empresa || c.nombre} · ${fmtMoney(f.monto)}`, fecha: f.fecha, d: daysUntil(f.fecha), action: `TNR.abrirCliente('${c.id}','facturacion')` });
      });
    });
    return out.sort((a, b) => (a.d ?? 99) - (b.d ?? 99));
  }
  function renderNotificaciones() {
    const list = buildNotifs();
    view.innerHTML = `
      <div class="view-head"><div><h1>Notificaciones</h1><div class="sub">Recordatorios de seguimientos, tareas y cobros</div></div></div>
      ${list.length ? list.map(n => {
        const cls = n.d < 0 ? 'overdue' : n.d === 0 ? 'today' : '';
        const dtxt = n.d == null ? '' : n.d < 0 ? `Vencido hace ${Math.abs(n.d)}d` : n.d === 0 ? 'Hoy' : `En ${n.d} día${n.d > 1 ? 's' : ''}`;
        return `<div class="notif-item ${cls}" style="cursor:pointer" onclick="${n.action}">
          <div class="n-ic" style="background:${n.color}22;color:${n.color}">${n.ic}</div>
          <div class="n-body"><div class="n-title">${esc(n.titulo)}</div><div class="n-meta">${esc(n.tipo)} · ${esc(n.meta || '')} · ${fmtDate(n.fecha)}</div></div>
          <span class="tag" style="${n.d < 0 ? 'color:#ff5d6c' : n.d === 0 ? 'color:#f5c451' : ''}">${dtxt}</span>
        </div>`;
      }).join('') : emptyState('◔', 'Todo al día', 'No hay seguimientos, tareas ni cobros próximos a vencer.')}
    `;
  }
  function updateNotifBadge() {
    const n = buildNotifs().filter(x => x.d != null && x.d <= 0).length;
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
      ${cs.length ? `<div class="panel-title" style="margin:20px 0 8px">Clientes</div><div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Rubro</th><th>Ciudad</th><th>Estado</th></tr></thead><tbody>${cs.map(c => `<tr onclick="TNR.abrirCliente('${c.id}')"><td class="cell-strong">${esc(c.empresa || c.nombre)}</td><td>${c.rubro ? `<span class="tag">${esc(c.rubro)}</span>` : '—'}</td><td class="cell-dim">${esc(c.ciudad) || '—'}</td><td>${esc(c.estado)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${!ps.length && !cs.length ? emptyState('⌕', 'Sin resultados', `No se encontró nada para "${esc(searchTerm)}". Probá con un rubro, ciudad, estado o servicio.`) : ''}
    `;
  }
  $('#globalSearch').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    if (searchTerm) renderSearch(); else render();
  });

  /* ============================================================
     EMPTY STATE
     ============================================================ */
  function emptyState(ic, title, text, action) {
    return `<div class="empty"><div class="e-ic">${ic}</div><h3>${title}</h3><p>${text}</p>${action ? `<button class="btn-primary" onclick="${action}">＋ Crear</button>` : ''}</div>`;
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
    toggleFc: (cid, fid) => { DB.toggleFacturaPagada(cid, fid); abrirCliente(cid, 'facturacion'); },
    nuevaTarea, editarTarea, finalizarTarea, borrarTarea,
    filtrarTareas: (f) => { tareaFiltro = f; renderTareas(); },
    cerrar: closeModal,
  };

  /* ---------- Estado de conexión ---------- */
  function setCloudStatus(online) {
    const el = $('#cloudStatus'), txt = $('#cloudStatusText');
    if (!el) return;
    if (online) { el.className = 'cloud-status online'; txt.textContent = 'Nube conectada · datos compartidos'; el.title = 'Vos y tu equipo ven los mismos datos en tiempo real.'; }
    else { el.className = 'cloud-status local'; txt.textContent = 'Modo local (este dispositivo)'; el.title = 'Sin conexión a la nube. Los datos se guardan solo en este navegador.'; }
  }

  /* ---------- Init ---------- */
  DB.onRemoteChange = () => { searchTerm ? renderSearch() : render(); };
  setView('dashboard'); // render inmediato con datos locales/cacheados
  DB.init().then((online) => {
    setCloudStatus(online);
    searchTerm ? renderSearch() : render(); // refresco con datos de la nube
  }).catch((e) => { console.error(e); setCloudStatus(false); });
})();
