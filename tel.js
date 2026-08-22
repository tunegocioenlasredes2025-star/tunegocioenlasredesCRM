/* ============================================================
   TNR · Normalización de teléfonos a E.164 (Argentina)
   ------------------------------------------------------------
   Para abrir un wa.me alcanzaba con sacarle los guiones al número.
   Para mandar por API no: el proveedor rechaza cualquier cosa que
   no sea E.164 exacto, y un número mal armado se cobra igual que
   uno bueno. Este módulo es la única fuente de verdad del formato.

   Devuelve SIEMPRE un diagnóstico, nunca lanza. Lo que no se puede
   normalizar con certeza se marca y queda fuera de las campañas.
   ============================================================ */
(function () {
  'use strict';

  // Códigos de área de 3 dígitos. El 11 (CABA/GBA) es de 2 y todo
  // lo que no esté acá se asume de 4. El número nacional siempre
  // termina teniendo 10 dígitos: área + abonado.
  const AREAS_3 = new Set([
    '220','221','223','230','236','237','249','260','261','263','264','266',
    '280','291','297','299','336','341','342','343','345','348','351','353',
    '358','362','364','370','376','379','380','381','383','385','387','388',
  ]);

  const MOTIVOS = {
    VACIO:        'Sin teléfono cargado',
    SIN_DIGITOS:  'El campo no tiene números',
    CORTO:        'Faltan dígitos',
    LARGO:        'Tiene dígitos de más',
    EXTRANJERO:   'No es un número argentino',
    REPETIDO:     'Dígitos repetidos o de relleno',
    AREA_ASUMIDA: 'Sin código de área: se asumió 11',
  };

  // Saca los dígitos, entendiendo que el campo puede traer un link
  // (wa.me/549…, api.whatsapp.com/send?phone=…) en vez de un número.
  function soloDigitos(valor) {
    let s = String(valor == null ? '' : valor).trim();
    if (!s) return '';
    const link = s.match(/(?:wa\.me|wa\.link|whatsapp\.com\/send|phone=)[/?=]*(\+?\d[\d\s\-().]*)/i);
    if (link) s = link[1];
    // Un link acortado (linktr.ee, bit.ly) no contiene el número: no hay nada que sacar.
    else if (/^https?:\/\//i.test(s) || /(linktr\.ee|taplink|bit\.ly|goo\.su)/i.test(s)) return '';
    return s.replace(/\D/g, '');
  }

  // Le saca al número nacional el prefijo 15 de celular, que va
  // después del código de área y no existe en formato internacional.
  function quitar15(n) {
    const largo = n.startsWith('11') ? 2 : (AREAS_3.has(n.slice(0, 3)) ? 3 : 4);
    if (n.length === 12 && n.slice(largo, largo + 2) === '15') {
      return n.slice(0, largo) + n.slice(largo + 2);
    }
    return n;
  }

  function esRelleno(nsn) {
    const abonado = nsn.slice(-8);
    if (/^(\d)\1{7}$/.test(abonado)) return true;          // 44444444
    if (abonado === '12345678' || abonado === '00000000') return true;
    return false;
  }

  /* Normaliza un valor a E.164 para WhatsApp Argentina (54 9 + 10 dígitos).
     → { ok, e164, nsn, area, motivo, asumido, original } */
  function normalizar(valor) {
    const original = String(valor == null ? '' : valor).trim();
    const res = { ok: false, e164: '', nsn: '', area: '', motivo: '', asumido: '', original };

    if (!original) { res.motivo = MOTIVOS.VACIO; return res; }

    let d = soloDigitos(original);
    if (!d) { res.motivo = MOTIVOS.SIN_DIGITOS; return res; }

    if (d.startsWith('00')) d = d.slice(2);

    // Código de país. Si no viene, se asume Argentina.
    let conPais = false;
    if (d.startsWith('54')) {
      conPais = true;
      d = d.slice(2);
      if (d.startsWith('9')) d = d.slice(1); // el 9 de celular lo volvemos a poner al final
    }

    // El orden importa: primero el 0 interurbano, después el 15 de celular.
    // Un "011 15-6488-7925" tiene 13 dígitos y sólo queda en 10 si se sacan
    // los dos, en ese orden. Recién ahí tiene sentido medir el largo.
    d = d.replace(/^0+/, '');
    d = quitar15(d);

    // "15 6488 7925" guardado sin código de área: en la base de TNR
    // eso es Zona Oeste, pero es una suposición y queda marcada.
    if (d.length === 10 && d.startsWith('15')) {
      d = '11' + d.slice(2);
      res.asumido = MOTIVOS.AREA_ASUMIDA;
    }

    if (d.length < 10) { res.motivo = MOTIVOS.CORTO; return res; }
    if (d.length > 10) { res.motivo = conPais ? MOTIVOS.LARGO : MOTIVOS.EXTRANJERO; return res; }
    if (esRelleno(d))  { res.motivo = MOTIVOS.REPETIDO; return res; }

    res.area = d.startsWith('11') ? '11' : (AREAS_3.has(d.slice(0, 3)) ? d.slice(0, 3) : d.slice(0, 4));
    res.nsn = d;
    res.e164 = '549' + d;
    res.ok = true;
    return res;
  }

  function esValido(valor) { return normalizar(valor).ok; }

  // 5491164887925 → +54 9 11 6488-7925
  function formatear(e164) {
    const r = normalizar(e164);
    if (!r.ok) return String(e164 || '');
    const ab = r.nsn.slice(r.area.length);
    return `+54 9 ${r.area} ${ab.slice(0, ab.length - 4)}-${ab.slice(-4)}`;
  }

  // El número a usar para un prospecto: primero el campo whatsapp, y si
  // no sirve, el teléfono. Devuelve el diagnóstico del que haya ganado.
  function deProspecto(p) {
    p = p || {};
    const wa = normalizar(p.whatsapp);
    if (wa.ok) { wa.campo = 'whatsapp'; return wa; }
    const tel = normalizar(p.telefono);
    if (tel.ok) { tel.campo = 'telefono'; return tel; }
    // Ninguno sirve: devolvemos el que más información aporte para el reporte.
    const peor = (p.whatsapp ? wa : tel);
    peor.campo = p.whatsapp ? 'whatsapp' : 'telefono';
    return peor;
  }

  window.TEL = { normalizar, esValido, formatear, deProspecto, MOTIVOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.TEL;
})();
