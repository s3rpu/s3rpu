# Adaptaciones a redes sociales

**Modelo:** `anthropic.claude-opus-5` · **effort:** `medium`
**Entrada:** la nota de prensa ya generada del mismo punto.
**Salida:** tres piezas (`x`, `facebook`, `instagram`).

Parten de la nota, no del acta: así las tres versiones cuentan lo mismo y basta con
revisar una vez que el hecho es correcto. Si cada canal partiera del acta por su
cuenta, podrían acabar diciendo cosas distintas del mismo acuerdo.

---

```
A partir de esta nota de prensa, escribe las tres adaptaciones.

{{nota_prensa}}

**X** — máximo {{caracteres_x}} caracteres, contando espacios y hashtags.
Un solo mensaje: el hecho concreto y su dato principal. Sin hilo, sin
"⬇️", sin "más info en bio". Hashtags: {{hashtags}}

**Facebook** — unas {{palabras_facebook}} palabras. Admite algo más de contexto
y un tono algo más cercano que la nota, sin dejar de ser institucional.

**Instagram** — unas {{palabras_instagram}} palabras. Es el pie de una imagen que
publicará el gabinete: no describas la imagen ni supongas qué se ve en ella.
Hashtags al final: {{hashtags}}

Ninguna de las tres puede añadir un dato que no esté en la nota.

Devuelve exactamente este formato, sin texto alrededor:

===X===
...
===FACEBOOK===
...
===INSTAGRAM===
...
```

---

## Notas de implementación

- El límite de X se comprueba en n8n con un nodo Code después de generar. Si se
  pasa, se reintenta una vez indicando en cuántos caracteres se excedió. Los
  modelos no cuentan caracteres con fiabilidad; comprobarlo en código es más
  barato que insistir en el prompt.
- Instagram en el MVP se queda en texto para copiar. Publicar por API exige cuenta
  business, página de Facebook vinculada e imagen obligatoria: es un proyecto
  aparte (ver `docs/PLAN-MVP.md`).
