# Poner en marcha el Sistema Operativo — 4 pasos

Hacé los pasos **en este orden**. Cada uno se hace una sola vez.

---

## Paso 1 — Crear las dos tablas nuevas (2 minutos)

El CRM ahora guarda dos cosas que antes no existían: los **proyectos** y las
**rutinas** (las tareas que se repiten solas). Hay que crearles el lugar.

1. Entrá a Supabase → tu proyecto → **SQL Editor** → **New query**.
2. Abrí el archivo `sistema-setup.sql` de esta carpeta, copiá **todo** y pegalo.
3. Apretá **Run**.

Si algo salió mal el CRM te lo va a avisar solo: en la pantalla *Hoy* aparece un
cartel amarillo que dice "Falta un paso de instalación".

---

## Paso 2 — Crear los usuarios de Mateo y Santiago (3 minutos)

Las contraseñas **no están en el código** ni en el repositorio. Viven adentro de
Supabase, que es quien las valida. Por eso hay que cargarlas ahí una vez.

1. Supabase → **Authentication** → **Users** → botón **Add user** → *Create new user*.
2. Cargá el primero:
   - Email: `mateo@tunegocioenlasredes.com.ar`
   - Password: la que quieras usar
   - **Tildá "Auto Confirm User"** ← esto es importante. Si no lo tildás,
     Supabase espera que alguien haga clic en un mail de confirmación que nunca
     va a llegar, y el usuario no puede entrar.
3. Repetí con el segundo:
   - Email: `santiago@tunegocioenlasredes.com.ar`
   - Password: la que quieras usar
   - **Auto Confirm User** tildado.

> Esas dos direcciones no necesitan existir como casilla de mail de verdad:
> son sólo el nombre de usuario. Si preferís usar otras, cambialas también en
> `config.js` → `window.TNR_USUARIOS` (ahí sólo dice qué mail es qué persona;
> no hay ninguna contraseña).

**Probá que entra** antes de seguir: abrí el CRM, iniciá sesión con cada uno y
fijate que se vean los prospectos.

---

## Paso 3 — Cerrar la base con llave (1 minuto) — *opcional pero recomendado*

Hoy la base se puede leer y modificar con la clave pública que está en el código
del sitio. Mientras el CRM era una libreta interna era tolerable; con 1.700
prospectos y un módulo que manda mensajes en nombre de TNR, no.

**Recién después de confirmar que los dos entran bien:**

1. Supabase → **SQL Editor** → **New query**.
2. Copiá y pegá todo `auth-setup.sql`.
3. **Run**.

A partir de ahí, los datos sólo se ven con sesión iniciada. Si algo se rompe, el
mismo archivo tiene abajo el rollback para volver atrás en 10 segundos.

---

## Paso 4 — Recordatorios en el celular *(opcional)*

Esto es lo que hace que suene el aviso **con la app cerrada**, a la hora que
elija cada uno desde el CRM (menú → **Recordatorios**).

Hoy ya llega un aviso todos los días a las 9 con el mismo texto para los dos.
Este paso lo reemplaza por avisos personales: “tenés 10 tareas hoy”, “te faltan
4 de 10”, “marcá lo que hiciste”, más los recordatorios de tareas puntuales.

1. Supabase → **SQL Editor** → **New query** → pegar todo `push-setup.sql` →
   **Run**. Antes de correrlo, reemplazá `<ANON_KEY>` por la clave anon del
   proyecto (es la misma que está en `config.js`, no es secreta).
2. Supabase → **Edge Functions** → abrir la función **notify** → reemplazar todo
   el código por el de `supabase/functions/notify/index.ts` → **Deploy**.
3. Probar sin esperar: abrí en el navegador
   `https://oqhzonwrcldwtdfurhzj.functions.supabase.co/notify?debug=1`.
   Te dice la hora argentina que ve el servidor y qué avisos mandaría. No manda
   nada.
4. En el celular: abrir el CRM → menú → **Recordatorios** → **Activar en este
   dispositivo** → **Probar ahora**. Hay que hacerlo en cada aparato.

> Para que el aviso llegue de verdad con la app cerrada (sobre todo en iPhone),
> el CRM tiene que estar **instalado como aplicación**: en el navegador del
> celular, menú → “Agregar a pantalla de inicio”.

Si no hacés este paso, los recordatorios igual funcionan mientras la app está
abierta o en segundo plano. Lo que falta sin el paso 4 es el aviso con la app
cerrada del todo.

---

## Qué pasa la primera vez que se abre

La primera vez que alguien abra el CRM, el sistema carga solo:

- **14 proyectos** (Thiago, MC E-Bike, Motos Roll, F5, marca personal, TikTok,
  revistas, web TNR, automatizaciones, casos de éxito, app de prospección,
  SEO+Ads, capacitación, cold calls).
- **11 rutinas** (los 10+10 mensajes de TNR, los 5 de WhatsApp de MF, los 15
  mails, los 20 contactos de IG, los tres bloques de 15 minutos, el carrusel +
  estática de las revistas, y el carrusel y el reel semanales de marca personal).
- **11 tareas sueltas** con las fechas que ya estaban acordadas (el número de
  Claro, la reorganización del 24, Motos Roll, las destacadas, los cursos…).

Eso se crea **una sola vez**, con identificadores fijos: aunque lo abran los dos
al mismo tiempo desde dos celulares, no se duplica nada. Si después borrás o
editás una rutina, no vuelve sola.

---

## Sumar una persona más adelante

1. Crearle el usuario en Supabase (paso 2).
2. Agregar su mail en `config.js` → `window.TNR_USUARIOS`.
3. Agregarla en `data.js` → `RESPONSABLES`.

Con eso ya aparece en los selectores, en Productividad y en el reparto de las
rutinas que dicen "cada uno".
