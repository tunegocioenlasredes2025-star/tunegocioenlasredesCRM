# Campañas de WhatsApp · Especificación

> **Para retomar desde otra máquina.** Leé este archivo entero antes de tocar
> nada. Resumen de contexto:
>
> - El CRM es un sitio estático (HTML + JS a mano, sin build) contra Supabase.
>   Se deploya solo: `git push origin main` → Vercel → tunegocioenlasredes-crm.vercel.app.
>   En cada release hay que subirle el número al `?v=NN` de `index.html`.
> - Este módulo son 4 archivos: `tel.js`, `campanas.js`, `campanas-vista.js`
>   y el bloque de estilos al final de `styles.css`. Se engancha al CRM en tres
>   puntos de `app.js`: `window.TNRUI`, el router de `render()` y `renderCampanas()`.
> - **Mateo no es programador.** Explicarle todo en criollo, sin tecnicismos.
> - Falta una decisión suya: por qué canal se manda (ver el final del archivo).
>   No avanzar con el envío real hasta que esté resuelto.
> - Lo que NO está en este repo y vive sólo en la PC de Mateo:
>   `C:\TNR\Campanas-reportes` (copia de seguridad de la base y las planillas de
>   teléfonos). No hacen falta para programar, y no se suben porque el repo es público.

Módulo del Sistema Operativo de TNR para mandar mensajes a prospectos del CRM
y que el resultado vuelva al prospecto como trabajo comercial.

Estado: la pantalla y el motor están escritos y probados; falta correr el SQL en
Supabase, importar el flujo a n8n y decidir por qué canal se manda. El detalle de
qué está hecho y qué no, en el punto 8.

---

## 1. Alcance

Lo que hace:

- Elegir destinatarios con los filtros que ya existen en la vista Prospectos.
- Armar un mensaje con variables reales del CRM y verlo resuelto antes de mandar.
- Enviar por el flujo 5 de n8n, a ritmo controlado, con cupo diario.
- Registrar cada envío, cada falla y cada respuesta en el prospecto.
- Generar seguimiento comercial a partir de las respuestas.

Lo que **no** hace, por decisión explícita:

- No falsifica la huella del dispositivo ni rota proxies para esquivar los
  controles de WhatsApp.
- No varía el texto con el objetivo de no ser detectado (sí hay variantes, pero
  para medir cuál convierte mejor).
- No calibra pausas contra los mecanismos anti-spam.

Los intervalos y cupos que sí existen están para respetar los límites del
proveedor, no para escondernos de ellos.

---

## 2. Máquina de estados

### Campaña

```
borrador ──► programada ──► en_curso ──► completada
   │                          │  ▲
   │                          ▼  │
   │                        pausada
   │                          │
   └──────────► cancelada ◄───┘
```

| Estado | Qué significa | Quién lo cambia |
|---|---|---|
| `borrador` | Se está armando. No manda nada | Usuario |
| `programada` | Confirmada, esperando fecha/hora | Usuario |
| `en_curso` | El worker está tomando lotes | Scheduler |
| `pausada` | Frenada. Los pendientes siguen pendientes | Usuario, o corte automático |
| `completada` | No quedan pendientes | Worker |
| `cancelada` | Los pendientes pasan a `suprimido` | Usuario |

Una campaña pausada por corte automático guarda el porqué en `motivo_pausa`.
Nunca se reanuda sola: la reanuda una persona.

### Destinatario

```
pendiente ──► enviando ──► enviado ──► entregado ──► leido ──► respondido
    │             │            │
    │             │            └──► fallido ──► (reintento) ──► pendiente
    │             └──► fallido
    └──► suprimido
```

| Estado | Qué significa |
|---|---|
| `pendiente` | En cola |
| `enviando` | Tomado por un worker. Si queda colgado 15 min, vuelve a `pendiente` |
| `enviado` | El proveedor lo aceptó |
| `entregado` / `leido` | Confirmado por webhook (sólo canal oficial) |
| `respondido` | Contestó. **Es la métrica que importa** |
| `fallido` | Rechazado. `motivo` dice cuál de los errores fue |
| `suprimido` | Nunca se le mandó, y por qué |

---

## 3. Reglas de supresión

Se evalúan **dos veces**: al armar la campaña, y de nuevo justo antes de enviar
(entre que se arma y se manda pueden pasar días). En este orden, la primera que
aplica gana:

| # | Regla | Estado resultante |
|---|---|---|
| 1 | El teléfono está en `supresiones` | `suprimido` · no contactar |
| 2 | El teléfono no normaliza a E.164 | `suprimido` · número inválido |
| 3 | Ya falló antes como "no tiene WhatsApp" | `suprimido` · sin whatsapp |
| 4 | El prospecto está en `Ganado` o `Perdido` | `suprimido` · cerrado |
| 5 | Ya se lo contactó hace menos de N días | `suprimido` · contacto reciente |
| 6 | Ya está en esta campaña | no se inserta (lo frena el unique de la base) |
| 7 | Mismo teléfono que otro prospecto ya incluido | `suprimido` · duplicado |

