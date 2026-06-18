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
