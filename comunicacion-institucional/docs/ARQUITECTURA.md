# Arquitectura — Automatización de comunicación institucional

Sistema multi-cliente de generación y aprobación de comunicación institucional para
ayuntamientos y grupos políticos.

**Decisiones tomadas** (2026-08-10):

- Enfoque **low-code**: n8n + Baserow autoalojados, mínimo código posible.
- Piloto con **actas reales del Ayuntamiento de Sanlúcar de Barrameda**, con permiso.
- Salida del MVP: **contenido listo para publicar + envío a lista de prensa**. Sin publicación
  automática en redes.
- Formato de las actas: **por verificar antes del día 1** (ver `PLAN-MVP.md`, Día 0).

---

## 1. El stack

Todo autoalojado en un único servidor europeo, con Docker Compose:

```
┌─ VPS europeo (Hetzner DE / Scaleway FR) ──────────────────┐
│                                                            │
│   n8n            orquestación: ingesta, prompts, envíos    │
│   Baserow        datos + panel de revisión y aprobación    │
│   Postgres       backend de ambos                          │
│   Caddy          TLS y dominio                             │
│                                                            │
└──────────────┬────────────────────────┬────────────────────┘
               │                        │
     Claude vía Bedrock            Brevo (FR)
     eu-central-1 (Frankfurt)      envío a prensa
     generación de texto
```

**Por qué esta combinación.** n8n aporta la orquestación visual y los conectores; Baserow
aporta lo que a n8n le falta y es imprescindible aquí: una interfaz de tablas donde una persona
no técnica ve el contenido generado, lo edita y lo aprueba. Ese panel es el corazón del
producto, y en Baserow existe sin escribir una línea.

**Por qué no Make.com.** Make es SaaS estadounidense. Para sector público español obliga a
justificar transferencias internacionales de datos y el cliente no controla dónde están sus
documentos. n8n autoalojado en un servidor europeo elimina esa conversación entera, no tiene
coste por operación, y los workflows se pueden exportar como JSON y versionar en este mismo
repositorio.

**Por qué Baserow y no Airtable/NocoDB.** Airtable es SaaS estadounidense — mismo problema que
Make. Baserow es europeo (Países Bajos), open source y autoalojable, tiene webhooks nativos
(imprescindibles para disparar workflows de n8n al aprobar) e historial de cambios por fila
(que es la mitad de la trazabilidad institucional que necesitas). NocoDB es una alternativa
válida; Baserow gana por los webhooks y por el historial.

### Una limitación que conviene conocer ahora

Baserow open source tiene roles a nivel de *workspace* (admin / miembro), no permisos por campo.
En la práctica: **cualquiera con acceso de edición puede cambiar el estado de una pieza a
"aprobado"**. La separación estricta editor/aprobador requiere la edición de pago de Baserow
(RBAC), o mover el panel a código.

Para el piloto con un gabinete pequeño esto es asumible: quien edita y quien aprueba suelen ser
la misma persona o dos personas que se hablan. Cuando entre un ayuntamiento con jefatura de
gabinete separada y firma política, hay que resolverlo — o pagando RBAC, o programando el panel.
No es un problema del día 1, pero es el primer sitio por donde este diseño se rompe.

## 2. Insight de producto: la unidad de trabajo no es el acta

Un acta de pleno tiene entre 30 y 200 páginas y contiene entre 10 y 30 acuerdos. **No produce
una nota de prensa: produce N.** Y de esos N, sólo 2 o 3 son noticiables.

Por eso hay un paso de selección humana *antes* de generar:

```
PDF del acta
   ↓  [n8n] extrae y trocea
   ↓  [Claude] segmenta en puntos del orden del día
Baserow: tabla PUNTOS
   ↓  [HUMANO] marca la casilla "noticiable"      ← barato, alto valor
   ↓  [webhook → n8n] genera sólo los marcados
Baserow: tabla PIEZAS (nota + X + Facebook + Instagram)
   ↓  [HUMANO] edita el texto, cambia estado a "aprobado"
   ↓  [webhook → n8n] envía
Brevo → lista de prensa    +    texto listo para copiar
```

Saltarse el paso de selección significa generar 30 notas de prensa de las que se tiran 27,
quemando tokens y paciencia del usuario.

## 3. Modelo de datos en Baserow

Una base de datos **plantilla**, con estas tablas:

