/* ============================================================
   TNR · Configuración de la base de datos compartida (Supabase)
   ------------------------------------------------------------
   Estas son claves PÚBLICAS (van del lado del navegador, no hay
   problema en que estén en el repo). NUNCA pongas acá la clave
   "secret" / service_role.
   ============================================================ */
window.SUPABASE_URL = 'https://oqhzonwrcldwtdfurhzj.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xaHpvbndyY2xkd3RkZnVyaHpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzIzNTEsImV4cCI6MjA5NTc0ODM1MX0.yhRmByi1fjJC-EwhZdmofQ3W9-TJ89ELYmfanq3aHU0';

// Notificaciones push (Web Push). Pegá acá la VAPID PUBLIC KEY que te dé la
// función "notify" de Supabase (ver push-setup.sql). Si queda vacía, las
// notificaciones funcionan solo al abrir la app.
window.VAPID_PUBLIC = 'BK8v1DrJbm1K84NNCQie4W6zBH1SQH82Xl_m4P3zzg4-K1jh1y8OiHBQX0ws8AOA5xqF6fMUliRDEp7DD2f-0ck';

// Quién es quién. Esto NO es un secreto: sólo dice qué mail corresponde a qué
// persona del equipo, para que el CRM sepa de quién son las tareas. Las
// contraseñas viven en Supabase (Authentication → Users), nunca acá.
// Para sumar a alguien: se lo crea en Supabase y se agrega su mail a esta lista.
window.TNR_USUARIOS = {
  'mateo@tunegocioenlasredes.com.ar':    { id: 'mateo',    nombre: 'Mateo De Rosa' },
  'santiago@tunegocioenlasredes.com.ar': { id: 'santiago', nombre: 'Santiago Stalla' },
};

// Google Maps / Places API key para "Buscar Negocios" con datos completos
// (teléfono, web, rating, dirección). Si queda VACÍA, el buscador usa
// OpenStreetMap (gratis, pero con menos datos). Ver GUIA-GOOGLE-MAPS.md.
// Restringí la key por dominio y poné un tope diario para que no gaste.
window.GOOGLE_MAPS_KEY = '';
