# Nota de prensa

**Modelo:** `anthropic.claude-opus-5` · **effort:** `high`
**Entrada:** un punto marcado como noticiable (título + texto literal del acuerdo).
**Salida:** texto plano. Se escribe en `piezas` con `canal = nota_prensa`.

Va con el modelo grande porque es la pieza que sale con el nombre del Ayuntamiento
encima.

---

```
Redacta una nota de prensa institucional sobre este acuerdo.

Punto del orden del día: {{titulo}}
Acuerdo adoptado (texto literal del acta):
{{texto}}

Estructura:
- Titular en una línea, sin punto final. Informativo, no publicitario.
- Entradilla: qué se ha aprobado, quién y cuándo, en una o dos frases.
- Cuerpo: el detalle relevante —cifras, plazos, alcance, resultado de la
  votación si es significativo—. Es el sitio donde reproducir los datos del
  acuerdo, no donde interpretarlos.
- Cierre: siguiente paso administrativo, si el acta lo indica.

Extensión: unas {{palabras_nota_prensa}} palabras.

Sin declaraciones entrecomilladas. Sólo puedes entrecomillar algo si aparece
literalmente en el acta; si el gabinete quiere una declaración de la Alcaldía,
la añade después, porque una cita inventada atribuida a un cargo público es el
peor error posible en este documento.
```