| Tabla | Campos clave |
|---|---|
| `config` | tenant, nombre oficial del ayuntamiento, alcalde/sa, tratamientos, hashtags, tono, longitudes por canal, lista de prensa en Brevo |
| `ejemplos` | tenant, canal, texto de una nota de prensa real anterior (5–10 filas) |
| `fuentes` | tenant, tipo (acta/acuerdo/nota bruta/evento), fichero, fecha de sesión, estado, texto extraído |
| `puntos` | fuente, orden, título, texto del acuerdo, **noticiable** (casilla) |
| `piezas` | punto, canal (nota/X/Facebook/Instagram/boletín), **contenido** (texto largo, editable), **estado** (borrador/en revisión/aprobado/rechazado/publicado), fragmento fuente, aviso de validación, aprobado_por, aprobado_en |
| `contactos` | tenant, nombre, email, medio, tipo (prensa/vecinos/asociaciones/cargos), etiquetas, **base legal**, fecha y origen del consentimiento, baja |
| `envios` | pieza, segmento, nº enviados, fecha |

Tres cosas que parecen detalle y no lo son:

- **`fragmento fuente` en cada pieza.** Es lo que permite al revisor comprobar de un vistazo que
  lo generado se corresponde con lo que dice el acta. Sin esto, revisar es leer el acta entera.
- **`aprobado_por` y `aprobado_en`**, escritos por n8n al detectar el cambio de estado. Sumados
  al historial de filas de Baserow, cubren la pregunta "¿quién aprobó esta nota?", que en una
  institución pública se acaba haciendo.
- **`base legal` y `fecha de consentimiento` en contactos desde el minuto uno.** Añadirlo después
  obliga a auditar una base ya poblada, que es mucho peor que hacerlo bien de entrada.

### Multi-cliente

**Un workspace de Baserow por ayuntamiento**, duplicando la base plantilla. Aislamiento real —
el personal de un ayuntamiento sólo ve su workspace— y sin la fragilidad de filtrar por columna
`tenant` confiando en que nadie borre el filtro de una vista.

Los workflows de n8n son **únicos y parametrizados**: leen la tabla `config` del tenant que
corresponda. Dar de alta un ayuntamiento nuevo es:

1. Duplicar la base plantilla en un workspace nuevo.
2. Rellenar `config` (nombre oficial, cargos, hashtags, tono).
3. Subir 5–10 notas de prensa históricas suyas a `ejemplos`.
4. Añadir una fila al mapa de tenants de n8n.

Un par de horas, no un proyecto. Eso es lo que significa "multi-cliente desde el diseño" aquí.

## 4. Separación de planos: generación vs. datos personales

Decisión de diseño que simplifica enormemente el cumplimiento:

**El modelo de IA nunca ve la tabla de contactos.** La generación opera sobre documentos
institucionales; la segmentación y el envío operan sobre contactos. Son dos planos que sólo se
tocan en el último paso — enviar una pieza *ya aprobada* a un segmento— y ese paso no involucra
al LLM.

Consecuencia práctica: en el análisis de riesgos, el proveedor del modelo no es encargado del
tratamiento de los datos de vecinos y periodistas. Sólo procesa documentos que en su mayoría son
información pública.

Matiz que sí aplica: **las actas contienen datos personales.** Nombres de concejales (cargos
públicos, riesgo bajo) y a veces datos de ciudadanos en ruegos y preguntas o en expedientes de
personal (riesgo real). Y un **borrador** de acta no aprobada por el pleno no es información
pública. El aislamiento por workspace aplica también aquí.

## 5. Cumplimiento: RGPD y ENS

| Requisito | Cómo se cubre |
|---|---|
| Datos en la UE | n8n, Baserow y Postgres en un VPS europeo. Inferencia en `eu-central-1`. ESP francés. Ningún dato sale de la UE. |
| Modelo de IA | Claude vía **Amazon Bedrock, `eu-central-1` (Frankfurt)**. La inferencia ocurre en región europea, el contrato de encargado es con AWS, y Bedrock no usa las peticiones para entrenar. Alternativa: Google Vertex AI en `europe-west`. |
| ENS | Realista: se documenta la **alineación** con ENS apoyándose en la certificación de AWS para sus regiones europeas. La certificación ENS propia como proveedor es cara y lenta — hito de fase 3, no del MVP. Conviene decírselo así al cliente en vez de prometerla. |
| Encargado del tratamiento | **Contrato art. 28 RGPD firmado con el Ayuntamiento antes de subir el primer acta real.** Es el bloqueante del Día 0. |
| Portabilidad | Todo el stack es Docker Compose. Si un pliego futuro exige AWS eu-central-1 o un proveedor con SecNumCloud, se mueve sin reescribir nada. Esa portabilidad es el verdadero seguro de cumplimiento. |
| Envío de email | **Brevo** (francés). Baja obligatoria en cada envío. No Mailchimp. |
| Base legal de contactos | Periodistas en dirección profesional: interés legítimo / misión pública, defendible. **Vecinos: consentimiento expreso, sin atajos.** Asociaciones: caso por caso. |

