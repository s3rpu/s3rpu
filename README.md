# Directorio de Contactos

App web para gestionar la base de datos de contactos del ayuntamiento: buscar, editar, borrar y organizar contactos en listados personalizados reutilizables.

No requiere instalación ni backend: es HTML/CSS/JS puro y guarda todo en el `localStorage` del navegador.

## Uso

Abre `index.html` en el navegador (o sírvelo con cualquier servidor estático, por ejemplo `python3 -m http.server`).

- **Buscar**: escribe un nombre, cargo, teléfono, email o cualquier otro dato para filtrar los contactos. Cada resultado permite **Editar**, **Borrar** o **Añadir a…** un listado (crea uno nuevo al vuelo si hace falta).
- **Nuevo contacto**: crea un contacto con los campos existentes; se pueden añadir campos personalizados sobre la marcha con "+ Añadir campo".
- **Listados**: crea listados con nombre (p. ej. "Navidad 2026", "Colegios") para agrupar contactos y reutilizarlos año tras año sin tener que volver a buscarlos uno a uno. Desde un listado puedes añadir/quitar contactos y también editarlos o borrarlos directamente.
- **Importar Excel/CSV**: carga el Excel de los ~800 contactos (o cualquier CSV/XLSX). La primera fila se trata como cabecera de columnas; cada columna pasa a ser un campo del contacto automáticamente, sea cual sea su nombre.
- **Exportar/Importar backup**: descarga o restaura una copia de seguridad completa (contactos, listados y campos) en JSON, útil para cambiar de dispositivo o navegador.

## Estructura

- `index.html` — estructura de la página.
- `css/style.css` — estilos.
- `js/data.js` — modelo de datos y almacenamiento (contactos, listados, campos, búsqueda, importación).
- `js/app.js` — lógica de la interfaz (búsqueda, formularios, listados, import/export).

La librería [SheetJS](https://sheetjs.com/) (cargada desde CDN) se usa para leer los archivos Excel/CSV al importar.