N por defecto: **30 días**. Configurable por campaña, con un mínimo de 7.

La regla 5 se apoya en `canalesContacto` y `ultimoContacto`. Esos campos estaban
vacíos en 811 prospectos que sí habían sido contactados por mail, porque la campaña
de mail escribió sólo el `estado`. Ya se reparó con `backfill-contactos.mjs` (agosto
2026). Si mañana aparece otro proceso que marque contactos, tiene que usar
`registrarContacto()` y no `actualizarProspecto({estado})`, o el problema vuelve.

Nada de esto se salta con una casilla en la interfaz. Si un prospecto tiene que
salir de la supresión, se lo saca del `supresiones` a mano y queda registrado.

---

## 4. Contrato con n8n

El CRM **no** habla con Meta ni con Evolution. Habla con n8n, que ya tiene el
adaptador (flujo 5 · `Enviar WhatsApp`, id `baqYfcJXpKvENYOK`).

### Flujo nuevo: `TNR-8-Worker-Campanas`

Corre cada minuto. Por cada campaña `en_curso` cuya ventana horaria esté abierta:

1. `campana_recuperar_colgados(15)` — devuelve a la cola lo que quedó trabado.
2. `campanas_pendientes()` — trae las campañas activas con cuántas mandaron hoy y
   cuántas les quedan.
3. Decide cuáles corresponden ahora: fecha de arranque, día, franja horaria, cupo
   del día y reparto parejo.
4. `campana_tomar_lote(campana_id, n)` — toma y bloquea el lote.
5. Por cada fila, llama al flujo 5 con este contrato:

```json
{
  "to": "5491164887925",
  "texto": "Hola Ferretería Central, ...",
  "canal": "meta",
  "config": { "phone_number_id": "...", "instancia": "..." },
  "idempotencia": "CMP-12:5491164887925"
}
```

6. `campana_marcar_resultado(...)` escribe el resultado en `campana_destinatarios`
   y deja la fila en `mensajes`, en una sola operación.
7. Si salió bien, `prospecto_registrar_contacto(...)` lo anota en el prospecto.
8. Al terminar la vuelta: `campana_frenar_si_falla(...)` y `campana_cerrar_si_termino(...)`.

`idempotencia` es `campana_id:telefono`. Si el flujo se reintenta, el índice
único de `mensajes.wamid` y esta clave evitan el doble envío.

### Entrantes

El flujo 1 (`Router WhatsApp`, id `kI4gXG24d1s60V0D`) ya recibe y normaliza los
mensajes que llegan. Se le agrega un paso: buscar el teléfono en
`campana_destinatarios` con envío en los últimos 30 días. Si aparece:

- `estado = 'respondido'`, `respondido_en = now()`
- fila en `mensajes` con `direccion = 'entrante'`
- en el prospecto: estado `Respondió`, entrada de historial, y **tarea de
  seguimiento** para el responsable

Si no aparece, sigue su camino normal hacia el agente de IA.

---

## 5. Ritmo, cupos y cortes

| Parámetro | Default | Por qué |
|---|---|---|
| Cupo diario por campaña | 50 | Empezar chico y medir antes de escalar |
| Cupo diario por cuenta | 250 | El primer escalón de límite de Meta |
| Intervalo entre mensajes | 45 s | Ritmo humano razonable, no evasión |
| Ventana horaria | 09:00–18:00, lun a vie | No molestar de noche ni fin de semana |
| Reintentos | hasta 3, esperando 15 min | Sólo para errores recuperables |

**Cortes automáticos** — la campaña se pausa sola y avisa si:

- La tasa de fallas supera **20%** sobre los últimos 50 envíos (mínimo 20 para
  que la muestra signifique algo). Implementado en `campana_frenar_si_falla`.
- Pendientes de implementar: corte por error de bloqueo de la cuenta y corte por
  bajas explícitas.

Un error de número inválido no se reintenta nunca: se suprime y listo.

---

## 6. Qué queda registrado en el prospecto

Por cada destinatario, cuando corresponde:

| Evento | Qué se escribe |
|---|---|
| Enviado | `DB.registrarContacto(id, 'WhatsApp')` + historial con nombre de campaña |
| Fallido recuperable | Historial con el error. El estado no se toca |
| Sin WhatsApp | Historial + alta en `supresiones` |
| Respondió | Estado `Respondió` + historial + tarea de seguimiento |

`registrarContacto` ya existe en `data.js` y tiene el guard de `ESTADOS_PREVIOS`:
no pisa a alguien que ya está en `Interesado` o `Reunión Agendada`. Se usa tal
cual, sin tocarlo.

El prospecto acumula además `campanas: [{id, fecha, resultado, variante}]`, que
es lo que permite preguntas del tipo "ferreterías de Morón que recibieron la
campaña de marzo, no respondieron, y no se tocan hace 45 días".

---

## 7. Poner el motor a andar

