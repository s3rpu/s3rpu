# Segmentar acta → puntos del orden del día

**Modelo:** `claude-sonnet-5` · **effort:** `medium`
**Entrada:** el PDF del acta como bloque `document` (Claude lo lee tenga o no capa de texto).
**Salida:** JSON. Se escribe en la tabla `puntos`.

Este paso es de volumen y bajo riesgo: no redacta nada público, sólo trocea. Por eso
va con el modelo mediano. El paso caro viene después, y sólo sobre lo que el gabinete
haya marcado como noticiable.

---

```
Este es un acta de pleno del {{nombre_oficial}}.

Extrae los puntos del orden del día. Para cada uno devuelve:

- `orden`: número del punto tal y como aparece en el acta.
- `titulo`: el epígrafe del punto, tal cual. No lo reescribas.
- `texto`: el texto literal del acuerdo adoptado, con sus cifras, plazos y
  resultado de la votación. Es lo que después respaldará la nota de prensa, así
  que cópialo sin resumir ni corregir.
- `pagina`: página del acta donde empieza el punto.
- `interes`: `alto`, `medio` o `bajo`, según su interés informativo para la
  ciudadanía. Es una sugerencia para ordenar la lista; la decisión la toma una
  persona después.

Incluye todos los puntos, también los de trámite (aprobación del acta anterior,
dación de cuentas). Marcarlos como `bajo` es suficiente; no los omitas, porque
quien revisa necesita ver el acta completa para confiar en la selección.

Devuelve únicamente un array JSON, sin texto alrededor:

[{"orden": 1, "titulo": "...", "texto": "...", "pagina": 3, "interes": "bajo"}]
```

---

## Notas de implementación

- Si el acta supera los 32 MB o las 600 páginas, hay que trocearla por rangos de
  páginas y concatenar los arrays resultantes. Se confirma con un acta real el Día 0.
- El nodo de Bedrock de n8n no siempre expone `output_config.format` (salida
  estructurada). Si no está disponible, se parsea el JSON con un nodo Code y se
  reintenta una vez si el parseo falla.
- `interes` **no** decide nada por sí solo: sólo ordena la vista. Quien marca la
  casilla `noticiable` es una persona. Automatizar esa decisión es justo lo que
  convierte el sistema en una máquina de generar notas que nadie publica.
