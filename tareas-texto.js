/* ============================================================
   TNR · Tareas escritas de corrido
   ------------------------------------------------------------
   Se escriben las tareas como en un chat, una por línea, y esto
   las ordena: qué día, a qué hora, de quién, prioridad y con qué
   prospecto o cliente tienen que ver. Antes de guardar se muestran
   para corregir lo que haya entendido mal. Sin IA: son reglas, así
   que anda offline y no cuesta nada.

   Ejemplos que entiende:
     Martina: llamar a Ulicar el viernes a las 17
     mañana a la tarde Mateo y Santi visitan Haedo
     urgente mandar 15 mensajes de recontacto
     Jueves                      <- una línea sola con un día o una
     - pasar por Hipopota           persona vale para las de abajo
     - demo a Willy Jonka 18hs
   ============================================================ */
(function () {
  'use strict';

  const U = () => window.TNRUI || {};
  const esc = s => (U().esc ? U().esc(s) : String(s == null ? '' : s));
  const toast = (m, k) => U().toast && U().toast(m, k);
  const S = () => window.Sistema;
  const LS = 'tnr_tareas_texto';

  /* ---------- texto sin tildes, del MISMO largo que el original ----------
     Se busca sobre la versión normalizada y se corta sobre la original:
     por eso cada letra se cambia por una sola (á -> a, ñ -> n). */
  const MAPA = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'ñ': 'n' };
  const norm = s => String(s || '').toLowerCase().replace(/[áéíóúüñ]/g, c => MAPA[c]);

  const DIAS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };

  // Quién es quién. Lo más largo primero, para que "santi r" no se lea como "santi".
  const ALIAS = [
    ['santiago de rosa', 'santiderosa'], ['santi de rosa', 'santiderosa'], ['santi r', 'santiderosa'],
    ['santi stalla', 'santiago'], ['stalla', 'santiago'], ['santiago', 'santiago'], ['santi', 'santiago'],
    ['mateo', 'mateo'], ['bautista', 'bautista'], ['bauti', 'bautista'],
    ['martina', 'martina'], ['marti', 'martina'],
    ['todos', 'equipo'], ['los dos', 'equipo'], ['equipo', 'equipo'],
    ['yo', '@yo'],
  ];
  const RE_ALIAS = ALIAS.map(a => a[0]).join('|');

  const UNIDAD = { mensajes: 'mensajes', msj: 'mensajes', wsp: 'mensajes', whatsapps: 'mensajes',
    mails: 'mails', correos: 'mails', llamadas: 'llamadas', contactos: 'contactos', minutos: 'minutos', min: 'minutos' };

  const SISTEMA_PALABRAS = [
    ['prospeccion', /\b(llamar|llamad|cold ?call|recontact|seguimiento|visitar|visita|pasar por|prospect|demo|mensaje|wsp|whatsapp|mail|propuesta|presupuesto|reunion|cerrar|vender)/],
    ['gestion', /\b(entregar|publicar|carrusel|reel|posteo|editar|grabar|subir|cobrar|factur|mantenimiento|informe|cliente)/],
    ['optimizacion', /\b(mejorar|automatiz|ordenar|crm|capacit|aprender|armar el sistema|proceso)/],
  ];

  /* ---------- fechas ---------- */
  function sumar(n) { return S().sumarDias(S().hoy(), n); }
  function proximo(dia, forzarSiguiente) {
    const h = S().hoy();
    const actual = S().diaSemana(h);
    let n = (dia - actual + 7) % 7;
    if (n === 0 && forzarSiguiente) n = 7;
    return S().sumarDias(h, n);
  }
  function lunesQueViene() { return proximo(1, true); }
  function fechaDe(dia, mes, anio) {
    const h = S().hoy();
    let y = anio ? (anio < 100 ? 2000 + anio : anio) : +h.slice(0, 4);
    const f = `${y}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    // "el 3/1" escrito en diciembre es del año que viene
    if (!anio && f < S().sumarDias(h, -7)) return `${y + 1}${f.slice(4)}`;
    return f;
  }

  /* ---------- índice de prospectos y clientes para vincular ---------- */
  let indice = null;
  function armarIndice() {
    const out = [];
    const genericos = /^(taller|local|kiosco|gimnasio|salon|estudio|lubricentro|farmacia|veterinaria|panaderia)$/;
    // "Salón Hipopota" también se escribe "Hipopota": se indexa sin el rubro de adelante
    const rubro = /^(salon( de eventos| de fiestas)?|lubricentro|taller( mecanico)?|gimnasio|estudio( contable| juridico)?|chapa y pintura|recepciones|perfumeria|ferreteria|herreria|inmobiliaria|veterinaria|centro de estetica|estetica|panaderia|kiosco|cotillon|restaurante|bar)\s+/;
    const add = (tipo, id, nombre) => {
      const n = norm(nombre).replace(/\s+/g, ' ').trim();
      if (n.length < 4 || genericos.test(n)) return;
      out.push({ tipo, id, nombre, n });
      const corto = n.replace(rubro, '');
      if (corto !== n && corto.length >= 5 && !genericos.test(corto)) out.push({ tipo, id, nombre, n: corto });
    };
    (DB.getClientes ? DB.getClientes() : []).forEach(c => add('cliente', c.id, c.empresa || c.nombre));
    (DB.getProspectos ? DB.getProspectos() : []).forEach(p => add('prospecto', p.id, p.empresa || p.nombre));
    out.sort((a, b) => b.n.length - a.n.length);
    return out;
  }
  function vincular(n) {
    if (!indice) indice = armarIndice();
    for (const c of indice) {
      const i = n.indexOf(c.n);
      if (i < 0) continue;
      const antes = n[i - 1], despues = n[i + c.n.length];
      if ((antes && /[a-z0-9]/.test(antes)) || (despues && /[a-z0-9]/.test(despues))) continue;
      return c;
    }
    return null;
  }

  /* ---------- una línea ---------- */
  function leerLinea(original) {
    const n = norm(original);
    const cortes = [];
    const r = { fecha: '', turno: '', hora: '', personas: [], prioridad: '', objetivo: 0, unidad: '' };
    const cortar = (m, desde) => { const i = (desde || 0) + m.index; cortes.push([i, i + m[0].length]); };
    const libre = (i, j) => !cortes.some(([a, b]) => i < b && j > a);
    let m;

    // Viñetas y numeración al principio
    if ((m = /^\s*(?:[-*•·]|\d{1,2}[.)])\s+/.exec(n))) cortar(m);

    // Hora: "a las 17", "17hs", "17:30", "5 de la tarde", "10am"
    const reHora = /\b(?:a las?\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(hs\b|h\b|horas\b|am\b|pm\b)?(?:\s+de la\s+(manana|tarde|noche))?/g;
    while ((m = reHora.exec(n))) {
      const tieneA = /^a las?\s/.test(m[0]);
      if (!tieneA && !m[2] && !m[3] && !m[4]) continue;           // un número suelto no es una hora
      if (/^\s*(mensajes|msj|mails|llamadas|contactos|minutos|min|wsp)\b/.test(n.slice(m.index + m[0].length))) continue;
      let h = +m[1], mi = m[2] ? +m[2] : 0;
      if (h > 23 || mi > 59) continue;
      if (m[3] === 'pm' || m[4] === 'tarde' || m[4] === 'noche') { if (h < 12) h += 12; }
      else if (!m[3] && !m[4] && h >= 1 && h <= 7) h += 12;         // "a las 5" en un negocio es a la tarde
      r.hora = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
      r.turno = h < 13 ? 'Mañana' : 'Tarde';
      cortar(m);
      break;
    }

    // Turno: "a la mañana", "esta tarde", "a la noche"
    if ((m = /\b(?:a la|por la|de|durante la)\s+(manana|tarde|noche)\b|\besta\s+(tarde|noche|manana)\b|\btemprano\b/.exec(n)) && libre(m.index, m.index + m[0].length)) {
      const t = m[1] || m[2] || 'manana';
      if (!r.turno) r.turno = t === 'manana' ? 'Mañana' : 'Tarde';
      if (m[2] && !r.fecha) r.fecha = S().hoy();   // "esta tarde" es hoy
      cortar(m);
    }

    // Fecha
    const fechas = [
      [/\bpasado\s+manana\b/, () => sumar(2)],
      [/\b(?:para\s+)?hoy\b/, () => sumar(0)],
      [/\b(?:para\s+)?manana\b/, () => sumar(1)],
      [/\b(?:la\s+)?(?:semana que viene|proxima semana)\b/, () => lunesQueViene()],
      [/\ben\s+(\d{1,2})\s+dias\b/, x => sumar(+x[1])],
      [/\bfin de mes\b/, () => { const h = S().hoy(); const d = new Date(+h.slice(0, 4), +h.slice(5, 7), 0); return fechaDe(d.getDate(), d.getMonth() + 1); }],
      [/\b(?:el\s+|este\s+|para el\s+)?(proximo\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(\s+que viene|\s+proximo)?\b/, x => proximo(DIAS[x[2]], !!(x[1] || x[3]))],
      [/\b(?:el\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/, x => (+x[2] >= 1 && +x[2] <= 12 && +x[1] >= 1 && +x[1] <= 31) ? fechaDe(+x[1], +x[2], x[3] ? +x[3] : 0) : ''],
      [/\bel\s+(\d{1,2})\b(?!\s*(?:mensajes|msj|mails|llamadas|contactos|minutos|hs|h\b|%))/, x => {
        const d = +x[1]; if (d < 1 || d > 31) return '';
        const h = S().hoy(); let y = +h.slice(0, 4), mes = +h.slice(5, 7);
        if (d < +h.slice(8, 10)) { mes++; if (mes > 12) { mes = 1; y++; } }
        return `${y}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }],
    ];
    for (const [re, f] of fechas) {
      const x = re.exec(n);
      if (!x || !libre(x.index, x.index + x[0].length)) continue;
      const v = f(x);
      if (!v) continue;
      r.fecha = v; cortar(x); break;
    }

    // Prioridad
    if ((m = /\b(urgente|importante|prioridad alta|sin falta|si o si)\b|!{2,}/.exec(n))) { r.prioridad = 'Alta'; cortar(m); }
    else if ((m = /\b(si da el tiempo|si hay tiempo|cuando (?:pueda|puedan|se pueda)|prioridad baja|sin apuro)\b/.exec(n))) { r.prioridad = 'Baja'; cortar(m); }

    // Contador: "15 mensajes", "20 llamadas" (queda en el título)
    if ((m = /\b(\d{1,3})\s+(mensajes|msj|wsp|whatsapps|mails|correos|llamadas|contactos|minutos|min)\b/.exec(n))) {
      r.objetivo = +m[1]; r.unidad = UNIDAD[m[2]] || '';
    }

    // Personas. Sólo cuentan donde se lee como "de quién es":
    // al principio ("Martina: ...", "Mateo y Santi visitan..."), "para X",
    // "le toca a X", "a cargo de X", "(X)" o "@X".
    const quien = id => { if (!r.personas.includes(id)) r.personas.push(id); };
    const reInicio = new RegExp(`^(\\s*(?:${RE_ALIAS})\\b(?:\\s*(?:,|y|e)\\s*(?:${RE_ALIAS})\\b)*)\\s*(?:[:\\-–>]+)?\\s*`);
    // "El principio" es después de todo lo que ya se cortó adelante (viñeta,
    // "mañana a la tarde", etc.): "mañana Mateo y Santi visitan..." es de los dos.
    let posInicio = 0;
    for (let seguir = true; seguir;) {
      seguir = false;
      const ws = /^\s*/.exec(n.slice(posInicio))[0].length;
      const c = cortes.find(([a]) => a === posInicio || a === posInicio + ws);
      if (c && c[1] > posInicio) { posInicio = c[1]; seguir = true; }
    }
    if ((m = reInicio.exec(n.slice(posInicio)))) {
      const nombres = m[1];
      const esSoloYo = /^\s*yo\s*$/.test(nombres);
      // "yo" al principio sólo cuenta con dos puntos ("yo: ...")
      if (!esSoloYo || /:/.test(m[0])) {
        ALIAS.forEach(([a, id]) => { if (new RegExp(`\\b${a}\\b`).test(nombres) && !(a === 'santi' && /santi (r|de rosa|stalla)/.test(nombres))) quien(id); });
        cortar(m, posInicio);
      }
    }
    const reMarca = new RegExp(`(?:\\bpara\\s+|\\ble toca a\\s+|\\ba cargo de\\s+|\\blo hace\\s+|@)(${RE_ALIAS})\\b|\\((${RE_ALIAS})\\)`, 'g');
    while ((m = reMarca.exec(n))) {
      const a = m[1] || m[2];
      const hit = ALIAS.find(x => x[0] === a);
      if (hit) { quien(hit[1]); cortar(m); }
    }
    // "santi" y "santi r" pueden haber entrado los dos por el orden: gana el más largo
    if (r.personas.includes('santiderosa') && r.personas.includes('santiago') && !/\bsanti(ago)?\b(?!\s*(r\b|de rosa))/.test(n.replace(/santi (r|de rosa)/g, ''))) {
      r.personas = r.personas.filter(p => p !== 'santiago');
    }

    // Vínculo con un prospecto o cliente
    r.vinculo = vincular(n);

    // Título: lo que queda después de sacar fecha, hora, persona y prioridad
    let t = '';
    let i = 0;
    cortes.sort((a, b) => a[0] - b[0]).forEach(([a, b]) => { if (a >= i) { t += original.slice(i, a) + ' '; i = b; } else if (b > i) i = b; });
    t += original.slice(i);
    t = t.replace(/\s+/g, ' ')
      .replace(/\s+([,.;:])/g, '$1')
      .replace(/^[\s,.;:\-–>]+|[\s,.;:\-–>]+$/g, '')
      .replace(/\s+(el|la|los|las|a|para|de|del|y|en|a las)$/i, '')
      .replace(/^(el|la|y|para)\s+/i, '')
      .trim();
    if (t) t = t[0].toUpperCase() + t.slice(1);
    r.titulo = t;
    return r;
  }

  /* ---------- todo el texto ---------- */
  function interpretar(texto, opts) {
    opts = opts || {};
    indice = null;   // los prospectos cambian: se rearma en cada interpretación
    const yo = opts.yo || 'mateo';
    const esVendedor = !!opts.esVendedor;
    const ctx = { fecha: '', personas: [], turno: '' };
    const items = [];
    String(texto || '').split(/\n|;/).forEach(linea => {
      // Una línea en blanco corta el encabezado: lo de abajo ya no hereda el día ni la persona
      if (!linea.trim()) { ctx.fecha = ''; ctx.personas = []; ctx.turno = ''; return; }
      const r = leerLinea(linea);
      // Una línea que sólo dice un día o una persona es un encabezado
      if (!r.titulo) {
        if (r.fecha) { ctx.fecha = r.fecha; ctx.turno = r.turno; }
        if (r.personas.length) ctx.personas = r.personas;
        if (r.turno && !r.fecha) ctx.turno = r.turno;
        return;
      }
      let personas = r.personas.length ? r.personas : (ctx.personas.length ? ctx.personas : [yo]);
      personas = personas.map(p => (p === '@yo' ? yo : p));
      if (esVendedor) personas = [yo];   // un vendedor sólo puede anotarse tareas a sí mismo
      personas = [...new Set(personas)];

      let sistema = '';
      if (!esVendedor) {
        if (r.vinculo) sistema = r.vinculo.tipo === 'cliente' ? 'gestion' : 'prospeccion';
        else { const nt = norm(r.titulo); const s = SISTEMA_PALABRAS.find(([, re]) => re.test(nt)); sistema = s ? s[0] : ''; }
      }
      personas.forEach(p => items.push({
        titulo: r.titulo,
        fecha: r.fecha || ctx.fecha || S().hoy(),
        turno: r.turno || ctx.turno || '',
        recordarHora: r.hora || '',
        responsable: p,
        prioridad: r.prioridad || 'Media',
        sistema,
        objetivo: r.objetivo || 0,
        unidad: r.unidad || '',
        vinculoTipo: r.vinculo ? r.vinculo.tipo : '',
        vinculoId: r.vinculo ? r.vinculo.id : '',
        vinculoNombre: r.vinculo ? r.vinculo.nombre : '',
      }));
    });
    return items;
  }

  /* ============================================================
     PANTALLA
     ============================================================ */
  let texto = '';
  let items = [];
  try { texto = localStorage.getItem(LS) || ''; } catch (e) { texto = ''; }

  const yo = () => (window.Auth && Auth.usuarioId) || 'mateo';
  const esVendedor = () => !!(window.Auth && Auth.perfil) && !Auth.esSocio;
  const refrescar = () => { if (window.SOVista) SOVista.render(); };

  function diaCorto(f) {
    const h = S().hoy();
    if (f === h) return 'Hoy';
    if (f === S().sumarDias(h, 1)) return 'Mañana';
    const d = S().fromYmd ? S().fromYmd(f) : new Date(f + 'T12:00');
    return `${DB.DIAS_CORTOS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  }

  function fila(t, i) {
    const vend = esVendedor();
    return `<div class="tt-item">
      <div class="tt-item-top">
        <input class="tt-titulo" value="${esc(t.titulo)}" aria-label="Tarea" oninput="TareasTexto.set(${i},'titulo',this.value)" />
        <button class="tt-quitar" onclick="TareasTexto.quitar(${i})" aria-label="Sacar esta tarea">×</button>
      </div>
      <div class="tt-campos">
        <label class="tt-campo"><span>${esc(diaCorto(t.fecha))}</span><input type="date" value="${esc(t.fecha)}" onchange="TareasTexto.set(${i},'fecha',this.value,true)" /></label>
        <select class="tt-campo" onchange="TareasTexto.set(${i},'turno',this.value)" aria-label="Turno">
          ${DB.TURNOS.map(x => `<option value="${x}" ${t.turno === x ? 'selected' : ''}>${x || 'Sin turno'}</option>`).join('')}
        </select>
        <input class="tt-campo" type="time" value="${esc(t.recordarHora)}" onchange="TareasTexto.set(${i},'recordarHora',this.value)" aria-label="Avisar a las" />
        ${vend ? '' : `<select class="tt-campo tt-quien" onchange="TareasTexto.set(${i},'responsable',this.value)" aria-label="Quién">
          ${[...DB.RESPONSABLES, { id: 'equipo', corto: 'Equipo' }].map(r => `<option value="${r.id}" ${t.responsable === r.id ? 'selected' : ''}>${esc(r.corto)}</option>`).join('')}
        </select>`}
        <select class="tt-campo tt-prio-${t.prioridad}" onchange="TareasTexto.set(${i},'prioridad',this.value,true)" aria-label="Prioridad">
          ${DB.PRIORIDADES_TAREA.map(p => `<option ${t.prioridad === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        ${t.vinculoId ? `<span class="tt-vinculo" title="Queda vinculada">${t.vinculoTipo === 'cliente' ? 'Cliente' : 'Prospecto'}: ${esc(t.vinculoNombre)}
          <button onclick="TareasTexto.set(${i},'vinculoId','',true)" aria-label="Desvincular">×</button></span>` : ''}
        ${t.objetivo ? `<span class="tt-vinculo">Contador: ${t.objetivo} ${esc(t.unidad)}</span>` : ''}
      </div>
    </div>`;
  }

  function bloque() {
    const n = items.length;
    return `<section class="tt-box" id="ttBox">
      <div class="tt-head">
        <strong>Escribí las tareas</strong>
        <span>Una por línea, como en un chat. El día, la hora, quién y el prospecto los saca solo.</span>
      </div>
      <textarea id="ttTexto" rows="3" placeholder="Martina: llamar a Ulicar el viernes a las 17&#10;mañana a la tarde Mateo y Santi visitan Haedo&#10;urgente mandar 15 mensajes de recontacto"
        oninput="TareasTexto.escribir(this.value)" onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();TareasTexto.revisar();}">${esc(texto)}</textarea>
      <div class="tt-acciones">
        <button class="btn-primary" onclick="TareasTexto.revisar()">Ordenar tareas</button>
        ${texto || n ? `<button class="btn-ghost" onclick="TareasTexto.limpiar()">Borrar todo</button>` : ''}
      </div>
      ${n ? `<div class="tt-lista">
        <div class="tt-lista-head">Así las entendí. Corregí lo que haga falta y guardalas.</div>
        ${items.map(fila).join('')}
        <button class="btn-primary tt-guardar" onclick="TareasTexto.guardar()">Guardar ${n} tarea${n > 1 ? 's' : ''}</button>
      </div>` : ''}
    </section>`;
  }

  function redibujar() {
    const box = document.getElementById('ttBox');
    if (!box) return;
    const foco = document.activeElement && document.activeElement.id === 'ttTexto';
    box.outerHTML = bloque();
    if (foco) { const ta = document.getElementById('ttTexto'); if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; } }
  }

  window.TareasTexto = {
    interpretar,
    bloque,
    escribir(v) {
      texto = v;
      try { localStorage.setItem(LS, v); } catch (e) { /* sin almacenamiento: queda en memoria */ }
    },
    revisar() {
      const ta = document.getElementById('ttTexto');
      if (ta) this.escribir(ta.value);
      if (!texto.trim()) { toast('Escribí al menos una tarea', 'err'); return; }
      items = interpretar(texto, { yo: yo(), esVendedor: esVendedor() });
      if (!items.length) toast('No encontré tareas: escribí qué hay que hacer, no sólo el día', 'err');
      redibujar();
    },
    set(i, campo, valor, redibuja) {
      if (!items[i]) return;
      items[i][campo] = valor;
      if (campo === 'vinculoId' && !valor) { items[i].vinculoTipo = ''; items[i].vinculoNombre = ''; }
      if (campo === 'recordarHora' && valor && !items[i].turno) items[i].turno = +valor.slice(0, 2) < 13 ? 'Mañana' : 'Tarde';
      if (redibuja) redibujar();
    },
    quitar(i) { items.splice(i, 1); redibujar(); },
    limpiar() { items = []; this.escribir(''); redibujar(); },
    guardar() {
      const validas = items.filter(t => String(t.titulo || '').trim());
      if (!validas.length) { toast('No hay tareas para guardar', 'err'); return; }
      validas.forEach(t => {
        const d = Object.assign({}, t, { titulo: t.titulo.trim() });
        delete d.vinculoNombre;
        if (esVendedor()) d.responsable = yo();
        DB.crearTarea(d);
      });
      toast(`${validas.length} tarea${validas.length > 1 ? 's' : ''} guardada${validas.length > 1 ? 's' : ''}`, 'ok');
      items = []; this.escribir('');
      refrescar();
    },
  };
})();
