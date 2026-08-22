// ============================================================
// TNR · Edge Function "notify"
// ------------------------------------------------------------
// Es la que manda las notificaciones al celular con la app CERRADA.
//
// La llama pg_cron cada 5 minutos (ver push-setup.sql). En cada vuelta
// mira la hora de Argentina y decide, para cada persona, si le toca
// algún aviso:
//
//   · el de la mañana  -> "tenés 10 tareas hoy: 15 mails, 20 contactos"
//   · el de la tarde   -> "te faltan 4 de 10"
//   · el del cierre    -> "marcá lo que hiciste"
//   · el de una tarea con hora propia
//
// Los horarios NO están acá: los elige cada uno desde el CRM
// (Recordatorios) y se guardan en la tabla `ajustes`.
//
// Para no mandar el mismo aviso dos veces, cada envío deja una marca en
// `notif_log` con la clave fecha:usuario:evento. Si la marca ya existe,
// se saltea. Por eso el cron puede correr cada 5 minutos sin miedo.
//
// - GET ?genkeys=1  -> genera un par de llaves VAPID (correr una sola vez)
// - GET ?debug=1    -> dice qué haría, sin mandar nada
// Deploy: Supabase -> Edge Functions -> "notify" -> pegar este código.
// Secrets necesarios: VAPID_PUBLIC, VAPID_PRIVATE
// ============================================================
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Cuánto para atrás mira cada corrida. Tiene que ser mayor que el intervalo
// del cron: si el cron se atrasa un minuto, el aviso igual sale.
const VENTANA_MIN = 15;

/* ---------- Reloj de Argentina (el servidor vive en UTC) ---------- */
function ahoraAR(): { fecha: string; hhmm: string; minutos: number } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => f.find(p => p.type === t)!.value;
  const hh = g('hour') === '24' ? '00' : g('hour');
  return {
    fecha: `${g('year')}-${g('month')}-${g('day')}`,
    hhmm: `${hh}:${g('minute')}`,
    minutos: (+hh) * 60 + (+g('minute')),
  };
}
const aMinutos = (hhmm: string): number | null => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  return m ? (+m[1]) * 60 + (+m[2]) : null;
};
// ¿La hora configurada cayó dentro de la ventana que estamos mirando?
function toca(hora: string, ahora: number): boolean {
  const h = aMinutos(hora);
  return h !== null && h <= ahora && h > ahora - VENTANA_MIN;
}

