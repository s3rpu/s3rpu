# Configuración de Sanlúcar de Barrameda

Valores para la fila única de la tabla `config`, **derivados de cinco notas de prensa
reales del gabinete** (agosto de 2026), no inventados.

Fuente: `datos/ejemplos-sanlucar.csv`.

---

## Campos

| Campo | Valor |
|---|---|
| `clave` | `sanlucar` |
| `nombre_oficial` | Ayuntamiento de Sanlúcar de Barrameda |
| `gentilicio` | sanluqueño / sanluqueña |
| `cargo_alcaldia` | `alcaldesa` |
| `nombre_alcaldia` | Carmen Álvarez |
| `lenguaje_inclusivo` | `si` |
| `palabras_nota_prensa` | `300` |
| `caracteres_x` | `270` |
| `palabras_facebook` | `90` |
| `palabras_instagram` | `60` |

Las longitudes salen de medir las notas reales: el cuerpo va de **172 a 454
palabras**, con una media de 290. 300 es un punto de partida honesto; el propio
gabinete lo ajustará cuando vea las primeras salidas.

## `tratamientos`

```
La institución es «el Ayuntamiento de Sanlúcar de Barrameda» o «el Ayuntamiento».
También se usa «el Gobierno local», siempre con G mayúscula. Nunca «el consistorio»
ni «el ente municipal».

Los cargos se citan con el cargo delante y el nombre detrás, entre comas:
«La alcaldesa, Carmen Álvarez, ha destacado…», «el delegado municipal de Cultura y
Fiestas, Narciso Vital». En menciones posteriores dentro de la misma nota basta el
nombre: «Carmen Álvarez ha añadido…».

Cargos actuales:
- Alcaldesa: Carmen Álvarez
- Narciso Vital: delegado de Cultura y Fiestas, y de Tráfico y Movilidad
- Miguel Ángel Casal: delegado municipal

Empresas municipales, con su ámbito:
- Emulisan — limpieza viaria
- Tussa (Transportes Urbanos de Sanlúcar) — transporte urbano

A la ciudadanía se la nombra como «los sanluqueños y sanluqueñas», «la ciudadanía»
o «los vecinos y vecinas». El desdoblamiento es el uso habitual de la casa.

La ciudad es «Sanlúcar». «Sanlúcar de Barrameda» sólo en la primera mención o en el
nombre completo de la institución.
```

## `tono`

```
Institucional y sobrio, en tercera persona y voz activa. Frases largas pero claras,
con subordinadas: es el registro de la casa, no telegramas.

Pasado compuesto para lo ya hecho («ha llevado a cabo», «ha presentado»), futuro
para lo previsto («pondrá en marcha», «dará comienzo»).

Los datos concretos van en el cuerpo: importes, horarios, fechas, recorridos,
porcentajes. Estas notas son informativas y densas en detalle práctico, no
declarativas.

Se admite un cierre que enmarque la actuación en la línea de trabajo del Gobierno
local, pero sin adjetivación propagandística. «Histórico» sólo si el dato lo es de
verdad y está en la fuente (por ejemplo, un mínimo de la serie del SEPE).
```

## `hashtags`

El gabinete no usa hashtags en las notas de prensa. Están pendientes de definir
para las piezas de redes: preguntarle al gabinete cuáles usa en X e Instagram.

## Estructura fija de la nota

Constante en las cinco notas:

```
TITULAR EN MAYÚSCULAS, SIN PUNTO FINAL          (11-17 palabras)
Subtítulo en minúsculas que amplía el titular    (13-29 palabras)

Cuerpo: de 4 a 8 párrafos.

Sanlúcar, a <día> de <mes> de <año>
```

El pie institucional («Ayuntamiento de Sanlúcar de Barrameda. Cuesta de Belén nº 1.
956388000 / www.sanlucardebarrameda.es») va en el pie de página de la plantilla de
Word, no en el texto. El sistema no lo genera.

## El hallazgo importante: las declaraciones

**Cuatro de las cinco notas llevan una declaración entrecomillada** de la alcaldesa
o del delegado correspondiente. Es parte del formato de la casa, no un adorno
ocasional.

Y es exactamente lo que el sistema **no puede inventar**: una cita atribuida a un
cargo público que esa persona no ha dicho es el peor error posible en este
documento.

Solución adoptada: la nota se genera con la declaración marcada como hueco
explícito, en su sitio y con el cargo correcto, para que el gabinete la rellene o
la borre. Ver `prompts/20-nota-prensa.md`.
