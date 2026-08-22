/* ============================================================
   TNR · Campañas de WhatsApp — pantallas
   ------------------------------------------------------------
   Tres pantallas dentro de la misma vista:
     lista    · todas las campañas y cómo vienen
     editor   · armar una campaña (config a la izquierda, cómo queda a la derecha)
     detalle  · una campaña por dentro

   Reutiliza los helpers del CRM (window.TNRUI) para que el toast, el modal
   y la confirmación sean exactamente los mismos que en el resto del sistema.
   ============================================================ */
(function () {
  'use strict';

  const U = () => window.TNRUI || {};
  const esc = s => (U().esc ? U().esc(s) : String(s == null ? '' : s));
  const toast = (m, k) => U().toast && U().toast(m, k);
  const confirmDialog = (...a) => U().confirmDialog && U().confirmDialog(...a);
  const fmtDateTime = iso => (U().fmtDateTime ? U().fmtDateTime(iso) : (iso || '—'));

  let host = null;
  let pantalla = 'lista';
  let campanaId = null;
  let tabDetalle = 'destinatarios';

  // Lo que se está armando en el editor. Vive en memoria hasta que se confirma.
  let borrador = null;
  let segmento = null;
  let previewIdx = 0;

  const ESTADO_CAMPANA = {
    borrador:   { label: 'Borrador',   color: '#8b94a8' },
    programada: { label: 'Programada', color: '#7c5cff' },
    en_curso:   { label: 'En curso',   color: '#1C9FE2' },
    pausada:    { label: 'Pausada',    color: '#f59e42' },
    completada: { label: 'Completada', color: '#3ecf8e' },
    cancelada:  { label: 'Cancelada',  color: '#ff5d6c' },
  };

  function chip(label, color) {
    return `<span class="chip" style="background:${color}22;color:${color}"><span class="chip-dot" style="background:${color}"></span>${esc(label)}</span>`;
  }
  function chipCampana(estado) {
    const e = ESTADO_CAMPANA[estado] || ESTADO_CAMPANA.borrador;
    return chip(e.label, e.color);
  }
  function num(n) { return Number(n || 0).toLocaleString('es-AR'); }

  function cargando(texto) {
    return `<div class="empty"><h3>${esc(texto || 'Cargando…')}</h3></div>`;
  }

  function errorBox(e) {
    if (e && e.message === 'FALTAN_TABLAS') {
      return `<div class="panel cmp-aviso">
        <div class="cmp-aviso-ic">${icon('alert', 20)}</div>
        <div>
          <h3>Falta preparar la base</h3>
          <p>Las tablas de campañas todavía no existen. Abrí Supabase, entrá a
          <strong>SQL Editor → New query</strong>, pegá el contenido del archivo
          <code>campanas-setup.sql</code> y dale Run. Después recargá esta página.</p>
        </div>
      </div>`;
    }
    return `<div class="panel cmp-aviso cmp-aviso-error">
      <div class="cmp-aviso-ic">${icon('alert', 20)}</div>
      <div><h3>No se pudo cargar</h3><p>${esc((e && e.message) || 'Error desconocido')}</p></div>
    </div>`;
  }

  // El motor de envío todavía no está conectado. Mejor decirlo en pantalla
  // que dejar que alguien confirme una campaña creyendo que ya sale.
  function avisoMotor() {
    return `<div class="cmp-nota">${icon('alert', 15)} El motor de envío todavía no está conectado: las campañas se arman y quedan listas, pero no se manda ningún mensaje.</div>`;
  }

  /* ============================================================
     LISTA
     ============================================================ */

  async function renderLista() {
    host.innerHTML = cargando('Cargando campañas…');
    let campanas, conteos;
    try {
      campanas = await CAMP.listar();
      conteos = await CAMP.resumenTodas();
    } catch (e) {
      host.innerHTML = cabecera() + errorBox(e);
      enlazarCabecera();
      return;
    }

    const totales = Object.values(conteos).reduce((a, r) => ({
      alcanzables: a.alcanzables + r.alcanzables,
      enviado: a.enviado + r.enviado + r.entregado + r.leido + r.respondido,
      respondido: a.respondido + r.respondido,
      fallido: a.fallido + r.fallido,
    }), { alcanzables: 0, enviado: 0, respondido: 0, fallido: 0 });

    const activas = campanas.filter(c => ['en_curso', 'programada', 'pausada'].indexOf(c.estado) >= 0).length;
    const tasa = totales.enviado ? Math.round(totales.respondido / totales.enviado * 100) : 0;

    let html = cabecera() + avisoMotor();

    if (!campanas.length) {
      html += `<div class="empty">
        <div class="e-ic">${icon('send', 42)}</div>
        <h3>Todavía no hay campañas</h3>
        <p>Una campaña le manda un mensaje de WhatsApp a un grupo de prospectos del CRM, a ritmo controlado, y te devuelve quién contestó.</p>
        <button class="btn-primary" id="cmpNueva2">${icon('plus')} Crear la primera</button>
      </div>`;
      host.innerHTML = html;
      enlazarCabecera();
      const b = document.getElementById('cmpNueva2');
      if (b) b.onclick = abrirEditor;
      return;
    }

    html += `<div class="kpi-grid">
      ${kpi('Campañas activas', activas)}
      ${kpi('Mensajes enviados', num(totales.enviado))}
      ${kpi('Respondieron', num(totales.respondido), '#3ecf8e')}
      ${kpi('Tasa de respuesta', tasa + '%', tasa >= 5 ? '#3ecf8e' : '#f5c451')}
    </div>`;

    html += `<div class="table-wrap"><table>
      <thead><tr>
        <th>Campaña</th><th>Estado</th><th>Progreso</th>
        <th>Destinatarios</th><th>Enviados</th><th>Respondieron</th><th>Fallaron</th>
        <th>Creada</th><th></th>
      </tr></thead><tbody>
      ${campanas.map(c => {
        const r = conteos[c.id] || { total: 0, alcanzables: 0, enviado: 0, entregado: 0, leido: 0, respondido: 0, fallido: 0, pendiente: 0, suprimido: 0 };
        const hechos = r.enviado + r.entregado + r.leido + r.respondido + r.fallido;
        const pct = r.alcanzables ? Math.round(hechos / r.alcanzables * 100) : 0;
        return `<tr data-id="${esc(c.id)}">
          <td class="cell-strong">${esc(c.nombre)}</td>
          <td>${chipCampana(c.estado)}</td>
          <td style="min-width:120px">
            <div class="cmp-pct">${pct}%</div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          </td>
          <td>${num(r.alcanzables)}${r.suprimido ? `<span class="cell-dim"> (+${num(r.suprimido)} excl.)</span>` : ''}</td>
          <td>${num(r.enviado + r.entregado + r.leido + r.respondido)}</td>
          <td style="color:${r.respondido ? '#3ecf8e' : 'inherit'}">${num(r.respondido)}</td>
          <td style="color:${r.fallido ? '#ff5d6c' : 'inherit'}">${num(r.fallido)}</td>
          <td class="cell-dim">${fmtDateTime(c.creada_en)}</td>
          <td class="row-actions">
            <button class="icon-btn" data-borrar="${esc(c.id)}" title="Eliminar">${icon('trash', 15)}</button>
          </td>
        </tr>`;
      }).join('')}
    </tbody></table></div>`;

    host.innerHTML = html;
    enlazarCabecera();

    host.querySelectorAll('tbody tr').forEach(tr => {
      tr.onclick = e => {
        if (e.target.closest('[data-borrar]')) return;
        campanaId = tr.dataset.id; pantalla = 'detalle'; tabDetalle = 'destinatarios'; render(host);
      };
    });
    host.querySelectorAll('[data-borrar]').forEach(b => {
      b.onclick = () => {
        const c = campanas.find(x => x.id === b.dataset.borrar);
        confirmDialog('Eliminar campaña',
          `¿Eliminar "${c.nombre}"? Se borra también la lista de destinatarios y el progreso. El historial de lo que ya se mandó queda guardado.`,
          'Eliminar',
          async () => { await CAMP.eliminar(c.id); toast('Campaña eliminada'); render(host); }, true);
      };
    });
  }

  // Mismo markup que los KPI del dashboard, para que se vean idénticos.
  function kpi(label, valor, color) {
    const c = color || '#1C9FE2';
    return `<div class="kpi">
      <div class="k-label"><span class="k-dot" style="background:${c}"></span>${esc(label)}</div>
      <div class="k-val"${color ? ` style="color:${color}"` : ''}>${esc(valor)}</div>
    </div>`;
  }

  function cabecera() {
    return `<div class="view-head">
      <h1>Campañas</h1>
      <div class="head-actions"><button class="btn-primary" id="cmpNueva">${icon('plus')} Nueva campaña</button></div>
    </div>`;
  }
  function enlazarCabecera() {
    const b = document.getElementById('cmpNueva');
    if (b) b.onclick = abrirEditor;
  }

  /* ============================================================
     EDITOR
     ============================================================ */

  function abrirEditor() {
    borrador = {
      nombre: '',
      criterio: { soloSinContactar: true, diasMinimos: 30 },
      mensaje: '',
      canal: 'prueba',
      cupo_diario: 40,
      intervalo_seg: 45,
      ventana_desde: '09:00',
      ventana_hasta: '18:00',
      programada_para: '',
    };
    segmento = null;
    previewIdx = 0;
    pantalla = 'editor';
    render(host);
  }

  function opcionesDe(campo) {
    const vals = new Set();
    (DB.getProspectos() || []).forEach(p => { const v = p[campo]; if (v) vals.add(v); });
    return Array.from(vals).sort((a, b) => String(a).localeCompare(String(b), 'es'));
  }

  async function renderEditor() {
    const c = borrador.criterio;
    const sel = (id, label, campo, valor) => `
      <div class="field"><label>${esc(label)}</label>
        <select data-crit="${id}">
          <option value="">Todos</option>
          ${opcionesDe(campo).map(o => `<option value="${esc(o)}"${valor === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}
        </select>
      </div>`;

    host.innerHTML = `
      <div class="view-head">
        <h1>Nueva campaña</h1>
        <div class="head-actions">
          <button class="btn-secondary" id="cmpVolver">Cancelar</button>
          <button class="btn-primary" id="cmpConfirmar">Confirmar campaña</button>
        </div>
      </div>
      ${avisoMotor()}
      <div class="cmp-editor">
        <div class="cmp-col">

          <div class="panel">
            <div class="panel-title">1 · Nombre</div>
            <div class="field"><label>Cómo la vas a reconocer después</label>
              <input type="text" id="cmpNombre" placeholder="Ej: Ferreterías Ituzaingó · agosto" value="${esc(borrador.nombre)}" />
            </div>
          </div>

          <div class="panel">
            <div class="panel-title">2 · A quién le llega</div>
            <div class="form-grid">
              ${sel('tipo', 'Tipo', 'tipo', c.tipo)}
              ${sel('ciudad', 'Ciudad', 'ciudad', c.ciudad)}
              ${sel('rubro', 'Rubro', 'rubro', c.rubro)}
              ${sel('prioridad', 'Prioridad', 'prioridad', c.prioridad)}
            </div>
            <label class="chip-check cmp-check">
              <input type="checkbox" data-crit="soloSinContactar"${c.soloSinContactar ? ' checked' : ''} />
              <span>Sólo los que nunca contactamos por ningún canal</span>
            </label>
            <div class="field cmp-dias">
              <label>No incluir a quien se contactó en los últimos</label>
              <div class="cmp-inline">
                <input type="number" min="7" max="365" data-crit="diasMinimos" value="${Number(c.diasMinimos || 30)}" />
                <span class="cell-dim">días</span>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-title">3 · Qué les decimos</div>
            <textarea id="cmpMensaje" class="chat-input" placeholder="Hola {{nombre}}, ...">${esc(borrador.mensaje)}</textarea>
            <div class="cmp-vars">
              <span class="cell-dim">Insertar dato del prospecto:</span>
              ${CAMP.VARIABLES.map(v => `<button type="button" class="tag cmp-var" data-var="${v.id}">${esc(v.label)}</button>`).join('')}
            </div>
          </div>

          <div class="panel">
            <div class="panel-title">4 · Ritmo</div>
            <div class="form-grid">
              <div class="field"><label>Máximo por día</label>
                <input type="number" min="1" max="1000" id="cmpCupo" value="${Number(borrador.cupo_diario)}" /></div>
              <div class="field"><label>Segundos entre mensaje y mensaje</label>
                <input type="number" min="5" max="600" id="cmpIntervalo" value="${Number(borrador.intervalo_seg)}" /></div>
              <div class="field"><label>Empezar a las</label>
                <input type="time" id="cmpDesde" value="${esc(borrador.ventana_desde)}" /></div>
              <div class="field"><label>Terminar a las</label>
                <input type="time" id="cmpHasta" value="${esc(borrador.ventana_hasta)}" /></div>
              <div class="field full"><label>Arrancar el día (vacío = apenas se confirme)</label>
                <input type="datetime-local" id="cmpFecha" value="${esc(borrador.programada_para)}" /></div>
            </div>
          </div>

        </div>
        <div class="cmp-col cmp-col-right">
          <div id="cmpPreview">${cargando('Calculando…')}</div>
        </div>
      </div>`;

    document.getElementById('cmpVolver').onclick = () => { pantalla = 'lista'; render(host); };
    document.getElementById('cmpConfirmar').onclick = confirmarCampana;

    // Cada cambio recalcula a quién le llega. Es barato: los prospectos ya
    // están en memoria, no se consulta la base.
    host.querySelectorAll('[data-crit]').forEach(el => {
      el.onchange = () => {
        const k = el.dataset.crit;
        borrador.criterio[k] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? Number(el.value) : el.value);
        recalcular();
      };
    });
    document.getElementById('cmpNombre').oninput = e => { borrador.nombre = e.target.value; };
    ['cmpCupo:cupo_diario', 'cmpIntervalo:intervalo_seg', 'cmpDesde:ventana_desde', 'cmpHasta:ventana_hasta', 'cmpFecha:programada_para']
      .forEach(par => {
        const [id, campo] = par.split(':');
        const el = document.getElementById(id);
        el.onchange = () => { borrador[campo] = el.type === 'number' ? Number(el.value) : el.value; recalcular(); };
      });

    const ta = document.getElementById('cmpMensaje');
    ta.oninput = () => { borrador.mensaje = ta.value; pintarPreview(); };
    host.querySelectorAll('.cmp-var').forEach(b => {
      b.onclick = () => insertarVariable(ta, '{{' + b.dataset.var + '}}');
    });

    recalcular();
  }

  function insertarVariable(ta, texto) {
    const ini = ta.selectionStart, fin = ta.selectionEnd;
    ta.value = ta.value.slice(0, ini) + texto + ta.value.slice(fin);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ini + texto.length;
    borrador.mensaje = ta.value;
    pintarPreview();
  }

  async function recalcular() {
    try {
      segmento = await CAMP.armarSegmento(borrador.criterio, borrador.mensaje);
    } catch (e) {
      segmento = null;
      document.getElementById('cmpPreview').innerHTML = errorBox(e);
      return;
    }
    previewIdx = 0;
    pintarPreview();
  }

  function pintarPreview() {
    const box = document.getElementById('cmpPreview');
    if (!box) return;
    if (!segmento) { box.innerHTML = cargando('Calculando…'); return; }

    const inc = segmento.incluidos;
    const porMotivo = {};
    segmento.excluidos.forEach(e => { porMotivo[e.motivo] = (porMotivo[e.motivo] || 0) + 1; });

    const conFaltantes = inc.filter(i => i.faltantes.length).length;
    const ejemplo = inc[previewIdx % Math.max(inc.length, 1)];
    const texto = ejemplo ? CAMP.reemplazarVariables(borrador.mensaje, ejemplo.prospecto) : '';
    const dias = Math.ceil(inc.length / Math.max(Number(borrador.cupo_diario) || 1, 1));

    box.innerHTML = `
      <div class="panel cmp-resumen">
        <div class="cmp-big"><strong>${num(inc.length)}</strong><span>${inc.length === 1 ? 'persona recibe el mensaje' : 'personas reciben el mensaje'}</span></div>
        <div class="cmp-tiempo">${icon('clock', 14)} A ${num(borrador.cupo_diario)} por día son <strong>${dias} ${dias === 1 ? 'día' : 'días'}</strong> de envío</div>
        ${segmento.excluidos.length ? `
          <div class="cmp-excl">
            <div class="cmp-excl-tit">${num(segmento.excluidos.length)} quedan afuera</div>
            ${Object.entries(porMotivo).sort((a, b) => b[1] - a[1]).map(([m, n]) =>
              `<div class="cmp-excl-row"><span>${esc(m)}</span><strong>${num(n)}</strong></div>`).join('')}
          </div>` : ''}
        ${conFaltantes ? `<div class="cmp-nota cmp-nota-warn">${icon('alert', 14)} A ${num(conFaltantes)} les falta algún dato que usás en el mensaje. Se les manda con ese hueco vacío.</div>` : ''}
      </div>

      <div class="panel cmp-preview">
        <div class="panel-title">Cómo le llega</div>
        ${ejemplo ? `
          <div class="cmp-quien">${esc(ejemplo.prospecto.empresa || ejemplo.prospecto.nombre || 'Sin nombre')}
            <span class="cell-dim">· ${esc(window.TEL.formatear(ejemplo.telefono))}</span></div>
          <div class="cmp-burbuja">${texto ? esc(texto).replace(/\n/g, '<br>') : '<span class="cell-dim">Escribí el mensaje para verlo acá.</span>'}</div>
          ${inc.length > 1 ? `<button class="btn-secondary cmp-otro" id="cmpOtro">Ver con otro prospecto</button>` : ''}
        ` : '<div class="cell-dim">Ningún prospecto entra con estos filtros.</div>'}
      </div>`;

    const otro = document.getElementById('cmpOtro');
    if (otro) otro.onclick = () => { previewIdx++; pintarPreview(); };
  }

  function confirmarCampana() {
    if (!borrador.nombre.trim()) return toast('Poné un nombre a la campaña', 'error');
    if (!borrador.mensaje.trim()) return toast('Falta escribir el mensaje', 'error');
    if (!segmento || !segmento.incluidos.length) return toast('No hay ningún destinatario con estos filtros', 'error');

    const n = segmento.incluidos.length;
    const dias = Math.ceil(n / Math.max(Number(borrador.cupo_diario) || 1, 1));
    confirmDialog('Confirmar campaña',
      `Se le va a mandar el mensaje a ${num(n)} personas, de a ${num(borrador.cupo_diario)} por día (${dias} ${dias === 1 ? 'día' : 'días'}). ` +
      `Otras ${num(segmento.excluidos.length)} quedan afuera. Todavía no se manda nada: queda lista esperando el motor de envío.`,
      'Confirmar', guardarCampana);
  }

  async function guardarCampana() {
    try {
      toast('Guardando…');
      const c = await CAMP.crear({
        nombre: borrador.nombre.trim(),
        criterio: Object.assign({}, borrador.criterio, { mensaje: borrador.mensaje }),
        canal: borrador.canal,
        cupo_diario: Number(borrador.cupo_diario),
        intervalo_seg: Number(borrador.intervalo_seg),
        ventana_desde: borrador.ventana_desde || null,
        ventana_hasta: borrador.ventana_hasta || null,
        programada_para: borrador.programada_para ? new Date(borrador.programada_para).toISOString() : null,
        estado: 'programada',
      });
      await CAMP.confirmar(c.id, segmento, {
        onProgreso: (hechas, total) => toast(`Guardando destinatarios ${hechas}/${total}…`),
      });
      toast('Campaña creada', 'ok');
      campanaId = c.id; pantalla = 'detalle'; tabDetalle = 'destinatarios';
      render(host);
    } catch (e) {
      toast('No se pudo guardar: ' + e.message, 'error');
    }
  }

  /* ============================================================
     DETALLE
     ============================================================ */

  async function renderDetalle() {
    host.innerHTML = cargando('Cargando campaña…');
    let c, r, filas;
    try {
      c = await CAMP.obtener(campanaId);
      if (!c) { pantalla = 'lista'; return render(host); }
      r = await CAMP.resumen(campanaId);
      filas = await CAMP.destinatarios(campanaId, {
        estado: tabDetalle === 'excluidos' ? 'suprimido' : null,
        porPagina: 100,
      });
      if (tabDetalle === 'destinatarios') filas = filas.filter(f => f.estado !== 'suprimido');
    } catch (e) {
      host.innerHTML = errorBox(e);
      return;
    }

    const hechos = r.enviado + r.entregado + r.leido + r.respondido + r.fallido;
    const pct = r.alcanzables ? Math.round(hechos / r.alcanzables * 100) : 0;
    const pausable = ['en_curso', 'programada'].indexOf(c.estado) >= 0;
    const reanudable = c.estado === 'pausada';

    host.innerHTML = `
      <div class="view-head">
        <div>
          <button class="btn-ghost cmp-back" id="cmpBack">← Campañas</button>
          <h1>${esc(c.nombre)}</h1>
          <div class="cmp-sub">${chipCampana(c.estado)}
            <span class="cell-dim">Creada ${fmtDateTime(c.creada_en)}</span>
            ${c.programada_para ? `<span class="cell-dim">· arranca ${fmtDateTime(c.programada_para)}</span>` : ''}
          </div>
        </div>
        <div class="head-actions">
          ${pausable ? `<button class="btn-secondary" id="cmpPausar">${icon('pause', 15)} Pausar</button>` : ''}
          ${reanudable ? `<button class="btn-primary" id="cmpReanudar">${icon('play', 15)} Reanudar</button>` : ''}
          <button class="btn-secondary" id="cmpExportar">${icon('download', 15)} Exportar</button>
        </div>
      </div>
      ${c.motivo_pausa ? `<div class="cmp-nota cmp-nota-warn">${icon('alert', 15)} Se pausó sola: ${esc(c.motivo_pausa)}</div>` : ''}

      <div class="kpi-grid">
        ${kpi('Le llega a', num(r.alcanzables))}
        ${kpi('Enviados', num(r.enviado + r.entregado + r.leido + r.respondido))}
        ${kpi('Respondieron', num(r.respondido), '#3ecf8e')}
        ${kpi('Fallaron', num(r.fallido), r.fallido ? '#ff5d6c' : null)}
        ${kpi('Excluidos', num(r.suprimido), '#607699')}
      </div>

      <div class="panel cmp-progreso">
        <div class="cmp-progreso-top"><span>Progreso</span><strong>${pct}% · ${num(hechos)} de ${num(r.alcanzables)}</strong></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>

      <div class="tabs">
        <button class="tab${tabDetalle === 'destinatarios' ? ' active' : ''}" data-tab="destinatarios">Destinatarios (${num(r.alcanzables)})</button>
        <button class="tab${tabDetalle === 'excluidos' ? ' active' : ''}" data-tab="excluidos">Excluidos (${num(r.suprimido)})</button>
        <button class="tab${tabDetalle === 'mensaje' ? ' active' : ''}" data-tab="mensaje">Mensaje</button>
      </div>
      <div id="cmpTab">${tabDetalle === 'mensaje' ? tabMensaje(c) : tablaDestinatarios(filas, tabDetalle === 'excluidos')}</div>`;

    document.getElementById('cmpBack').onclick = () => { pantalla = 'lista'; render(host); };
    host.querySelectorAll('[data-tab]').forEach(b => {
      b.onclick = () => { tabDetalle = b.dataset.tab; render(host); };
    });
    const bp = document.getElementById('cmpPausar');
    if (bp) bp.onclick = async () => { await CAMP.actualizar(c.id, { estado: 'pausada' }); toast('Campaña pausada'); render(host); };
    const br = document.getElementById('cmpReanudar');
    if (br) br.onclick = async () => { await CAMP.actualizar(c.id, { estado: 'programada', motivo_pausa: null }); toast('Campaña reanudada', 'ok'); render(host); };
    document.getElementById('cmpExportar').onclick = () => exportar(c);
  }

  // Los excluidos por teléfono inválido se guardan con una marca interna
  // en vez de un número. Al mostrarlos no tiene sentido enseñar la marca.
  function telefonoLegible(t) {
    if (!t || CAMP.esSinNumero(t)) return 'sin número';
    return window.TEL.formatear(t);
  }

  function nombreDe(prospectoId) {
    const p = DB.getProspecto(prospectoId);
    return p ? (p.empresa || p.nombre || prospectoId) : prospectoId;
  }

  function tablaDestinatarios(filas, esExcluidos) {
    if (!filas.length) {
      return `<div class="empty"><h3>${esExcluidos ? 'No quedó nadie afuera' : 'Sin destinatarios'}</h3>
        <p>${esExcluidos ? 'Todos los prospectos que entraban en los filtros pasaron los controles.' : 'Esta campaña no tiene a nadie cargado.'}</p></div>`;
    }
    return `<div class="table-wrap"><table>
      <thead><tr>
        <th>Prospecto</th><th>Teléfono</th><th>Estado</th>
        <th>${esExcluidos ? 'Por qué quedó afuera' : 'Detalle'}</th><th>Enviado</th>
      </tr></thead><tbody>
      ${filas.map(f => {
        const e = CAMP.ESTADOS_DEST[f.estado] || { label: f.estado, color: '#8b94a8' };
        return `<tr>
          <td class="cell-strong">${esc(nombreDe(f.prospecto_id))}</td>
          <td class="cell-dim">${esc(telefonoLegible(f.telefono))}</td>
          <td>${chip(e.label, e.color)}</td>
          <td class="cell-dim">${esc(f.motivo || '—')}</td>
          <td class="cell-dim">${f.enviado_en ? fmtDateTime(f.enviado_en) : '—'}</td>
        </tr>`;
      }).join('')}
    </tbody></table>
    ${filas.length >= 100 ? '<div class="cmp-nota">Se muestran los primeros 100. Usá Exportar para verlos todos.</div>' : ''}
    </div>`;
  }

  function tabMensaje(c) {
    const texto = (c.criterio && c.criterio.mensaje) || '';
    return `<div class="panel">
      <div class="panel-title">El mensaje tal como se guardó</div>
      <div class="cmp-burbuja">${texto ? esc(texto).replace(/\n/g, '<br>') : '<span class="cell-dim">Sin mensaje.</span>'}</div>
      <div class="cmp-nota">Ritmo: ${num(c.cupo_diario)} por día, uno cada ${num(c.intervalo_seg)} segundos${c.ventana_desde ? `, entre las ${esc(c.ventana_desde)} y las ${esc(c.ventana_hasta)}` : ''}.</div>
    </div>`;
  }

  /* ---------- Exportar ---------- */

  async function exportar(c) {
    toast('Preparando el archivo…');
    let todas = [], pagina = 0;
    while (true) {
      const t = await CAMP.destinatarios(c.id, { pagina: pagina, porPagina: 1000 });
      todas = todas.concat(t);
      if (t.length < 1000) break;
      pagina++;
    }
    const cab = ['Prospecto', 'Telefono', 'Estado', 'Motivo', 'Enviado', 'Respondio'];
    const filas = todas.map(f => [
      nombreDe(f.prospecto_id),
      telefonoLegible(f.telefono),
      (CAMP.ESTADOS_DEST[f.estado] || {}).label || f.estado,
      f.motivo || '',
      f.enviado_en || '',
      f.respondido_en || '',
    ]);
    const csv = '﻿' + [cab].concat(filas)
      .map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(';'))
      .join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'campana-' + c.nombre.replace(/[^\w\-]+/g, '-').toLowerCase() + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Archivo descargado', 'ok');
  }

  /* ============================================================ */

  function render(destino) {
    host = destino || host;
    if (!window.CAMP || !CAMP.hayNube()) {
      host.innerHTML = `<div class="empty"><h3>Sin conexión a la base</h3>
        <p>Las campañas necesitan la base en la nube y ahora mismo no está disponible.</p></div>`;
      return;
    }
    if (pantalla === 'editor') return renderEditor();
    if (pantalla === 'detalle') return renderDetalle();
    return renderLista();
  }

  // Entrada desde el menú. Siempre arranca en la lista: si te fuiste a mirar
  // un prospecto y volvés, no tiene que recibirte un editor a medio llenar.
  function entrar(destino) {
    pantalla = 'lista';
    campanaId = null;
    borrador = null;
    segmento = null;
    render(destino);
  }

  window.CampanasVista = { render: entrar };
})();
