# Nota de prensa

**Modelo:** `claude-opus-5` · **effort:** `high`
**Entrada:** un punto marcado como noticiable, o una nota en bruto / evento.
**Salida:** texto plano. Se escribe en `piezas` con `canal = nota_prensa`.

Va con el modelo grande porque es la pieza que sale con el nombre del Ayuntamiento
encima.

La estructura de abajo no es una propuesta: está medida sobre cinco notas reales del
gabinete de Sanlúcar (ver `datos/config-sanlucar.md`).

---

```
Redacta una nota de prensa institucional sobre este asunto.

Asunto: {{titulo}}
Documento de origen (texto literal):
{{texto}}

## Estructura

TITULAR EN MAYÚSCULAS, SIN PUNTO FINAL. Entre 11 y 17 palabras. Informativo:
di qué ha pasado, no lo celebres.

Debajo, un subtítulo en minúsculas de entre 13 y 29 palabras que amplíe el
titular con el dato o el motivo que no cabía arriba.

Cuerpo: entre 4 y 8 párrafos, unas {{palabras_nota_prensa}} palabras en total.
El primer párrafo responde qué, quién y cuándo. Los siguientes dan el detalle
práctico: importes, plazos, horarios, recorridos, porcentajes, alcance. Estas
notas son densas en detalle útil; no las dejes en generalidades.

Cierra con la línea de fecha, exactamente en este formato:
Sanlúcar, a {{fecha_hoy}}

## La declaración

Si el asunto lo pide —y en esta casa casi siempre lo pide—, deja el hueco de la
declaración en el sitio donde iría, con esta forma exacta:

[DECLARACIÓN PENDIENTE — {{cargo_alcaldia}} {{nombre_alcaldia}}]

Escribe el hueco, nunca la cita. No inventes lo que ha dicho un cargo público
ni parafrasees en estilo directo algo que el documento no recoge literalmente:
una declaración atribuida a alguien que no la ha pronunciado es el peor error
posible en este documento, y el gabinete la rellena en diez segundos.

Si el documento de origen sí contiene palabras textuales de un cargo, úsalas
entrecomilladas y no dejes hueco.

## Lo que no haces

No añades cifras, fechas, porcentajes, cargos ni nombres que no estén en el
documento de origen.

Si falta un dato que la nota necesitaría, escríbela sin él y termina con una
línea que empiece por `FALTA:` diciendo cuál. No lo rellenes con una suposición
ni con una fórmula vaga que disimule el hueco.
```

---

## Notas de implementación

- `{{fecha_hoy}}` se sustituye en n8n con la fecha en castellano (`5 de agosto de
  2026`), no la calcula el modelo.
- El pie institucional (dirección y teléfono) va en la plantilla de Word del
  gabinete, no en el texto generado.
- El marcador `[DECLARACIÓN PENDIENTE — …]` es lo que impide que una nota salga con
  una cita inventada, así que conviene que sea visible: un filtro de Baserow sobre
  `contenido` que lo contenga da la lista de piezas a las que aún les falta la
  declaración.
