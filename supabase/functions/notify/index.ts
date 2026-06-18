// ============================================================
// TNR · Edge Function "notify"
// - GET ?genkeys=1  -> genera y devuelve un par de llaves VAPID (correr 1 vez)
// - default (cron)  -> calcula inactividad y envía push a los dispositivos
// Deploy: Supabase -> Edge Functions -> crear "notify" -> pegar este código.
// Secrets necesarios: VAPID_PUBLIC, VAPID_PRIVATE
// ============================================================
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const hoy = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime();
  const d = new Date(iso.slice(0, 10) + 'T00:00:00').getTime();
  return Math.floor((hoy - d) / 86400000);
}
function maxF(rows: any[], f: string): string | null {
  let m: string | null = null;
  for (const r of rows || []) { const v = r.data?.[f]; if (v && (!m || v > m)) m = v; }
  return m;
}

function inactividad(cli: any[], pros: any[], tar: any[]): string[] {
  let ultCli: string | null = null;
  for (const c of cli || []) { const h = c.data?.historial?.[0]?.fecha || c.data?.fechaCreacion; if (h && (!ultCli || h > ultCli)) ultCli = h; }
  let ultTarea: string | null = null;
  for (const t of tar || []) { if (t.data?.estado === 'Finalizada') { const f = t.data.finalizadaEn || t.data.fechaCreacion; if (f && (!ultTarea || f > ultTarea)) ultTarea = f; } }
  const defs = [
    { d: diasDesde(maxF(cli, 'fechaCreacion')), w: 7, txt: 'no se registra una venta' },
    { d: diasDesde(maxF(pros, 'fechaCreacion')), w: 3, txt: 'no se crea un lead' },
    { d: diasDesde(ultCli), w: 7, txt: 'no se actualiza un cliente' },
    { d: diasDesde(ultTarea), w: 3, txt: 'no se completa una tarea' },
  ];
  const out: string[] = [];
  for (const def of defs) {
    if (def.d == null) out.push('Todavía no hay registros: ' + def.txt.replace('no se ', ''));
    else if (def.d >= def.w) out.push(`Hace ${def.d} día${def.d === 1 ? '' : 's'} que ${def.txt}`);
  }
  return out;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('genkeys')) {
    return Response.json(webpush.generateVAPIDKeys());
  }
  const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC');
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE');
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return Response.json({ error: 'Faltan secrets VAPID_PUBLIC / VAPID_PRIVATE' }, { status: 400 });
  webpush.setVapidDetails('mailto:tunegocioenlasredes2025@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const [cli, pros, tar] = await Promise.all([
    sb.from('clientes').select('data'),
    sb.from('prospectos').select('data'),
    sb.from('tareas').select('data'),
  ]);
  const alerts = inactividad(cli.data || [], pros.data || [], tar.data || []);
  if (!alerts.length) return Response.json({ sent: 0, reason: 'sin alertas de inactividad' });

  const body = alerts[0] + (alerts.length > 1 ? ` (+${alerts.length - 1} más)` : '');
  const payload = JSON.stringify({ title: 'TNR · Alertas del día', body, url: './' });

  const subs = await sb.from('push_subs').select('id,data');
  let sent = 0;
  for (const row of subs.data || []) {
    try { await webpush.sendNotification(row.data, payload); sent++; }
    catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('push_subs').delete().eq('id', row.id);
    }
  }
  return Response.json({ sent, total: (subs.data || []).length, alerts });
});
