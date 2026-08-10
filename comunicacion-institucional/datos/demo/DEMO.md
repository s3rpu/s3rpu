# Demostración del flujo, con un caso real de Sanlúcar

Recorrido completo de una pieza, desde los datos en bruto hasta el contenido listo
para aprobar. Usa el caso del paro de julio porque está lleno de cifras, que es
donde más se juega el sistema.

**Qué es real y qué no:** los textos generados los he escrito yo siguiendo los
prompts del repositorio, no los ha producido el sistema montado — n8n y Baserow
todavía no están levantados. Lo que sí se ha ejecutado de verdad es la validación
de cifras: las salidas de más abajo son la ejecución real de
`n8n/validar-cifras.js` sobre estos textos.

---

## Paso 1 — Entrada

Lo que llega al gabinete. En este caso, la nota del SEPE:

```
Paro registrado. Julio 2026. Sanlúcar de Barrameda.
Fuente: Servicio Público de Empleo Estatal (SEPE), datos publicados hoy.

- Julio 2026: 5.243 personas desempleadas
- Junio 2026: 5.434 personas desempleadas
- Variación mensual: -191 personas (-3,51%)
- Es el dato más bajo de toda la serie histórica; supera el anterior mínimo,
  que era el del mes pasado
- Inicio del mandato (mediados de 2023): 7.504 personas desempleadas
- Reducción acumulada desde entonces: 2.261 personas, más del 30%
```

Se sube a la tabla `fuentes` de Baserow. Eso es todo lo que hace la persona.

## Paso 2 — Nota de prensa generada

Con el estilo sacado de vuestras cinco notas: titular en mayúsculas sin punto,
subtítulo, cuerpo denso en datos, línea de fecha.

```
EL PARO BAJA EN SANLÚCAR EN 191 PERSONAS Y MARCA EL MÍNIMO DE TODA LA SERIE HISTÓRICA

El desempleo se sitúa en 5.243 personas en julio, la cifra más baja registrada en la
ciudad desde que existen datos

El número de personas desempleadas en Sanlúcar se ha situado en 5.243 en el mes de
julio, según los datos de paro registrado hechos públicos hoy por el Servicio Público
de Empleo Estatal (SEPE). Se trata de la cifra más baja de toda la serie histórica en
la ciudad.

En la comparativa mensual, el desempleo ha pasado de 5.434 personas en junio a 5.243
en julio, lo que supone 191 parados menos y un descenso del 3,51% respecto al mes
anterior. El dato supera el anterior mínimo histórico, que se había alcanzado el mes
pasado.

La evolución confirma la tendencia a la baja iniciada a mediados de 2023, cuando
comenzó el actual mandato municipal con 7.504 personas en situación de desempleo.
Desde entonces, el paro se ha reducido en 2.261 personas, lo que representa una caída
superior al 30%.

[DECLARACIÓN PENDIENTE — alcaldesa Carmen Álvarez]

Sanlúcar, a 10 de agosto de 2026
```

**Fíjate en el corchete.** Cuatro de vuestras cinco notas llevan declaración de la
alcaldesa o del delegado. El sistema deja el hueco en su sitio y con el cargo
correcto, pero **nunca escribe la cita**: una declaración atribuida a un cargo
público que no la ha dicho es el error que no se puede permitir. Rellenarlo son diez
segundos; desmentirlo, una semana.

## Paso 3 — Validación de cifras (ejecución real)

```
=== VALIDACIÓN DE LA NOTA GENERADA ===
validacion_ok: true | avisos: 0
(sin avisos: todas las cifras están en la fuente)
```

Ahora la misma nota con dos cifras cambiadas a mano, para ver saltar el aviso:

```
=== MISMA NOTA CON DOS CIFRAS ALTERADAS ===
validacion_ok: false | avisos: 2
Cifras que NO aparecen en el documento fuente — comprobar antes de aprobar:
  • 5.143  →  «…as desempleadas en Sanlúcar se ha situado en 5.143 en el mes de julio, según los datos de paro…»
  • 171    →  «…nas en junio a 5.243 en julio, lo que supone 171 parados menos y un descenso del 3,51% respec…»
```

Las dos alteraciones detectadas, con el contexto para localizarlas de un vistazo. Y
ni un solo aviso falso sobre las otras siete cifras de la nota, que es lo que
importa: un validador que avisa de todo es un validador que nadie lee.

## Paso 4 — Adaptaciones a redes

Salen de la nota ya generada, no de los datos brutos, para que las tres cuenten lo
mismo y baste con revisar una vez que el hecho es correcto.

**X** — 205 caracteres, dentro del límite de 270:

```
El paro baja en Sanlúcar en 191 personas durante julio y se sitúa en 5.243
desempleados, la cifra más baja de toda la serie histórica. Desde 2023 el desempleo
se ha reducido en 2.261 personas en la ciudad.
```

**Facebook** — 74 palabras:

```
Sanlúcar cierra julio con 5.243 personas desempleadas, la cifra más baja registrada
desde que existen datos. En un solo mes el paro ha bajado en 191 personas, un 3,51%
menos que en junio.

La tendencia viene de lejos: desde mediados de 2023, cuando comenzó el actual mandato
municipal, el desempleo en la ciudad se ha reducido en 2.261 personas, una caída
superior al 30%.

Datos del Servicio Público de Empleo Estatal (SEPE) publicados hoy.
```

**Instagram** — 38 palabras, pie para la imagen que monte el gabinete:

```
Sanlúcar marca su mínimo histórico de paro: 5.243 personas desempleadas en julio,
191 menos que en junio.

Desde 2023 el desempleo en la ciudad ha bajado en 2.261 personas, más de un 30%.

Datos del SEPE publicados hoy.
```

Comprobación de las tres, ejecutada:

```
X          205 caracteres (límite 270) → OK       cifras: todas verificadas
FACEBOOK   74 palabras                            cifras: todas verificadas
INSTAGRAM  38 palabras                            cifras: todas verificadas
```

Las tres van sin hashtags porque vuestras notas no los usan. Cuando me digas los de
X e Instagram, se añaden en la fila de `config` y aparecen solos.

## Paso 5 — Aprobación

Las cuatro piezas aparecen en la tabla `piezas` de Baserow en estado `borrador`, con
el texto editable, el fragmento de origen al lado y el resultado de la validación.

El gabinete rellena la declaración, retoca lo que quiera y cambia el desplegable a
`aprobado`. Ese cambio sella quién aprobó y cuándo, y habilita el envío a la lista de
prensa. Nada sale sin ese paso.

---

## Lo que esta demo no demuestra

- **Que el modelo escriba así de bien con vuestras actas.** Estos textos los he
  escrito yo siguiendo los prompts. Que el modelo los reproduzca con esta fidelidad
  es lo que hay que comprobar el primer día con material real, y es exactamente para
  lo que sirven las cinco notas de la tabla `ejemplos`.
- **La segmentación de un acta**, que es el paso más frágil. Necesito el acta.
- **Los tiempos y el coste por nota**, que sólo salen ejecutando de verdad.
