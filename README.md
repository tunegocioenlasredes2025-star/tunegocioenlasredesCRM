# TNR · Sistema Operativo y CRM Interno

CRM y centro operativo de **Tu Negocio En Las Redes**. App web 100% estática: se abre en el navegador, sin instalar nada, sin Node, sin build. Los datos se guardan en tu navegador (localStorage) y podés exportarlos/importarlos como backup.

## Cómo usarlo

1. Abrí la carpeta `crm-tnr`.
2. Hacé doble click en **`index.html`** (se abre en tu navegador).
3. Listo. La primera vez vas a ver datos de ejemplo que podés borrar.

> Recomendado: Chrome o Edge. Para usarlo siempre, agregá la página a marcadores.

## Módulos

- **Dashboard** — KPIs de ventas, embudo, clientes, facturación y producción.
- **Prospectos** — CRM de prospectos con dos formas de carga:
  - **Formulario manual** — todos los campos.
  - **Chat inteligente** — escribís en lenguaje natural (ej: *"Juan Pérez, dueño de una inmobiliaria en Morón. Lo llamé hoy. Interesado en una web. Contactar el viernes."*) y el sistema completa los campos solo. Funciona offline, sin IA externa.
  - Búsqueda global, filtros (rubro, ciudad, estado, método), historial por prospecto, estado rápido, link directo a WhatsApp y conversión a cliente.
- **Clientes** — ficha completa con pestañas: Datos · Servicios · Producción · Facturación · Historial.
  - Al agregar un plan de redes se generan automáticamente los contenidos del mes y la factura.
  - Calendario de producción con estados (Pendiente → … → Publicado) y % de avance.
- **Tareas** — con responsable, fecha, prioridad y estado.
- **Notificaciones** — recordatorios de seguimientos, tareas y cobros próximos a vencer.

## Backup de datos (importante)

Los datos viven en **este navegador**. Para no perderlos:

- **⭳ Backup** (abajo a la izquierda) → descarga un archivo `.json` con todo.
- **⭱ Restaurar** → carga un backup en cualquier navegador o computadora.

Hacé un backup cada tanto, sobre todo antes de cambiar de compu o limpiar el navegador.

## Servicios y precios precargados

| Servicio | Precio |
|---|---|
| Redes · Plan Básico (12 contenidos) | $200.000/mes |
| Redes · Plan Intermedio (20) | $280.000/mes |
| Redes · Plan Boost (30) | $380.000/mes |
| Landing Page | $150.000 |
| Página Web | $200.000 |
| Web con Carrito | $250.000 |
| Mantenimiento (SEO + soporte) | $50.000/mes |

## Estructura técnica

```
crm-tnr/
├── index.html    # estructura
├── styles.css    # tema oscuro, responsive
├── data.js       # capa de datos (localStorage) + catálogos + backup
├── parser.js     # chat inteligente (parser local, sin IA)
└── app.js        # UI: vistas, búsqueda, filtros, formularios
```

Sin dependencias ni build. La única request externa es la fuente *Inter* (Google Fonts); si no hay internet, usa la fuente del sistema sin problema.

## Base de datos compartida (Supabase)

Para que el equipo vea y edite los mismos datos desde cualquier dispositivo:

1. Crear cuenta gratis en https://supabase.com → **New project** (elegí región Sudamérica). Anotá la contraseña.
2. En el proyecto → **SQL Editor** → **New query** → pegar TODO el contenido de [`supabase-setup.sql`](supabase-setup.sql) → **Run**.
3. **Settings → API** → copiar **Project URL** y la clave **anon public**.
4. Pegar ambas en [`config.js`](config.js):
   ```js
   window.SUPABASE_URL = 'https://xxxx.supabase.co';
   window.SUPABASE_ANON_KEY = 'eyJhbGc...';
   ```
5. Guardar, commit y push → Vercel redespliega solo. El indicador del sidebar pasa a **"Nube conectada"** (verde).

Sin claves, la app funciona en modo local (cada navegador con sus datos).

## Despliegue (Vercel)

El repo está en GitHub. Para publicar:

1. Entrar a https://vercel.com con la cuenta (login con GitHub).
2. **Add New… → Project** → importar el repo `tunegocioenlasredesCRM`.
3. Framework: **Other** · sin build · output por defecto → **Deploy**.
4. Queda una URL pública (ej. `tunegocioenlasredescrm.vercel.app`). Cada push a `main` redespliega automáticamente.

## Próximas versiones (roadmap)

- Login por usuario (que cada uno entre con su cuenta) y permisos.
- Chat inteligente con IA real para interpretación más precisa.
- Automatizaciones de captación y outreach.
