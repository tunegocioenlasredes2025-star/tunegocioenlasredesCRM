# 🗺️ Activar "Buscar Negocios" con Google Maps (datos completos)

Con esto el buscador trae **teléfono, sitio web, rating y dirección reales** de Google Maps,
en vez de los datos incompletos de OpenStreetMap. Si no configurás esto, el buscador sigue
funcionando gratis con OpenStreetMap (menos datos).

---

## ⚠️ Lo primero: la verdad sobre la plata (leé esto)

- Google **te obliga a asociar una tarjeta** para usar la API. No hay forma de evitar eso.
- Google te da un **nivel gratuito mensual** grande. Para prospección (unas cientos de búsquedas
  por mes) **estás muy por debajo del límite**, así que en la práctica **no gastás**.
- Para quedarte tranquilo, en el paso 5 te hago poner un **TOPE de uso**. Con ese tope, si algún
  día se pasara del límite, la búsqueda **deja de funcionar ese día en vez de cobrarte**.
- **Honestidad total:** no te puedo firmar un "nunca jamás te va a cobrar" al 100%, porque la
  tarjeta queda asociada y Google podría cambiar sus términos. Pero con el tope puesto y tu
  volumen, no te va a cobrar. Así lo usan gratis miles de personas.
- Si querés **cero riesgo garantizado**, no actives esto y quedate con OpenStreetMap.

---

## Paso 1 — Crear el proyecto
1. Entrá a **https://console.cloud.google.com** con tu cuenta de Google.
2. Arriba, **Select a project → New Project**. Nombre: `tnr-crm`. **Create**.

## Paso 2 — Activar la API correcta
1. Menú ☰ → **APIs & Services → Library**.
2. Buscá **"Places API (New)"** y tocá **Enable**.
   *(Es "Places API (New)", la nueva. No la vieja.)*

## Paso 3 — Activar facturación (la tarjeta)
1. Menú ☰ → **Billing → Link a billing account → Create account**.
2. Cargá los datos de la tarjeta. *(Google puede hacer una verificación temporal de ~US$0 o
   un monto chico que se reintegra. No es un cobro.)*

## Paso 4 — Crear la API key
1. Menú ☰ → **APIs & Services → Credentials → + Create credentials → API key**.
2. Copiá la key (algo tipo `AIza....`).
3. Tocá **Edit API key** y **restringila** (importante para que nadie más la use):
   - **Application restrictions → Websites**. Agregá:
     - `https://tunegocioenlasredes-crm.vercel.app/*`
     - `http://localhost:8930/*` (para probar en tu compu)
   - **API restrictions → Restrict key → Places API (New)**. **Save**.

## Paso 5 — Ponerle el TOPE (para que no gaste)
1. Menú ☰ → **APIs & Services → Places API (New) → Quotas & System Limits**.
2. Bajá los límites de requests a un número chico y suficiente (ej: **300 por día**).
   Con eso, aunque quisieras, no podés pasar el nivel gratis.
3. Extra recomendado: **Billing → Budgets & alerts → Create budget**, poné **US$1** y activá el
   aviso por mail. Así, si alguna vez apareciera cualquier cargo, te enterás al toque.

## Paso 6 — Pegar la key en el CRM
1. Abrí el archivo **`config.js`** del proyecto.
2. Pegá tu key:
   ```js
   window.GOOGLE_MAPS_KEY = 'AIza...tu-key...';
   ```
3. Guardá, subí el cambio (GitHub) y Vercel republica solo. Listo: el buscador ahora usa Google.

> En "Buscar Negocios" vas a ver el cartel **"vía Google Maps"** cuando está activo.
> Si sacás la key, vuelve solo a OpenStreetMap.
