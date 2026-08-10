# Flujos de n8n

Los cuatro flujos del MVP, descritos nodo a nodo. Se construyen en la interfaz de
n8n y se exportan a JSON en este directorio (`Workflow → Download`) al terminar el
Día 10, para que queden versionados en git junto al resto del proyecto.

Se describen en vez de entregarse ya como JSON a propósito: el JSON de n8n lleva
identificadores de credencial y de nodo propios de cada instalación, y un fichero
escrito a mano sin haberlo importado nunca es más probable que dé un error de
importación que ahorrar tiempo. Construirlos siguiendo esta guía lleva menos.

---

## Credenciales a dar de alta primero

| Credencial | Tipo en n8n | Notas |
|---|---|---|
| AWS (Bedrock) | *AWS* | Región `eu-central-1`. Usuario IAM con `bedrock:InvokeModel` y nada más. |
| Baserow | *Baserow API* | URL interna `http://baserow` (no la pública: el tráfico no sale del stack). Token de base de datos, no la contraseña. |
| Brevo | *Brevo API* | Sólo hace falta en el flujo 4. |

---

## Flujo 1 — Ingesta y segmentación

Dispara cuando se sube un acta a la tabla `fuentes`.

1. **Webhook de Baserow** — configurado en la tabla `fuentes`, evento *row created*.
2. **Baserow: get row** — recupera la fila completa, incluido el fichero.
3. **HTTP Request** — descarga el PDF desde la URL del campo `fichero`.
4. **Baserow: update row** — `estado = procesando`. Si algo falla después, la fila
   no se queda en `pendiente` aparentando que nadie la tocó.
5. **AWS Bedrock** — modelo `anthropic.claude-sonnet-5`, el PDF como bloque
   `document` y el prompt de `prompts/10-segmentar-acta.md`.
6. **Code** — parsea el JSON de la respuesta. Si falla, una rama de reintento
   (una sola vez) antes de dar error.
7. **Baserow: create rows** — un `punto` por elemento, enlazado a la fuente y
   ordenado por `interes` descendente para que lo relevante quede arriba.
8. **Baserow: update row** — `estado = segmentada`, y `paginas`.
9. **Rama de error** (*Error Trigger*) — escribe el mensaje en `fuentes.error` y
   pone `estado = error`. Sin esto, un acta que falla desaparece en silencio.

## Flujo 2 — Generación de piezas

Dispara al marcar la casilla `noticiable` de un punto.

1. **Webhook de Baserow** — tabla `puntos`, evento *row updated*.
2. **IF** — sigue sólo si `noticiable = true` **y** `generado = false`. Baserow
   dispara el webhook en cada edición de la fila; sin esta condición se
   regeneraría el contenido cada vez que alguien toca cualquier campo.
3. **Baserow: get rows** — lee `config` (una fila) y `ejemplos` (donde `usar = true`).
4. **Code** — monta el prompt de sistema de `prompts/00-sistema.md` sustituyendo
   los `{{campos}}` e inyectando los ejemplos.
5. **AWS Bedrock** — `anthropic.claude-opus-5`, prompt de `prompts/20-nota-prensa.md`.
6. **Code — validación de cifras** — pegar `validar-cifras.js`. Devuelve
   `validacion_ok` y `aviso_validacion`.
7. **Baserow: create row** — la pieza `nota_prensa`, con `estado = borrador`,
   `fragmento_fuente` = texto del punto, y el resultado de la validación.
8. **AWS Bedrock** — `prompts/30-redes.md`, partiendo de la nota ya generada.
9. **Code** — separa por `===X===` / `===FACEBOOK===` / `===INSTAGRAM===` y
   comprueba el límite de caracteres de X. Si se pasa, reintenta una vez.
10. **Baserow: create rows** — las tres piezas de redes.
11. **Baserow: update row** — `puntos.generado = true`.

## Flujo 3 — Sellado de aprobación

Dispara al cambiar el estado de una pieza. Es lo que convierte un cambio de
desplegable en un registro de quién aprobó qué.

1. **Webhook de Baserow** — tabla `piezas`, evento *row updated*.
2. **IF** — sigue sólo si `estado = aprobado` y `aprobado_en` está vacío.
3. **Baserow: update row** — escribe `aprobado_en` (fecha y hora actuales) y
   `aprobado_por` con el usuario que envía el webhook.

> El historial de filas de Baserow ya guarda quién cambió qué y cuándo. Este flujo
> lo copia a campos propios porque ese historial no se puede consultar desde un
> filtro ni exportar a un informe, y "enséñame todas las notas aprobadas en marzo
> y por quién" es una pregunta que en una institución pública se acaba haciendo.

## Flujo 4 — Envío a un segmento

Dispara a mano desde n8n, con el id de la pieza y el segmento.

1. **Manual Trigger** (o formulario de n8n).
2. **Baserow: get row** — la pieza. **IF**: parar si `estado != aprobado`. Nada
   sale sin aprobación, y el sitio para garantizarlo es aquí, no en la interfaz.
3. **Baserow: get rows** — `contactos` filtrando por `tipo`/`etiquetas` del
   segmento y `baja = false`.
4. **Code** — descarta los que no tengan `base_legal` rellena. Un contacto sin
   base legal documentada no recibe correo: es más barato no enviarlo que
   justificarlo después.
5. **Brevo** — envío transaccional a la lista, con enlace de baja.
6. **Baserow: create row** — registro en `envios` con el número de destinatarios.
7. **Baserow: update row** — `piezas.estado = publicado`.

---

## Al terminar el Día 10

```bash
# Exportar cada flujo desde la interfaz y guardarlo aquí:
#   n8n → Workflow → ⋯ → Download
git add n8n/*.json && git commit -m "Exportar flujos de n8n"
```

Los JSON exportados **no** contienen los secretos de las credenciales, sólo sus
identificadores. Aun así, conviene revisarlos antes del primer commit.
