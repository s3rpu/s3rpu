# Mi Progreso

App web para registrar el progreso de tu rutina de entrenamiento (Pierna A, Torso A, Pierna B, Torso B).

No requiere instalación ni backend: es HTML/CSS/JS puro y guarda todo en el `localStorage` del navegador.

## Uso

Abre `index.html` en el navegador (o sírvelo con cualquier servidor estático, por ejemplo `python3 -m http.server`).

- Elige el día en las pestañas superiores.
- Registra peso, series y reps de cada ejercicio con la fecha de hoy.
- Pulsa "Historial" en un ejercicio para ver o borrar registros anteriores.
- En la pestaña "Progreso" verás estadísticas generales y la evolución de peso por ejercicio.
- "Exportar" descarga una copia de seguridad en JSON; "Importar" la restaura (útil al cambiar de dispositivo o navegador).

## Estructura

- `index.html` — estructura de la página.
- `css/style.css` — estilos.
- `js/routine.js` — definición de la rutina (días y ejercicios).
- `js/app.js` — lógica de la app (registro, historial, estadísticas, import/export).

Para editar la rutina, modifica `js/routine.js`.
