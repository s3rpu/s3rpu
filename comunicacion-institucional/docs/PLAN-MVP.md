# Plan de MVP — 2 semanas

**Caso de uso único:** acta de pleno del Ayuntamiento de Sanlúcar de Barrameda → selección de
acuerdos noticiables → nota de prensa + posts de RRSS → revisión y aprobación → envío a la lista
de prensa.

Arquitectura y decisiones: ver `ARQUITECTURA.md`.

---

## Día 0 — antes de tocar nada

Tres cosas que bloquean o cambian el plan, y que cuestan una tarde:

| # | Verificación | Si sale mal |
|---|---|---|
| 1 | **Contrato de encargado del tratamiento (art. 28 RGPD)** firmado con el Ayuntamiento | No se sube ni un acta real. Se trabaja con actas ya publicadas en el portal de transparencia mientras tanto — el desarrollo no se para. |
| 2 | **Abrir un acta real y comprobar**: ¿tiene capa de texto o es escaneada? ¿cuánto pesa? ¿cuántas páginas? | Si supera 32 MB, hay que trocear por rangos de páginas: +medio día. Si son escaneadas, Claude las lee igual como imágenes, pero sube el coste por acta. |
| 3 | **Acceso a Bedrock en `eu-central-1`**: solicitar habilitación de `claude-opus-5` y `claude-sonnet-5` en la consola de AWS | La aprobación puede tardar. Pedirla el Día 0, no el Día 4. |

También conviene ya: pedir al gabinete **5–10 notas de prensa suyas de los últimos meses**. Son
el insumo de la semana 2 y suelen tardar en llegar.

---

## Semana 1 — que funcione de punta a punta

| Día | Entrega |
|---|---|
| **1** | Docker Compose en el VPS europeo: n8n + Baserow + Postgres + Caddy con dominio y TLS. Base plantilla creada en Baserow con las 7 tablas. |
| **2** | Workflow de ingesta: subir PDF a Baserow → n8n lo recoge → lo manda a Claude → devuelve los puntos del orden del día → rellena la tabla `puntos`. |
| **3** | Pantalla de selección: vista de Baserow sobre `puntos` con la casilla "noticiable". Webhook al marcarla. |
| **4** | Workflow de generación: por cada punto marcado, genera nota de prensa + post X + post Facebook + pie de Instagram, y los escribe en `piezas` con su fragmento fuente. |
| **5** | Panel de revisión: vista de Baserow sobre `piezas` agrupada por canal, con el texto editable, el fragmento fuente al lado y el campo de estado. Webhook al aprobar que sella `aprobado_por` y `aprobado_en`. |

**Al final del viernes** se coge un acta real de Sanlúcar, se sube, y sale una nota de prensa
aprobable. Eso es lo que se enseña.

---

## Semana 2 — que sea usable y suene a ellos

| Día | Entrega |
|---|---|
| **6** | Tablas `config` y `ejemplos` conectadas al prompt: nombre oficial, cargos, hashtags, tono, longitudes por canal, y las notas históricas como ejemplos. |
| **7** | Validación de cifras: nodo que extrae los números del texto generado y comprueba que aparecen en el documento fuente; marca aviso en la fila si no. |
| **8** | Contactos: importar CSV con auditoría de base legal, etiquetado y vistas por segmento (prensa / vecinos / asociaciones). |
| **9** | Envío: Brevo conectado, workflow de envío al segmento desde una pieza aprobada, con baja obligatoria. Registro en `envios`. |
| **10** | Exportar a DOCX y copiar al portapapeles. Prueba completa con un acta real de principio a fin. Exportar los workflows de n8n a JSON y commitearlos en este repositorio. |

---

## Fuera del alcance, deliberadamente

- **Publicación automática en redes.** Instagram exige cuenta business + página de Facebook +
  Graph API + imagen obligatoria: es un proyecto en sí mismo y se comería la semana 2. En el
  MVP el pie de Instagram se genera como texto para copiar.
- Editor de boletines, analítica de aperturas más allá del contador, portal público.
- Certificación ENS formal.
- Separación estricta de roles editor/aprobador (limitación de Baserow open source — ver
  `ARQUITECTURA.md` §1).
- Segundo ayuntamiento. La plantilla queda lista para duplicarse, pero no se da de alta a nadie
  más hasta que Sanlúcar esté funcionando.

---

## Criterio de éxito

No es "el sistema genera texto". Es:

> **El responsable de comunicación coge una nota generada, la edita en menos de 5 minutos y la
> aprueba.**

Si edita 20 minutos, el ahorro de tiempo es ficticio. La respuesta entonces no son más
funcionalidades: son más ejemplos reales en la tabla `ejemplos` y afinar `config`.

Métrica secundaria, para la conversación comercial con el siguiente ayuntamiento: **tiempo desde
que el acta está disponible hasta que la nota de prensa está aprobada.** Si hoy son dos días y
pasa a ser dos horas, ése es el argumento de venta.