**Sobre el hosting:** Hetzner (Alemania) es lo más barato y suficiente para el piloto. Scaleway
u OVH (Francia) son alternativas equivalentes. Si esto llega a una licitación formal, el
argumento más fuerte es mover el stack a AWS `eu-central-1`, donde la certificación ENS del
proveedor es directa. Por eso todo va en Docker.

## 6. IA: modelo, ingesta y control de calidad

**Modelos** (vía el nodo de AWS Bedrock de n8n, región `eu-central-1`):

| Tarea | Modelo | Por qué |
|---|---|---|
| Segmentar el acta en puntos | `anthropic.claude-sonnet-5` | Trabajo de volumen y bajo riesgo. No hace falta el modelo grande. |
| Nota de prensa, posts, boletín | `anthropic.claude-opus-5` | Es la pieza que sale con el nombre del Ayuntamiento. Contexto de 1M tokens: cabe un acta completa sin trocearla. |

Verificar en la consola de Bedrock qué modelos están habilitados en `eu-central-1` para la
cuenta; la disponibilidad varía por región y hay que solicitar acceso a cada modelo.

**Ingesta de PDF — la parte que se simplifica sola.** La API de Claude acepta PDFs directamente
como bloque `document`, y los lee tanto si tienen capa de texto como si son escaneados (los
procesa como imágenes). Eso significa que **probablemente no hace falta un paso de OCR
separado**: el PDF va directo al modelo.

Límites a tener en cuenta: 32 MB por petición y 600 páginas. Un acta escaneada de 200 páginas
puede superar los 32 MB, en cuyo caso hay que trocearla por rangos de páginas — que es un nodo
de n8n, no un proyecto. Esto se confirma el Día 0 con un acta real.

### La regla de calidad que importa más que ninguna otra

**Una nota de prensa municipal con una cifra inventada es un incidente político**, no un bug.
El sistema tiene que hacer estructuralmente difícil que ocurra:

1. El prompt prohíbe explícitamente inventar cifras, fechas, citas textuales y nombres de cargos.
   Lo que no está en el documento, no se escribe.
2. Cada pieza guarda el **fragmento del acta que la respalda**, visible en Baserow al lado del
   texto generado.
3. **Validación automática:** un nodo de n8n extrae toda cifra del texto generado y comprueba
   que aparece en el documento fuente. Si no aparece, la fila se marca con un aviso antes de
   llegar al revisor.
4. Nada sale sin cambio de estado manual a "aprobado", con registro de quién y cuándo.

### El mecanismo de replicabilidad

Lo que hace que la salida suene *a ese ayuntamiento* y no a IA genérica:

- La tabla `config`: nombre oficial exacto, cargos y cómo se nombran, hashtags y perfiles
  oficiales, longitudes por canal, política de lenguaje inclusivo, tono.
- La tabla `ejemplos`: **5–10 notas de prensa reales anteriores del propio ayuntamiento**,
  inyectadas en el prompt. Esto mueve la aguja mucho más que afinar el texto del prompt.

Ambas se leen en tiempo de ejecución, así que el gabinete puede ajustar el estilo editando una
fila de Baserow, sin tocar n8n.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Alucinación de cifras o citas en una nota oficial | Validación automática + fragmento fuente visible + aprobación obligatoria |
| Acta demasiado grande para una petición | Trocear por rangos de páginas en n8n. Se confirma el Día 0. |
| La salida suena a IA y el gabinete no la usa | Ejemplos reales desde la semana 2. El criterio de éxito es tiempo de edición, no volumen generado. |
| Cualquiera puede aprobar (roles de Baserow) | Asumido en el piloto. Se resuelve con RBAC de pago o panel propio cuando entre un cliente con firma política separada. |
| Contactos heredados sin consentimiento documentado | Auditar la base actual antes de importarla. Lo que no tenga base legal clara, no entra. |
| Bloqueo contractual con el Ayuntamiento | El contrato de encargado del tratamiento es el Día 0. Mientras no esté, se trabaja con actas ya publicadas en el portal de transparencia. |
