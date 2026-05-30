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

## Despliegue (opcional)

Como es estático, se sube tal cual a **GitHub Pages** o **Vercel** (importás la carpeta y deploy, sin configuración). Cada usuario tendría sus propios datos en su navegador.

## Próximas versiones (roadmap)

- Sincronización en la nube multi-dispositivo (Supabase) para compartir datos entre el equipo.
- Chat inteligente con IA real para interpretación más precisa.
- Automatizaciones de captación y outreach.
