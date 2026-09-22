/* ============================================================
   TNR · Medición del embudo, por canal y por tanda
   ------------------------------------------------------------
   Responde una sola pregunta, con los datos que ya están cargados:
   de cada 100 contactos por un canal, ¿cuántos responden, cuántos
   llegan a una charla o demo y cuántos cierran?

   Cómo se arma, y por qué así:

   1. Se lee el HISTORIAL de cada prospecto, no su estado de hoy.
      El estado dice dónde está ahora; el historial dice cuándo pasó
      cada cosa. Sin fecha no hay tanda que valga.
   2. Una TANDA es la semana en la que se hizo el contacto, separada
      por canal. Se mide esa tanda completa: los que respondieron
      tres días después cuentan en la tanda del día que se los contactó.
   3. Una tanda con menos de 7 días se marca "abierta": todavía puede
      recibir respuestas y su número va a subir.
   4. Cada porcentaje va con su margen de error (intervalo de Wilson,
      95%). Con 20 contactos el margen es enorme y el número no
      significa nada: eso hay que verlo, no esconderlo.

   Las visitas se parten en dos, porque no son lo mismo:
     · Visita en frío   — se cayó al local sin haber hablado nunca.
     · Visita agendada  — el negocio ya había respondido antes.
   ============================================================ */
