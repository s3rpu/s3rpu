# Administrador de Contactos

App web para gestionar la base de datos de contactos del ayuntamiento: buscar, editar, borrar y organizar contactos en listados personalizados reutilizables.

No requiere instalación ni backend: es HTML/CSS/JS puro y guarda todo en el `localStorage` del navegador.

## Uso

Abre `index.html` en el navegador (o sírvelo con cualquier servidor estático, por ejemplo `python3 -m http.server`).

- **Buscar**: escribe un nombre, cargo, teléfono, email o cualquier otro dato para filtrar los contactos. Cada resultado permite **Editar**, **Borrar** o **Añadir a…** un listado (crea uno nuevo al vuelo si hace falta).
- **Base de datos**: todos los contactos sin filtrar, para revisar el directorio completo.
- **Nuevo contacto**: crea un contacto con los campos existentes; se pueden añadir campos personalizados sobre la marcha con "+ Añadir campo". Al guardar, si coincide en nombre, teléfono o email con un contacto ya existente, se avisa antes de crear un posible duplicado.
- **Listados**: crea listados con nombre (p. ej. "Navidad 2026", "Colegios") para agrupar contactos y reutilizarlos año tras año sin tener que volver a buscarlos uno a uno. Desde un listado puedes añadir/quitar contactos, editarlos o borrarlos, importar un Excel directamente a ese listado, y exportar solo ese listado a Excel.
- **Importar Excel/CSV**: carga el Excel de los contactos (o cualquier CSV/XLSX), bien al directorio general (botón de la cabecera) o directamente como listado nuevo / a un listado existente (pestaña Listados). La primera fila se trata como cabecera de columnas; cada columna pasa a ser un campo del contacto automáticamente. Las filas que coincidan con contactos ya existentes (o repetidos dentro del propio archivo) se dejan en una revisión aparte, donde se pueden unificar, importar igualmente o descartar (una a una o todas de golpe).
- **Exportar a Excel**: descarga los contactos (todos, o solo un listado) en un `.xlsx` con formato de tabla: cabecera en color, autofiltro y fila fija.
- **Exportar/Importar backup**: descarga o restaura una copia de seguridad completa (contactos, listados y campos) en JSON, útil para cambiar de dispositivo o navegador.
- **Modo claro/oscuro**: botón en la cabecera, recuerda la preferencia.

## Estructura

- `index.html` — estructura de la página.
- `css/style.css` — estilos (paleta institucional con variante de modo oscuro).
- `js/data.js` — modelo de datos y almacenamiento (contactos, listados, campos, búsqueda, detección de duplicados, importación).
- `js/app.js` — lógica de la interfaz (búsqueda, formularios, listados, import/export).

Las librerías [SheetJS](https://sheetjs.com/) y [ExcelJS](https://github.com/exceljs/exceljs) están vendorizadas en `js/vendor/` (sin depender de ningún CDN): SheetJS lee los Excel/CSV al importar, y ExcelJS genera el `.xlsx` con formato al exportar.