const AJUSTES_DEFAULT = { avisos: true, manana: '09:00', tarde: '15:00', cierre: '20:00', avisarTareas: true };

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('genkeys')) return Response.json(webpush.generateVAPIDKeys());
  const debug = !!url.searchParams.get('debug');

  const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC');
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE');
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return Response.json({ error: 'Faltan secrets VAPID_PUBLIC / VAPID_PRIVATE' }, { status: 400 });
  }
  webpush.setVapidDetails('mailto:tunegocioenlasredes2025@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const t = ahoraAR();

  const [tareasQ, ajustesQ, subsQ] = await Promise.all([
    sb.from('tareas').select('data'),
    sb.from('ajustes').select('data'),
    sb.from('push_subs').select('id,data,usuario'),
  ]);

  const tareas = (tareasQ.data || []).map((r: any) => r.data).filter(Boolean);
  const ajustes: Record<string, any> = {};
  for (const r of ajustesQ.data || []) if (r.data?.id) ajustes[r.data.id] = r.data;

  // Aparatos registrados, agrupados por persona. Los que no dicen de quién son
  // (registrados antes del login) reciben sólo el resumen del equipo.
  const porUsuario: Record<string, any[]> = {};
  for (const row of subsQ.data || []) {
    const u = row.usuario || '_sin_dueño';
    (porUsuario[u] ||= []).push(row);
  }

  /* ---------- Qué avisos corresponden para una persona ---------- */
  function avisosDe(usuario: string) {
    const cfg = { ...AJUSTES_DEFAULT, ...(ajustes[usuario] || {}) };
    if (!cfg.avisos) return [];

    // Sus tareas de hoy. Las compartidas ('equipo') cuentan para los dos.
    // TNR y lo personal se cuentan por separado: si se mezclaran, el numero
    // comercial dejaria de significar algo.
    const mias = tareas.filter((x: any) =>
      x.fecha === t.fecha && (x.responsable === usuario || x.responsable === 'equipo'));
    const tnr = mias.filter((x: any) => x.sistema !== 'personal');
    const pers = mias.filter((x: any) => x.sistema === 'personal');
    const faltan = tnr.filter((x: any) => x.estado !== 'Finalizada');
    const faltanP = pers.filter((x: any) => x.estado !== 'Finalizada');
    const hechas = tnr.length - faltan.length;
    const out: { clave: string; titulo: string; cuerpo: string }[] = [];

    if (mias.length && toca(cfg.manana, t.minutos)) {
      // Resumen de volumen: "15 mails · 20 contactos · 25 msj"
      const porUnidad: Record<string, number> = {};
      for (const x of tnr) if (x.unidad && +x.objetivo) porUnidad[x.unidad] = (porUnidad[x.unidad] || 0) + (+x.objetivo);
      const detalle = Object.entries(porUnidad).map(([u, n]) => `${n} ${u}`).join(' · ');
      const cuerpo = [detalle, pers.length ? `+ ${pers.length} personales` : ''].filter(Boolean).join(' · ');
      out.push({ clave: 'manana', titulo: `Buen día. Tenés ${tnr.length} de TNR hoy`, cuerpo: cuerpo || 'Abrí el CRM para ver el detalle' });
    }
    if (faltan.length && toca(cfg.tarde, t.minutos)) {
      out.push({
        clave: 'tarde', titulo: `Te faltan ${faltan.length} de ${tnr.length}`,
        cuerpo: faltan.slice(0, 2).map((x: any) => x.titulo).join(' · ') + (faltan.length > 2 ? ` y ${faltan.length - 2} más` : ''),
      });
    }
    if (mias.length && toca(cfg.cierre, t.minutos)) {
      const cola = faltanP.length ? ` · te quedan ${faltanP.length} personales` : '';
      out.push(faltan.length
        ? { clave: 'cierre', titulo: `Cierre del día: ${hechas} de ${tnr.length} de TNR`, cuerpo: 'Marcá lo que hiciste' + cola }
        : { clave: 'cierre', titulo: '¡TNR cerrado!', cuerpo: `${tnr.length} de ${tnr.length}${cola || '. Mañana arrancamos de nuevo.'}` });
    }
    if (cfg.avisarTareas) {
      for (const x of faltan.concat(faltanP)) {
        if (x.recordarHora && toca(x.recordarHora, t.minutos)) {
          out.push({
            clave: 'tk:' + x.id, titulo: x.titulo,
            cuerpo: +x.objetivo ? `${x.avance || 0} de ${x.objetivo} ${x.unidad || ''}`.trim() : 'Te lo recordás para ahora',
          });
        }
      }
    }
    return out;
  }

  /* ---------- Enviar (una vez por evento, por persona, por día) ---------- */
  let enviados = 0, salteados = 0;
  const plan: any[] = [];

  for (const [usuario, subs] of Object.entries(porUsuario)) {
    if (usuario === '_sin_dueño') continue; // sin dueño no sabemos qué mandarle
    for (const av of avisosDe(usuario)) {
      const id = `${t.fecha}:${usuario}:${av.clave}`;
      plan.push({ usuario, ...av, id, aparatos: subs.length });
      if (debug) continue;

      // La marca en notif_log es la que garantiza el "una sola vez": si la
      // fila ya existe, el insert falla y no se manda nada.
      const { error } = await sb.from('notif_log').insert({ id });
      if (error) { salteados++; continue; }

      const payload = JSON.stringify({ title: av.titulo, body: av.cuerpo, url: './' });
      for (const row of subs) {
        try { await webpush.sendNotification(row.data, payload); enviados++; }
        catch (e: any) {
          // 404/410 = el navegador se desregistró (app desinstalada, permiso revocado).
          if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('push_subs').delete().eq('id', row.id);
        }
      }
    }
  }

  return Response.json({
    hora_ar: t.hhmm, fecha_ar: t.fecha, debug,
    usuarios: Object.keys(porUsuario), plan, enviados, salteados,
  });
});
