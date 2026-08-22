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
  function pendientes(usuarioId, ahora) {
    const cfg = DB.getAjustes(usuarioId);
    if (!cfg.avisos) return [];
    const hoy = Sistema.hoy();
    const t = hhmm(ahora);
    const out = [];
    const agenda = Sistema.agendaDe(usuarioId, hoy);
    const mias = agenda.deHoy;
    const faltan = mias.filter(x => !Sistema.esHecha(x));
    const hechas = mias.length - faltan.length;

    const push = (clave, titulo, cuerpo) => {
      const k = `${hoy}:${usuarioId}:${clave}`;
      if (yaAvisado(k)) return;
      out.push({ clave: k, titulo, cuerpo });
    };

    if (cfg.manana && t >= cfg.manana && mias.length) {
      const conts = Sistema.contadores(usuarioId, Sistema.rango('hoy'))
        .map(c => `${c.objetivo} ${c.corto || c.unidad}`).join(' · ');
      push('manana', `Buen día. Tenés ${mias.length} tareas hoy`, conts || 'Abrí el CRM para ver el detalle');
    }
    if (cfg.tarde && t >= cfg.tarde && faltan.length) {
      push('tarde', `Te faltan ${faltan.length} de ${mias.length}`,
        faltan.slice(0, 2).map(x => x.titulo).join(' · ') + (faltan.length > 2 ? ` y ${faltan.length - 2} más` : ''));
    }
    if (cfg.cierre && t >= cfg.cierre) {
      if (faltan.length) push('cierre', `Cierre del día: ${hechas} de ${mias.length}`, 'Marcá lo que hiciste antes de que termine el día');
      else if (mias.length) push('cierre', '¡Día cerrado!', `${mias.length} de ${mias.length}. Mañana arrancamos de nuevo.`);
    }
    if (cfg.avisarTareas) {
      // Recordatorios propios de cada tarea (los de las rutinas se heredan de la rutina).
      const conHora = agenda.deHoy.concat(agenda.vencidas)
        .filter(x => x.recordarHora && !Sistema.esHecha(x) && x.recordarHora <= t);
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
