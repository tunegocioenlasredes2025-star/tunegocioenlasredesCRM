/* ============================================================
   TNR · Login
   ------------------------------------------------------------
   Autenticación de verdad, con Supabase Auth.

   QUÉ SIGNIFICA "DE VERDAD" ACÁ:
   - Las contraseñas NO están en este código, ni en el repo, ni en el
     navegador. Viven hasheadas dentro de Supabase, que es quien las
     valida. Este archivo sólo pregunta "¿es correcta?" y recibe sí o no.
   - Lo que queda guardado en el celular es un token que vence solo y se
     puede revocar desde Supabase. No es la contraseña.
   - El cliente de Supabase se crea UNA sola vez acá y lo comparte data.js.
     Es a propósito: así todas las consultas al CRM viajan firmadas con la
     sesión del usuario, y el día que se cierre la base (auth-setup.sql)
     todo sigue funcionando sin tocar una línea.

   Los mails de cada uno se configuran en config.js (window.TNR_USUARIOS).
   Ahí no hay ningún secreto: es sólo "qué mail corresponde a qué persona".
   ============================================================ */
(function () {
  'use strict';

  let client = null;
  let sesion = null;
  let perfil = null;

  function crearCliente() {
    if (client) return client;
    try {
      if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient) {
        client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
          realtime: { params: { eventsPerSecond: 5 } },
          auth: { persistSession: true, autoRefreshToken: true, storageKey: 'tnr-auth' },
        });
      }
    } catch (e) { console.error('No se pudo crear el cliente de Supabase', e); }
    return client;
  }

  // Traduce el mail de la sesión a la persona del equipo.
  function perfilDe(user) {
    if (!user) return null;
    const mail = String(user.email || '').toLowerCase();
    const mapa = window.TNR_USUARIOS || {};
    const encontrado = mapa[mail];
    if (encontrado) return { ...encontrado, email: mail };
    // Alguien logueado que no está en el mapa: entra, pero como "equipo".
    // Mejor eso que dejarlo afuera por un mail mal escrito en la config.
    const local = mail.split('@')[0] || 'usuario';
    return { id: local.replace(/[^a-z0-9]/g, '') || 'usuario', nombre: local, email: mail };
  }

  async function init() {
    if (!crearCliente()) return null;
    try {
      const { data } = await client.auth.getSession();
      sesion = data && data.session ? data.session : null;
      perfil = sesion ? perfilDe(sesion.user) : null;
      client.auth.onAuthStateChange((evento, s) => {
        sesion = s || null;
        perfil = sesion ? perfilDe(sesion.user) : null;
        if (evento === 'SIGNED_OUT') location.reload();
      });
    } catch (e) { console.error('No se pudo leer la sesión', e); }
    return sesion;
  }

  async function entrar(email, password) {
    if (!crearCliente()) throw new Error('sin-cliente');
    const { data, error } = await client.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password });
    if (error) throw error;
    sesion = data.session; perfil = perfilDe(data.user);
    return perfil;
  }

  async function salir() {
    if (!client) return;
    try { await client.auth.signOut(); } catch (e) { console.warn(e); }
    try { localStorage.removeItem('tnr_crm_v1'); } catch (e) {}
    location.reload();
  }

  /* ---------- Traducción de los errores de Supabase a castellano ---------- */
  function mensajeError(e) {
    const m = String((e && (e.message || e.error_description)) || '').toLowerCase();
    if (m.includes('invalid login')) return 'Mail o contraseña incorrectos.';
    if (m.includes('email not confirmed')) return 'El usuario existe pero está sin confirmar. En Supabase → Authentication → Users, abrilo y confirmalo.';
    if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.';
    if (m.includes('failed to fetch') || m.includes('network')) return 'Sin internet o Supabase no responde. Fijate la conexión.';
    if (m.includes('sin-cliente')) return 'No cargó la librería de Supabase. Recargá la página.';
    return 'No se pudo entrar. ' + ((e && e.message) || '');
  }

  /* ---------- Pantalla de login ---------- */
  function mostrarLogin(alEntrar) {
    const cont = document.getElementById('login');
    const app = document.getElementById('app');
    if (!cont) return;
    app.hidden = true;
    cont.hidden = false;
    cont.innerHTML = `
      <form class="login-card" id="loginForm" autocomplete="on">
        <div class="login-brand">
          <img src="logo.png" alt="Tu Negocio En Las Redes" onerror="this.onerror=null;this.src='logo.svg'" />
          <div>
            <strong>Tu Negocio En Las Redes</strong>
            <span>Sistema Operativo</span>
          </div>
        </div>
        <label class="field">
          <span>Mail</span>
          <input type="email" name="email" id="loginEmail" required autocomplete="username"
                 inputmode="email" autocapitalize="off" spellcheck="false" placeholder="tu@tunegocioenlasredes.com.ar" />
        </label>
        <label class="field">
          <span>Contraseña</span>
          <input type="password" name="password" id="loginPass" required autocomplete="current-password" placeholder="••••••••" />
        </label>
        <div class="login-error" id="loginError" hidden></div>
        <button class="btn-primary login-btn" type="submit" id="loginBtn">Entrar</button>
        <p class="login-foot">Cada uno entra con su cuenta. Las tareas y el cumplimiento se miden por persona.<br />
          <span class="login-hint">¿Primera vez? Los usuarios se crean en Supabase → Authentication → Users → Add user,
          con “Auto Confirm User” tildado. Ver <strong>PASOS-INSTALACION.md</strong>.</span></p>
      </form>`;

    const form = document.getElementById('loginForm');
    const err = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      err.hidden = true;
      btn.disabled = true; btn.textContent = 'Entrando…';
      try {
        const p = await entrar(document.getElementById('loginEmail').value, document.getElementById('loginPass').value);
        cont.hidden = true; app.hidden = false; cont.innerHTML = '';
        if (typeof alEntrar === 'function') alEntrar(p);
      } catch (e) {
        err.textContent = mensajeError(e); err.hidden = false;
        btn.disabled = false; btn.textContent = 'Entrar';
        document.getElementById('loginPass').value = '';
      }
    };
    setTimeout(() => { const i = document.getElementById('loginEmail'); if (i) i.focus(); }, 60);
  }

  window.Auth = {
    init, entrar, salir, mostrarLogin, mensajeError,
    get client() { return client || crearCliente(); },
    get sesion() { return sesion; },
    get perfil() { return perfil; },
    get usuarioId() { return perfil ? perfil.id : ''; },
    get nombre() { return perfil ? perfil.nombre : ''; },
  };
})();
