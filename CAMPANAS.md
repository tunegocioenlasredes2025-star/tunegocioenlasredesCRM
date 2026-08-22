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

Estado: **especificación para aprobar**. Nada de esto está implementado todavía
salvo la normalización de teléfonos (`tel.js`) y el esquema de base
(`campanas-setup.sql`).

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

La regla 5 se apoya en `canalesContacto` y `ultimoContacto`. **Esos campos hoy
están rotos en 787 prospectos** y hay que repararlos antes de la primera campaña
(ver `backfill-contactos.mjs`).

Nada de esto se salta con una casilla en la interfaz. Si un prospecto tiene que
salir de la supresión, se lo saca del `supresiones` a mano y queda registrado.

---

## 4. Contrato con n8n

El CRM **no** habla con Meta ni con Evolution. Habla con n8n, que ya tiene el
adaptador (flujo 5 · `Enviar WhatsApp`, id `baqYfcJXpKvENYOK`).

### Flujo nuevo: `TNR-8-Worker-Campanas`

Corre cada minuto. Por cada campaña `en_curso` cuya ventana horaria esté abierta:

1. `campana_recuperar_colgados(15)` — devuelve a la cola lo que quedó trabado.
2. Verifica el cupo del día contra `cuentas_wa.enviados_hoy`.
3. `campana_tomar_lote(campana_id, n)` — toma y bloquea el lote.
4. Por cada fila, llama al flujo 5 con este contrato:

```json
{
  "to": "5491164887925",
  "texto": "Hola Ferretería Central, ...",
  "canal": "meta",
  "config": { "phone_number_id": "...", "instancia": "..." },
  "idempotencia": "CMP-12:5491164887925"
}
```

5. Escribe el resultado en `campana_destinatarios` y una fila en `mensajes`.
6. Si no quedan pendientes, marca la campaña `completada`.

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
| Reintentos | 2, con espera de 15 min y 2 h | Sólo para errores recuperables |

**Cortes automáticos** — la campaña se pausa sola y avisa si:

- La tasa de fallas supera **20%** sobre los últimos 50 envíos.
- La cuenta reporta un error de bloqueo o límite.
- Aparecen más de 3 bajas explícitas en una misma campaña.

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

## 7. Dónde estamos

| Item | Estado |
|---|---|
| `tel.js` — normalización a E.164 | Hecho |
| Auditoría de los 1.700 teléfonos | Hecha · reportes en `C:\TNR\Campanas-reportes` |
| `backfill-contactos.mjs` — reparar contactos | **Aplicado**: 811 corregidos, 0 rotos |
| `campanas.js` — capa de datos y segmentación | Hecho |
| `campanas-vista.js` — lista, editor y detalle | Hecho · probado en el navegador |
| `campanas-setup.sql` — tablas y cola | Escrito · **falta correrlo en Supabase** |
| `auth-setup.sql` — cerrar la base con login | Escrito · postergado por decisión de Mateo |
| Pantalla de login en el CRM | Postergada |
| Flujo `TNR-8-Worker-Campanas` (el motor) | Pendiente |
| Captura de respuestas en el flujo 1 | Pendiente |

Lo que quedó probado sin las tablas: la lista avisa que falta correr el SQL, el
editor calcula el segmento, resuelve las variables contra un prospecto real y
recalcula al cambiar cualquier filtro. Lo que **no** se pudo probar todavía, por
depender de las tablas: guardar una campaña, la pantalla de detalle y el
exportar a CSV.

### Decisión pendiente: por dónde se manda

Sin resolver. El sistema quedó armado para que cambiar de camino sea tocar un
solo lugar (`campanas.canal` + el nodo del flujo 5). Las tres opciones siguen
abiertas: Meta Cloud API, Evolution API con un número aparte, o modo prueba.