(function () {
  'use strict';

  const U = () => window.TNRUI || {};
  const esc = s => (U().esc ? U().esc(s) : String(s == null ? '' : s));

  // Estados que significan "nos contestó". Incluye las formas viejas.
  const RESPONDIO = ['Seguimiento', 'Respondió', 'Interesado', 'En Negociación', 'Recontactar',
    'Demo agendada', 'Demo enviada', 'Reunión Agendada', 'Propuesta Enviada', 'Demo Enviada', 'Ganado'];
  const DEMO = ['Demo agendada', 'Demo enviada', 'Reunión Agendada', 'Propuesta Enviada', 'Demo Enviada'];
  const PERDIDO = ['No funcionó', 'Perdido'];

  const CANALES = ['WhatsApp', 'Llamada', 'Visita en frío', 'Visita agendada', 'Instagram', 'Mail'];
  const COLOR = { 'WhatsApp': '#25D366', 'Llamada': '#f5c451', 'Visita en frío': '#3ecf8e',
    'Visita agendada': '#7c5cff', 'Instagram': '#c13584', 'Mail': '#1C9FE2' };

  const dia = iso => String(iso || '').slice(0, 10);
  const lunesDe = f => (window.Sistema ? Sistema.lunesDe(f) : f);
  const diasEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

  /* ---------- los hechos de un prospecto, ordenados en el tiempo ---------- */
  function hechosDe(p) {
    const h = (p.historial || []).slice().filter(x => x && x.fecha)
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const contactos = [];
    let respuesta = '', demo = '', cierre = '', perdida = '';
    h.forEach(x => {
      const t = String(x.texto || '');
      if (x.tipo === 'Contacto') {
        const canal = (t.match(/Contactado por (.+)$/) || [])[1];
        if (canal) contactos.push({ canal: canal.trim(), fecha: x.fecha });
      } else if (x.tipo === 'Estado') {
        const nuevo = (t.split('→')[1] || '').trim();
        if (!respuesta && RESPONDIO.includes(nuevo)) respuesta = x.fecha;
        if (!demo && DEMO.includes(nuevo)) demo = x.fecha;
        if (!perdida && PERDIDO.includes(nuevo)) perdida = x.fecha;
      }
      if (!cierre && /convertido en cliente/i.test(t)) cierre = x.fecha;
    });
    // Un prospecto migrado puede tener el estado puesto sin el paso en el historial.
    if (!respuesta && RESPONDIO.includes(p.estado)) respuesta = p.ultimoContacto || p.fechaCreacion || '';
    if (!demo && DEMO.includes(p.estado)) demo = respuesta;
    if (!cierre && p.estado === 'Ganado') cierre = respuesta;
    return { contactos, respuesta, demo, cierre, perdida };
  }

  /* ---------- cada contacto es una fila: canal, semana y qué pasó después ---------- */
  function filas(desdeISO) {
    const out = [];
    (DB.getProspectos() || []).forEach(p => {
      const f = hechosDe(p);
      f.contactos.forEach((c, i) => {
        const fecha = dia(c.fecha);
        if (!fecha || (desdeISO && fecha < desdeISO)) return;
        // Un segundo contacto por el mismo canal es seguimiento, no un contacto nuevo:
        // mediríamos dos veces al mismo negocio.
        if (f.contactos.slice(0, i).some(x => x.canal === c.canal)) return;
        let canal = c.canal;
        if (/visita/i.test(canal)) {
          const antes = f.respuesta && dia(f.respuesta) < fecha;
          canal = antes ? 'Visita agendada' : 'Visita en frío';
        }
        const despues = campo => (campo && dia(campo) >= fecha ? dia(campo) : '');
        out.push({
          id: p.id, empresa: p.empresa || p.nombre, canal, fecha, semana: lunesDe(fecha),
          respuesta: despues(f.respuesta), demo: despues(f.demo), cierre: despues(f.cierre),
        });
      });
    });
    return out;
  }

  /* ---------- estadística ---------- */
  // Intervalo de Wilson al 95%: con muestras chicas o proporciones cerca de 0
  // es el que no miente (el clásico p ± 1,96·√(p(1-p)/n) da rangos imposibles).
  function wilson(x, n) {
    if (!n) return null;
    const z = 1.96, p = x / n, d = 1 + z * z / n;
    const centro = (p + z * z / (2 * n)) / d;
    const semi = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return { p: p * 100, bajo: Math.max(0, (centro - semi) * 100), alto: Math.min(100, (centro + semi) * 100) };
  }
  // Cuántos contactos hacen falta para medir esa proporción con ±e puntos.
  function hacenFalta(p, e) {
    const z = 1.96, pr = Math.max(0.005, p / 100), er = e / 100;
    return Math.ceil(z * z * pr * (1 - pr) / (er * er));
  }
  const pct = v => (v == null ? '—' : (v >= 10 ? v.toFixed(0) : v.toFixed(1)) + '%');

  function resumir(list, hoy) {
    const n = list.length;
    // Sólo cuentan para el porcentaje los contactos que ya tuvieron su ventana
    // de 7 días; los de esta semana se muestran aparte, sin ensuciar la tasa.
    const maduros = list.filter(r => diasEntre(r.fecha, hoy) >= 7);
    const resp = maduros.filter(r => r.respuesta).length;
    const demo = maduros.filter(r => r.demo).length;
    const cierre = maduros.filter(r => r.cierre).length;
    const tiempos = maduros.filter(r => r.respuesta).map(r => diasEntre(r.fecha, r.respuesta)).sort((a, b) => a - b);
    return {
      n, abiertos: n - maduros.length, base: maduros.length, resp, demo, cierre,
      tasaResp: wilson(resp, maduros.length), tasaDemo: wilson(demo, maduros.length),
      tasaCierre: wilson(cierre, maduros.length),
      demoDeResp: wilson(demo, resp), cierreDeDemo: wilson(cierre, demo),
      medianaResp: tiempos.length ? tiempos[Math.floor(tiempos.length / 2)] : null,
    };
  }

  /* ============================================================
     PANTALLA
     ============================================================ */
  let periodo = 90;   // días hacia atrás
  let abierto = '';   // canal con el detalle semanal desplegado

  function barra(r, color) {
    if (!r || !r.tasaResp) return '';
    const w = x => Math.max(2, Math.min(100, x));
    return `<div class="med-barra" title="Sobre ${r.base} contactos con 7 días cumplidos">
      <div style="width:100%;background:${color}22"></div>
      <div style="width:${w(r.tasaResp.p)}%;background:${color}"></div>
      <div style="width:${w(r.tasaDemo.p)}%;background:${color};opacity:.75"></div>
      <div style="width:${w(r.tasaCierre.p)}%;background:#fff"></div>
    </div>`;
  }

  function tarjeta(canal, list, hoy) {
    const r = resumir(list, hoy);
    if (!r.n) return '';
    const c = COLOR[canal] || '#1C9FE2';
    const agendada = canal === 'Visita agendada';
    // En las visitas agendadas lo que se mide es el cierre, no la respuesta.
    const medida = agendada ? r.tasaCierre : r.tasaResp;
    const falta100 = medida ? hacenFalta(medida.p, agendada ? 10 : 5) : 0;
    const det = abierto === canal;
    const semanas = {};
    list.forEach(x => (semanas[x.semana] || (semanas[x.semana] = [])).push(x));
    return `<section class="med-card" style="--c:${c}">
      <div class="med-top">
        <h3>${esc(canal)}</h3>
        <span class="med-n">${r.n} contacto${r.n > 1 ? 's' : ''}${r.abiertos ? ` · ${r.abiertos} sin cumplir 7 días` : ''}</span>
      </div>
      ${r.base ? `
      <div class="med-nums">
        ${agendada ? `<div><strong>${r.base}</strong><span>ya venían respondiendo<em>en este canal la respuesta ya pasó: el embudo arranca en la visita</em></span></div>`
        : `<div><strong>${pct(r.tasaResp && r.tasaResp.p)}</strong><span>responden<em>${r.resp} de ${r.base}${r.tasaResp ? ` · entre ${pct(r.tasaResp.bajo)} y ${pct(r.tasaResp.alto)}` : ''}</em></span></div>`}
        <div><strong>${pct(r.tasaDemo && r.tasaDemo.p)}</strong><span>llegan a demo o charla<em>${r.demo} de ${r.base}${r.demoDeResp ? ` · ${pct(r.demoDeResp.p)} de los que responden` : ''}</em></span></div>
        <div><strong>${pct(r.tasaCierre && r.tasaCierre.p)}</strong><span>cierran<em>${r.cierre} de ${r.base}${r.cierreDeDemo ? ` · ${pct(r.cierreDeDemo.p)} de las demos` : ''}</em></span></div>
        ${agendada ? '' : `<div><strong>${r.medianaResp == null ? '—' : r.medianaResp + ' d'}</strong><span>tardan en contestar<em>mediana de los que contestaron</em></span></div>`}
      </div>
      ${barra(r, c)}
      <div class="med-nota">
        ${r.cierre === 0 && r.base ? `Todavía no cerró ninguno por acá: con ${r.base} ${agendada ? 'visitas' : 'contactos'} no alcanza para sacar una tasa de cierre. ` : ''}
        Para medir ${agendada ? 'el cierre con ±10' : 'la respuesta con ±5'} puntos hacen falta unos <strong>${falta100}</strong>
        ${agendada ? 'visitas agendadas' : 'contactos por este canal'}; llevás <strong>${r.base}</strong>.
      </div>` : `<div class="med-nota">Ninguno cumplió todavía los 7 días. Volvé a mirar el ${esc(window.Sistema ? Sistema.sumarDias(hoy, 7) : '')}.</div>`}
      <button class="med-ver" onclick="Medicion.detalle('${esc(canal)}')">${det ? 'Ocultar' : 'Ver'} tanda por tanda</button>
      ${det ? `<div class="med-tabla"><table class="tbl">
        <thead><tr><th>Semana</th><th class="num">Contactos</th><th class="num">Responden</th><th class="num">Demos</th><th class="num">Cierres</th></tr></thead>
        <tbody>${Object.keys(semanas).sort().reverse().map(s => {
          const w = resumir(semanas[s], hoy);
          const nuevo = w.abiertos ? ' <span class="med-abierta">abierta</span>' : '';
          return `<tr><td>${esc(fmtSemana(s))}${nuevo}</td><td class="num">${w.n}</td>
            <td class="num">${!w.base ? '—' : agendada ? '—' : `${w.resp} <span class="muted">(${pct(w.tasaResp.p)})</span>`}</td>
            <td class="num">${w.base ? w.demo : '—'}</td><td class="num">${w.base ? w.cierre : '—'}</td></tr>`;
        }).join('')}</tbody></table></div>` : ''}
    </section>`;
  }

  function fmtSemana(s) {
    const d = new Date(s + 'T12:00');
    const f = new Date(d); f.setDate(f.getDate() + 6);
    const dm = x => `${x.getDate()}/${x.getMonth() + 1}`;
    return `${dm(d)} al ${dm(f)}`;
  }

  function render(host) {
    const hoy = window.Sistema ? Sistema.hoy() : new Date().toISOString().slice(0, 10);
    const desde = periodo ? Sistema.sumarDias(hoy, -periodo) : '';
    const todas = filas(desde);
    const porCanal = {};
    todas.forEach(r => (porCanal[r.canal] || (porCanal[r.canal] = [])).push(r));
    const orden = CANALES.filter(c => porCanal[c]).concat(Object.keys(porCanal).filter(c => !CANALES.includes(c)));

    host.innerHTML = `
      <div class="so-head">
        <div><h1>Medición</h1><div class="sub">Qué pasa después de cada contacto, canal por canal</div></div>
      </div>
      <div class="so-chips" style="margin-bottom:16px">
        ${[[30, 'Últimos 30 días'], [90, 'Últimos 90 días'], [0, 'Todo']].map(([d, l]) =>
          `<button class="so-chip ${periodo === d ? 'on' : ''}" onclick="Medicion.periodo(${d})">${l}</button>`).join('')}
      </div>
      ${orden.length ? orden.map(c => tarjeta(c, porCanal[c], hoy)).join('') : `
        <div class="empty"><h3>Todavía no hay contactos con fecha</h3>
        <p>Se mide lo que queda anotado: cada vez que abrís WhatsApp desde el CRM, o tocás
        "Marcar contactado", queda la fecha y el canal. Lo que se manda por fuera del CRM no se puede medir.</p></div>`}
      <section class="med-metodo">
        <strong>Cómo se calcula</strong>
        <ul>
          <li>Una <b>tanda</b> es la semana del contacto. Si alguien contesta tres días después, cuenta en la semana en que se lo contactó.</li>
          <li>Los porcentajes se calculan sólo sobre los contactos que ya cumplieron <b>7 días</b>. Los de esta semana figuran aparte como "sin cumplir 7 días".</li>
          <li>El rango que va al lado de cada porcentaje es el <b>margen de error al 95%</b>. Con pocos contactos el rango es enorme: ahí el número todavía no dice nada.</li>
          <li>Si al mismo negocio se lo contacta dos veces por el mismo canal, cuenta una sola vez.</li>
          <li><b>Visita en frío</b> es caerle sin haber hablado nunca; <b>visita agendada</b> es cuando ya había respondido antes.</li>
        </ul>
      </section>`;
  }

  window.Medicion = {
    render,
    periodo(d) { periodo = d; if (window.TNRUI) TNRUI.render(); },
    detalle(c) { abierto = abierto === c ? '' : c; if (window.TNRUI) TNRUI.render(); },
    // por si hace falta desde la consola
    filas, resumir,
  };
})();
