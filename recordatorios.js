/* ============================================================
   TNR · Recordatorios
   ------------------------------------------------------------
   Hay DOS caminos para que suene el aviso, y conviene entender la
   diferencia porque no son intercambiables:

   1) ACÁ (este archivo) — avisos mientras la app está abierta o en
      segundo plano. El navegador revisa cada minuto si llegó la hora
      de algo y muestra la notificación. Es instantáneo y no depende
      de nada más, pero si el celular tiene la app cerrada del todo,
      no suena.

   2) EL SERVIDOR (supabase/functions/notify) — el push de verdad, el
      que llega con la app cerrada. Es el mismo camino por el que hoy
      llega el aviso de las 9. Lee los mismos horarios que se
      configuran acá, por eso los ajustes se guardan en la nube.

   Los dos usan la MISMA clave de deduplicación (fecha + usuario +
   evento), así que si suenan los dos, igual se ve un solo aviso por
   evento y por día.
   ============================================================ */
(function () {
  'use strict';

  const LS = 'tnr_avisos_enviados';
  let handle = null;

  function hhmm(d) {
    d = d || new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* ---------- Memoria de lo ya avisado (para no repetir) ---------- */
  function enviados() {
    try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; }
  }
  function marcarEnviado(clave) {
    const e = enviados();
    e[clave] = 1;
    // Se limpia todo lo que no sea de hoy: si no, el registro crece para siempre.
    const hoy = Sistema.hoy();
    Object.keys(e).forEach(k => { if (!k.startsWith(hoy)) delete e[k]; });
    localStorage.setItem(LS, JSON.stringify(e));
  }
  const yaAvisado = (clave) => !!enviados()[clave];

  /* ---------- Qué avisos corresponden en este momento ----------
     Devuelve sólo los que ya pasaron de hora y todavía no se avisaron.
     Si el celular estuvo apagado a las 9, el aviso aparece igual cuando
     se abre la app — tarde, pero aparece. Salvo que ya sea otro día. */
  // Cuánto tiempo después de la hora sigue teniendo sentido avisar. Si el
  // celular estuvo apagado toda la tarde, a la noche no sirve que lleguen
  // seis avisos juntos: el momento ya pasó.
  const TOLERANCIA_MIN = 180;

  function pendientes(usuarioId, ahora) {
    const cfg = DB.getAjustes(usuarioId);
    if (!cfg.avisos) return [];
    const hoy = Sistema.hoy();
    const t = hhmm(ahora);
    const min = (x) => Sistema.aMin(x);
    // Ya pasó la hora, pero no hace tanto como para que el aviso sea inútil.
    const enVentana = (hora) => {
      const h = min(hora), n = min(t);
      return h != null && n != null && h <= n && n - h <= TOLERANCIA_MIN;
    };
    const out = [];
    // TNR y lo personal se cuentan por separado, igual que en la pantalla.
    const tnr = Sistema.agendaDe(usuarioId, hoy, 'tnr').deHoy;
    const pers = Sistema.agendaDe(usuarioId, hoy, 'personal').deHoy;
    const faltanT = tnr.filter(x => !Sistema.esHecha(x));
    const faltanP = pers.filter(x => !Sistema.esHecha(x));
    const hechasT = tnr.length - faltanT.length;

    const push = (clave, titulo, cuerpo) => {
      const k = `${hoy}:${usuarioId}:${clave}`;
      if (yaAvisado(k)) return;
      out.push({ clave: k, titulo, cuerpo });
    };

    if (cfg.manana && enVentana(cfg.manana) && (tnr.length || pers.length)) {
      const conts = Sistema.contadores(usuarioId, Sistema.rango('hoy'), 'tnr')
        .map(c => `${c.objetivo} ${c.corto || c.unidad}`).join(' · ');
      const cuerpo = [conts, pers.length ? `+ ${pers.length} personales` : ''].filter(Boolean).join(' · ');
      push('manana', `Buen día. Tenés ${tnr.length} de TNR hoy`, cuerpo || 'Abrí el CRM para ver el detalle');
    }
    if (cfg.tarde && enVentana(cfg.tarde) && faltanT.length) {
      push('tarde', `Te faltan ${faltanT.length} de ${tnr.length}`,
        faltanT.slice(0, 2).map(x => x.titulo).join(' · ') + (faltanT.length > 2 ? ` y ${faltanT.length - 2} más` : ''));
    }
    if (cfg.cierre && enVentana(cfg.cierre)) {
      const cola = faltanP.length ? ` · te quedan ${faltanP.length} personales` : '';
      if (faltanT.length) push('cierre', `Cierre del día: ${hechasT} de ${tnr.length} de TNR`, 'Marcá lo que hiciste' + cola);
      else if (tnr.length) push('cierre', '¡TNR cerrado!', `${tnr.length} de ${tnr.length}${cola || '. Mañana arrancamos de nuevo.'}`);
    }
    if (cfg.avisarTareas) {
      // Recordatorios propios de cada tarea (los de las rutinas se heredan de la rutina).
      const conHora = tnr.concat(pers)
        .filter(x => x.recordarHora && !Sistema.esHecha(x) && enVentana(x.recordarHora));
      conHora.forEach(x => push('tk:' + x.id, x.titulo,
        (+x.objetivo ? `${x.avance || 0} de ${x.objetivo} ${DB.unidadCorta(x.unidad)}` : 'Te lo recordás para ahora')));
    }
    return out;
  }

  /* ---------- Mostrar ---------- */
  function mostrar(av) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const opts = { body: av.cuerpo, icon: 'favicon.png', badge: 'favicon.png', tag: av.clave, vibrate: [70, 40, 70] };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready
        .then(reg => reg.showNotification(av.titulo, opts))
        .catch(() => { try { new Notification(av.titulo, opts); } catch (_) {} });
    } else {
      try { new Notification(av.titulo, opts); } catch (_) { return false; }
    }
    return true;
  }

  function revisar() {
    if (!window.DB || !window.Sistema || !window.Auth) return;
    const uid = Auth.usuarioId;
    if (!uid) return;
    pendientes(uid, new Date()).forEach(av => { if (mostrar(av)) marcarEnviado(av.clave); });
  }

  function arrancar() {
    if (handle) clearInterval(handle);
    revisar();
    handle = setInterval(revisar, 60000); // una vuelta por minuto: suficiente y no gasta batería
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisar(); });
  }

  /* ---------- Permiso del navegador ---------- */
  async function pedirPermiso() {
    if (!('Notification' in window)) return { ok: false, motivo: 'Este navegador no soporta notificaciones.' };
    let p = Notification.permission;
    if (p === 'default') p = await Notification.requestPermission();
    if (p !== 'granted') return { ok: false, motivo: 'No diste permiso. Se activa desde el candado de la barra de direcciones.' };

    // Push remoto (el que llega con la app cerrada). Necesita la VAPID y el service worker.
    let push = false;
    if (window.VAPID_PUBLIC && navigator.serviceWorker && 'PushManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(window.VAPID_PUBLIC) });
        push = await DB.guardarPushSub(sub.toJSON());
      } catch (e) { console.warn('No se pudo suscribir al push', e); }
    }
    return { ok: true, push };
  }
  function b64ToU8(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const base = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base);
    return Uint8Array.from(Array.prototype.map.call(raw, c => c.charCodeAt(0)));
  }
  function estadoPermiso() {
    if (!('Notification' in window)) return 'no-soportado';
    return Notification.permission; // 'granted' | 'denied' | 'default'
  }

  window.Recordatorios = { arrancar, revisar, pendientes, pedirPermiso, estadoPermiso, hhmm };
})();
