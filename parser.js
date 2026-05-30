/* ============================================================
   TNR · Parser local (sin IA)
   Interpreta texto libre y extrae campos del prospecto mediante
   reglas, diccionarios y expresiones regulares. Funciona offline.
   ============================================================ */
(function () {
  'use strict';

  // Diccionario de rubros (palabra clave -> rubro normalizado)
  const RUBROS = {
    'inmobiliaria': 'Inmobiliaria', 'inmobiliario': 'Inmobiliaria', 'propiedades': 'Inmobiliaria',
    'contable': 'Contadores', 'contador': 'Contadores', 'contadora': 'Contadores', 'estudio contable': 'Contadores',
    'abogado': 'Abogados', 'abogada': 'Abogados', 'jurídico': 'Abogados', 'juridico': 'Abogados', 'estudio jurídico': 'Abogados',
    'gimnasio': 'Gimnasio', 'gym': 'Gimnasio', 'crossfit': 'Gimnasio',
    'restaurante': 'Gastronomía', 'restó': 'Gastronomía', 'resto': 'Gastronomía', 'parrilla': 'Gastronomía', 'cafetería': 'Gastronomía', 'cafeteria': 'Gastronomía', 'bar': 'Gastronomía', 'pizzería': 'Gastronomía', 'pizzeria': 'Gastronomía',
    'peluquería': 'Estética', 'peluqueria': 'Estética', 'barbería': 'Estética', 'barberia': 'Estética', 'estética': 'Estética', 'estetica': 'Estética', 'spa': 'Estética', 'uñas': 'Estética',
    'odontólogo': 'Salud', 'odontologo': 'Salud', 'dentista': 'Salud', 'médico': 'Salud', 'medico': 'Salud', 'clínica': 'Salud', 'clinica': 'Salud', 'kinesiólogo': 'Salud', 'nutricionista': 'Salud', 'consultorio': 'Salud',
    'ferretería': 'Comercio', 'ferreteria': 'Comercio', 'kiosco': 'Comercio', 'almacén': 'Comercio', 'almacen': 'Comercio', 'tienda': 'Comercio', 'local': 'Comercio', 'comercio': 'Comercio', 'indumentaria': 'Comercio', 'ropa': 'Comercio',
    'veterinaria': 'Veterinaria', 'veterinario': 'Veterinaria',
    'constructora': 'Construcción', 'construcción': 'Construcción', 'construccion': 'Construcción', 'arquitecto': 'Construcción',
    'taller': 'Automotor', 'mecánico': 'Automotor', 'mecanico': 'Automotor', 'automotor': 'Automotor', 'lavadero': 'Automotor',
    'escuela': 'Educación', 'instituto': 'Educación', 'academia': 'Educación', 'jardín': 'Educación',
  };

  // Ciudades del oeste del GBA (y provincia inferida)
  const CIUDADES = ['Morón', 'Moron', 'Castelar', 'Ituzaingó', 'Ituzaingo', 'Haedo', 'El Palomar', 'Hurlingham', 'Ramos Mejía', 'Ramos Mejia', 'San Justo', 'Merlo', 'Padua', 'Libertad', 'Paso del Rey', 'Moreno', 'Caseros', 'Ciudadela', 'Villa Tesei', 'Palomar'];

  // Métodos de contacto
  const METODOS = {
    'llamé': 'Cold Call', 'llame': 'Cold Call', 'llamada': 'Cold Call', 'cold call': 'Cold Call', 'lo llamé': 'Cold Call', 'la llamé': 'Cold Call', 'teléfono': 'Cold Call', 'telefono': 'Cold Call',
    'whatsapp': 'WhatsApp', 'wpp': 'WhatsApp', 'wsp': 'WhatsApp', 'mensaje de whatsapp': 'WhatsApp',
    'instagram': 'Instagram', 'ig': 'Instagram', 'insta': 'Instagram', 'dm': 'Instagram',
    'linkedin': 'LinkedIn',
    'referido': 'Referido', 'me lo recomendó': 'Referido', 'recomendado': 'Referido',
    'networking': 'Networking', 'evento': 'Networking',
    'email': 'Email', 'mail': 'Email', 'correo': 'Email',
  };

  const DIAS = { 'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3, 'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6, 'domingo': 0 };

  function lower(s) { return (s || '').toLowerCase(); }

  // Suma días a hoy y devuelve ISO date (yyyy-mm-dd)
  function fechaEnDias(dias) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  // Próximo día de semana (1=lunes ... 0=domingo)
  function proximoDiaSemana(target) {
    const d = new Date();
    const cur = d.getDay();
    let diff = (target - cur + 7) % 7;
    if (diff === 0) diff = 7; // siempre el próximo
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  function parse(texto) {
    const out = {};
    const t = ' ' + texto.trim() + ' ';
    const low = lower(t);

    /* --- Email --- */
    const email = t.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (email) out.email = email[0];

    /* --- Instagram --- */
    const ig = t.match(/@([a-zA-Z0-9._]{3,30})/);
    if (ig && !email) out.instagram = '@' + ig[1];
    else if (ig && email && ig[0] !== '@' + email[0].split('@')[0]) {
      // evitar confundir el handle con el local-part del email
      if (low.indexOf('instagram') > -1 || low.indexOf(' ig ') > -1 || low.indexOf('insta') > -1) out.instagram = '@' + ig[1];
    }

    /* --- Teléfono / WhatsApp --- */
    const tel = t.match(/(?:\+?54\s?)?(?:11|15|220|237)?[\s-]?\d{4}[\s-]?\d{4}/);
    if (tel) {
      const num = tel[0].trim();
      if (low.indexOf('whatsapp') > -1 || low.indexOf('wpp') > -1 || low.indexOf('wsp') > -1) out.whatsapp = num;
      else out.telefono = num;
    }

    /* --- Sitio web --- */
    const web = t.match(/\b((?:https?:\/\/)?[a-z0-9-]+\.(?:com|ar|net|org)(?:\.[a-z]{2})?(?:\/\S*)?)/i);
    if (web && !email) out.sitioWeb = web[1];

    /* --- Rubro --- */
    for (const k in RUBROS) {
      if (low.indexOf(k) > -1) { out.rubro = RUBROS[k]; break; }
    }

    /* --- Ciudad --- */
    for (const c of CIUDADES) {
      const re = new RegExp('\\b' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if (re.test(t)) {
        out.ciudad = c.replace('Moron', 'Morón').replace('Ituzaingo', 'Ituzaingó').replace('Ramos Mejia', 'Ramos Mejía');
        out.provincia = 'Buenos Aires';
        break;
      }
    }

    /* --- Método de contacto --- */
    for (const k in METODOS) {
      if (low.indexOf(k) > -1) { out.metodoContacto = METODOS[k]; break; }
    }

    /* --- Estado --- */
    if (/\bno (me )?(respond|contest|atend)/.test(low)) out.estado = 'Contactado';
    else if (/(me )?atendió|atendio|respondió|respondio|contestó|contesto|hablé con|hable con/.test(low)) out.estado = 'Respondió';
    if (/interesad[oa]|le interesa|quiere (que|una|un)|está interesad/.test(low)) out.estado = 'Interesado';
    if (/reunión|reunion|me reúno|me reuno|cita agendada|agendé|agende/.test(low)) out.estado = 'Reunión Agendada';
    if (/propuesta enviada|envié propuesta|envie propuesta/.test(low)) out.estado = 'Propuesta Enviada';
    if (/demo enviada|envié demo|envie demo|le mandé la demo/.test(low)) out.estado = 'Demo Enviada';
    if (/recontactar|volver a contactar|contactar de nuevo|contactar nuevamente/.test(low)) out.estado = 'Recontactar';
    if (/cerramos|cerrado|ganado|firmó|firmo|aceptó la propuesta|acepto la propuesta/.test(low)) out.estado = 'Ganado';
    if (/no le interesa|perdido|no quiere|descartar/.test(low)) out.estado = 'Perdido';

    /* --- Fecha de seguimiento --- */
    // "en X días/semanas"
    let m = low.match(/(?:dentro de|en)\s+(\d+)\s+d[ií]as?/);
    if (m) out.fechaSeguimiento = fechaEnDias(parseInt(m[1], 10));
    m = low.match(/(?:dentro de|en)\s+(\d+)\s+semanas?/);
    if (m) out.fechaSeguimiento = fechaEnDias(parseInt(m[1], 10) * 7);
    if (/\bmañana\b/.test(low)) out.fechaSeguimiento = fechaEnDias(1);
    if (/pasado mañana/.test(low)) out.fechaSeguimiento = fechaEnDias(2);
    if (/la semana que viene|próxima semana|proxima semana/.test(low)) out.fechaSeguimiento = fechaEnDias(7);
    // día de la semana nombrado
    for (const dia in DIAS) {
      if (new RegExp('\\b' + dia + '\\b').test(low)) { out.fechaSeguimiento = proximoDiaSemana(DIAS[dia]); break; }
    }

    /* --- Próxima acción --- */
    let pa = low.match(/(?:recontactar|contactar|llamar|escribir|reunir|enviar|mandar)[^.,;]*/);
    if (pa) out.proximaAccion = capitalizar(pa[0].trim());
    else if (out.estado === 'Recontactar') out.proximaAccion = 'Recontactar';

    /* --- Nombre y empresa (heurística) --- */
    extraerNombreEmpresa(texto, out, low);

    /* --- Observaciones: el texto completo siempre --- */
    out.observaciones = texto.trim();

    return out;
  }

  // Heurística para nombre de persona y empresa
  function extraerNombreEmpresa(texto, out, low) {
    // "dueño de X", "dueña de una X", "de la empresa X"
    let m = texto.match(/due[ñn][oa]\s+de\s+(?:una?\s+|la\s+|el\s+)?([^.,;]+?)(?:\s+en\b|[.,;]|$)/i);
    if (m) out.empresa = limpiarEmpresa(m[1]);

    // Nombre propio al inicio: "Juan Pérez, ..." o "Juan Pérez dueño..."
    const ini = texto.trim().match(/^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,2})/);
    if (ini) {
      const cand = ini[1].trim();
      // Si parece nombre de persona (2 palabras) lo tomamos como nombre
      const palabras = cand.split(/\s+/);
      if (palabras.length >= 2 && palabras.length <= 3 && !esPalabraEmpresa(cand)) {
        out.nombre = cand;
      } else if (!out.empresa) {
        out.empresa = cand;
      }
    }

    // "Estudio Contable ABC", "Inmobiliaria X" como empresa si arranca con sustantivo de rubro
    if (!out.empresa) {
      const emp = texto.match(/\b(Inmobiliaria|Estudio|Gimnasio|Clínica|Clinica|Consultorio|Restaurante|Veterinaria|Ferretería|Ferreteria|Taller|Constructora|Peluquería|Peluqueria|Barbería|Barberia|Academia|Instituto)\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]*(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]*)?/);
      if (emp) out.empresa = emp[0].trim();
    }

    // Si tenemos empresa pero no nombre, dejar nombre vacío (se completa manual)
    if (!out.nombre && out.empresa) out.nombre = out.empresa;
    if (!out.nombre && !out.empresa) {
      // fallback: primeras 2 palabras capitalizadas
      if (ini) out.nombre = ini[1].trim();
    }
  }

  function esPalabraEmpresa(s) {
    return /^(Inmobiliaria|Estudio|Gimnasio|Clínica|Consultorio|Restaurante|Veterinaria|Ferretería|Taller|Constructora|Academia|Instituto)/i.test(s);
  }
  function limpiarEmpresa(s) {
    return capitalizar(s.replace(/^(una?|el|la|los|las)\s+/i, '').trim());
  }
  function capitalizar(s) {
    s = s.trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  window.Parser = { parse };
})();
