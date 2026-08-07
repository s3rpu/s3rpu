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

---

# Runas — Summoners War (`/runas`)

Segunda mini-app del repo, independiente de la de entrenamiento: analiza tus monstruos y runas de **Summoners War** y busca la mejor combinación de runas disponible en tu inventario para cada monstruo.

Tampoco tiene backend: importas un JSON con tus datos del juego y todo el análisis se hace en el navegador.

## Uso

1. Exporta tu cuenta con [SWEX (SW Exporter)](https://github.com/Xzandro/sw-exporter/releases/latest) — funciona con la versión de Steam, el paso a paso está en la pestaña "Ayuda" de la app.
2. Abre `runas/index.html` e importa ese `.json`.
3. En "Monstruos" entra en la ficha de cada monstruo para ver sus runas, stats aportadas, sets activos, y usar el buscador de la mejor combinación disponible en tu inventario para una stat objetivo (velocidad, ataque, crítico...).
4. En "Runas" tienes el inventario completo filtrable por ranura/set/equipada.

### Limitaciones a tener en cuenta

- El JSON no trae las stats base del monstruo sin runas, así que las cifras que se muestran son "lo que aportan las runas", no la stat final del juego (sí es fiable para comparar builds entre sí, que es lo que hace el buscador).
- Los nombres de monstruo no vienen en el export: se muestran por ID y puedes ponerles un nombre en su ficha (se guarda en este navegador).
- Los porcentajes de los sets y la fórmula de eficiencia de runas están tomados de guías de la comunidad; revísalos en `runas/js/data.js` si ves algo que no cuadra con el juego actual.
- No genera recomendaciones de "meta" por mazmorra (eso cambia constantemente); solo optimiza combinaciones con las runas que ya tienes.

## Estructura

- `runas/index.html` — página de la app.
- `runas/css/style.css` — estilos específicos (reutiliza las variables de `css/style.css`).
- `runas/js/data.js` — constantes del juego (stats, sets, tabla de eficiencia).
- `runas/js/import.js` — parser del JSON de SWEX.
- `runas/js/optimizer.js` — cálculo de eficiencia/stats y buscador de la mejor combinación.
- `runas/js/app.js` — interfaz (importar, listar monstruos, ver runas, optimizador).