El motor es el flujo **`TNR-8-Worker-Campanas.json`**, en `C:\TNR\Automatizaciones\workflows\`.
Corre cada minuto, saca los destinatarios de la cola y los manda por el flujo 5.

**Paso 1 · Base.** Correr `campanas-setup.sql` en Supabase (SQL Editor → New query → Run).
Verificar que quedaron las funciones:

```sql
select proname from pg_proc where proname like 'campana%' or proname = 'prospecto_registrar_contacto';
```

Tienen que aparecer 8: `campana_tomar_lote`, `campana_resumen`, `campanas_resumen_todas`,
`campanas_pendientes`, `campana_marcar_resultado`, `campana_cerrar_si_termino`,
`campana_frenar_si_falla`, `campana_recuperar_colgados`, más `prospecto_registrar_contacto`.

**Paso 2 · Importar.** n8n → Workflows → Import from File → elegir el JSON.

**Paso 3 · Credencial.** Los 8 nodos que hablan con Supabase quedan con el casillero de
credencial vacío al importar. Asignarles la credencial **Supabase account** (`iXPpVXFk6eG38jXJ`),
que ya existe de los otros flujos.

**Paso 4 · Probar sin mandar nada.** Con la campaña en canal `prueba`, el flujo 5 entra
por su rama "Modo Prueba (no envía)": registra el envío, marca al destinatario y anota el
contacto en el prospecto, pero **no sale ningún mensaje**. Es la forma de verificar todo
el circuito antes de conectar un WhatsApp.

En n8n: abrir el flujo → *Execute workflow* → revisar la ejecución nodo por nodo.

**Paso 5 · Activar.** Recién cuando el paso 4 dé bien, activar el flujo.

### Cómo se comporta

| Situación | Qué hace |
|---|---|
| Fuera del horario o día configurado | No manda nada, ni siquiera arranca |
| El cupo del día ya se cumplió | Espera hasta mañana |
| Va al día con el reparto | Espera, no adelanta |
| Estuvo caído unas horas | Recupera solo, sin disparar todo junto |
| El worker murió a mitad de lote | A los 15 minutos esos destinatarios vuelven a la cola |
| Falló más del 20% de los últimos 50 | Pausa la campaña y escribe el motivo. **No se reanuda sola** |
| Número inválido | No se reintenta: se marca fallido y listo |
| Error de conexión | Reintenta hasta 3 veces, esperando 15 minutos |
| No queda nadie pendiente | La campaña pasa a completada |

**El reparto del cupo.** El cupo diario se estira a lo largo de la franja horaria en vez
de dispararse todo junto a la mañana. Con 40 por día entre las 9 y las 18, sale uno cada
trece minutos: 4 o 5 por hora, el último cerca de las 18. Simulado día completo: 40 de 40
enviados, con huecos de entre 13 y 14 minutos.

---

## 8. Dónde estamos

| Item | Estado |
|---|---|
| `tel.js` — normalización a E.164 | Hecho |
| Auditoría de los 1.700 teléfonos | Hecha · reportes en `C:\TNR\Campanas-reportes` |
| `backfill-contactos.mjs` — reparar contactos | **Aplicado**: 811 corregidos, 0 rotos |
| `campanas.js` — capa de datos y segmentación | Hecho |
| `campanas-vista.js` — lista, editor y detalle | Hecho · probado en el navegador |
| `campanas-setup.sql` — tablas, cola y funciones | Escrito · **falta correrlo en Supabase** |
| `TNR-8-Worker-Campanas.json` — el motor | Escrito · lógica probada · **falta importarlo a n8n** |
| `auth-setup.sql` — cerrar la base con login | Escrito · postergado por decisión de Mateo |
| Pantalla de login en el CRM | Postergada |
| Captura de respuestas en el flujo 1 | Pendiente |

**Probado.** En el navegador: la lista avisa que falta correr el SQL, el editor
calcula el segmento, resuelve las variables contra un prospecto real y recalcula al
cambiar cualquier filtro; el resto del CRM no se rompió y en mobile queda en una
columna. Del motor, con pruebas sobre el código de sus nodos: los 11 casos de
horario y día (incluido el cruce de medianoche por UTC), el reparto del cupo a lo
largo del día, la recuperación después de una caída, el armado del mensaje con dos
campañas simultáneas y la limpieza del texto cuando falta un dato.

**Sin probar todavía, porque dependen de las tablas o de n8n:** guardar una campaña,
la pantalla de detalle, el exportar a CSV, y el motor corriendo de verdad dentro de
n8n (paso 4 del punto 7).

**Dos bugs arreglados de paso**, ninguno de este módulo:
`registrarContacto` en `data.js` escribía estados con la grafía vieja
(`Contactado por WhatsApp`), que no está en `ESTADOS_LEAD`, así que el prospecto
quedaba con el chip gris; y `canalesContacto` estaba vacío en 811 prospectos que sí
habían sido contactados por mail (reparado con `backfill-contactos.mjs`).

### Decisión pendiente: por dónde se manda

Sin resolver. El sistema quedó armado para que cambiar de camino sea tocar un
solo lugar (`campanas.canal` + el nodo del flujo 5). Las tres opciones siguen
abiertas: Meta Cloud API, Evolution API con un número aparte, o modo prueba.
