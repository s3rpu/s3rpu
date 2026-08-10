# Arquitectura — Automatización de comunicación institucional

Propuesta de arquitectura para un SaaS multi-cliente de generación y aprobación de
comunicación institucional para ayuntamientos y grupos políticos.

Estado: **propuesta, pendiente de validar con el cliente piloto.** No hay código todavía.

---

## 1. Decisión central: qué se construye y qué se delega

| Capa | Decisión | Por qué |
|---|---|---|
| Panel de revisión/aprobación | **Código propio** (Next.js + Postgres) | Es el corazón del producto y donde está la responsabilidad institucional (quién aprobó qué y cuándo). En Make/n8n esto se convierte en un Airtable frágil sin trazabilidad ni control de acceso por rol. |
| Prompts, manual de estilo, generación | **Código propio**, versionado en git | Es el activo diferencial. Debe ser testeable y reproducible: un cambio de prompt que degrada la calidad de una nota de prensa tiene que poder revertirse. |
| Ingesta (acta/PDF → texto) | **Código propio** (extracción de texto; OCR sólo si hace falta) | Poco código, y evita depender de un servicio externo con los documentos municipales. |
| Publicación / distribución (RRSS, email, web) | **n8n autoalojado** | Es lo que cambia por cliente: una publica en Facebook, otra sólo manda email a prensa, otra tiene WordPress. Un conector visual editable sin tocar código es exactamente la herramienta correcta aquí. |

**n8n en lugar de Make.com.** Make es SaaS estadounidense: para sector público español obliga a justificar transferencias internacionales y el cliente no controla dónde están los datos. n8n autoalojado en la misma VPC europea que la aplicación elimina esa conversación entera, no tiene coste por operación y permite versionar los workflows.

**Y no en el MVP.** No se conecta n8n hasta la semana 3. La primera versión termina en "contenido aprobado + exportar/copiar + enviar por email a la lista de prensa". Montar la fontanería de publicación automática antes de saber si la generación es lo bastante buena es construir sobre arena — y en la práctica los gabinetes de comunicación publican a mano de todas formas.

## 2. Insight de producto: la unidad de trabajo no es el acta

Un acta de pleno de Sanlúcar tiene entre 30 y 200 páginas y contiene entre 10 y 30 acuerdos. **No produce una nota de prensa: produce N.** Y de esos N acuerdos, sólo 2 o 3 son noticiables.

Por eso el flujo tiene un paso de segmentación y selección humana *antes* de generar:

```
Documento → [IA] segmenta en puntos del orden del día
          → [HUMANO] marca cuáles son noticiables      ← paso barato, alto valor
          → [IA] genera piezas sólo de los marcados     ← paso caro, así no se desperdicia
          → [HUMANO] edita y aprueba
          → Salida
```

Saltarse esto significa generar 30 notas de prensa de las que se tiran 27, quemando tokens y
paciencia del usuario.

## 3. Modelo de datos (multi-cliente desde el diseño)

Multi-tenancy: **una sola base de datos, columna `tenant_id` en todas las tablas, Row Level
Security de Postgres.** No schema-por-cliente (multiplica el coste operativo de las
migraciones) ni base-por-cliente (inviable con 5 ayuntamientos y una sola persona
manteniéndolo). RLS hace que un fallo en la capa de aplicación no filtre datos entre
ayuntamientos: la barrera está en la base de datos.

```
tenant            id, nombre, dominio, config_estilo (jsonb), activo
usuario           id, tenant_id, email, rol (editor|aprobador|admin)
fuente            id, tenant_id, tipo (acta|acuerdo|nota_bruta|evento),
                  fichero_url, texto_extraido, fecha_sesion, estado
punto             id, fuente_id, orden, titulo, texto, es_noticiable (bool)
pieza             id, punto_id, canal (nota_prensa|x|facebook|instagram|boletin),
                  contenido, version, estado (borrador|revision|aprobado|rechazado|publicado)
pieza_evento      id, pieza_id, usuario_id, accion, contenido_anterior, timestamp   ← auditoría
contacto          id, tenant_id, nombre, email, medio, tipo, etiquetas[],
                  base_legal, fecha_consentimiento, origen_consentimiento, baja_en
envio             id, tenant_id, pieza_id, segmento, enviados, aperturas, fecha
```

Dos cosas que parecen detalles y no lo son:

- **`pieza_evento` es obligatorio, no opcional.** En una institución pública, "¿quién aprobó
  esta nota?" es una pregunta que se acaba haciendo. El historial de quién editó, quién
  aprobó y qué decía antes es parte del producto.
- **`base_legal` y `fecha_consentimiento` en contactos, desde el minuto uno.** Añadir esto
  después obliga a auditar una base de datos ya poblada, que es mucho peor.

## 4. Separación de planos: generación vs. datos personales

Decisión de diseño que simplifica enormemente el cumplimiento RGPD:

**El modelo de IA nunca ve la base de datos de contactos.** La generación de texto opera sobre
documentos institucionales; la segmentación y el envío operan sobre contactos. Son dos planos
que sólo se tocan en el último paso (envío de una pieza *ya aprobada* a un segmento), y ese
paso no involucra al LLM.

Consecuencia práctica: en el análisis de riesgos, el proveedor del modelo no es un encargado
del tratamiento de los datos de vecinos y periodistas. Sólo procesa documentos que en su
mayoría son información pública.

Matiz importante: las **actas contienen datos personales** — nombres de concejales (cargos
públicos, riesgo bajo) y a veces datos de ciudadanos en ruegos y preguntas o expedientes de
personal (riesgo real). Y un **borrador** de acta no aprobada no es información pública. El
control de acceso por rol y por tenant aplica también aquí.

## 5. Cumplimiento: RGPD y ENS

| Requisito | Cómo se cubre |
|---|---|
| Datos en la UE | Todo el stack desplegado en región europea. La aplicación se empaqueta en **contenedor Docker + Postgres**, sin dependencias de servicios propietarios de un proveedor. Esa portabilidad es el verdadero seguro de cumplimiento: si un pliego exige otro proveedor, se mueve sin reescribir. |
| Modelo de IA en la UE | Claude vía **Amazon Bedrock** (`eu-central-1` Frankfurt o `eu-west-3` París) o **Google Vertex AI** (`europe-west`). En ambos casos la inferencia ocurre en región europea y el contrato de encargado del tratamiento es con AWS/Google, ambos con certificación ENS para sus regiones europeas. Bedrock no usa las peticiones para entrenar. |
| Certificación ENS | Realista: para el MVP y el primer cliente se documenta la **alineación** con ENS (medidas de la categoría correspondiente) apoyándose en las certificaciones del proveedor cloud. La certificación ENS propia como proveedor es cara y lenta; es un hito de fase 3, no del MVP. Conviene decirlo así al cliente en lugar de prometerlo. |
| Encargado del tratamiento | Contrato art. 28 RGPD entre tú y cada ayuntamiento. Registro de actividades de tratamiento. |
| Envío de email | ESP europeo: Brevo o Mailjet (FR), o Acumbamail (ES). **No Mailchimp.** Baja obligatoria en cada envío. |
| Base legal de los contactos | Periodistas en su dirección profesional: interés legítimo/misión pública, defendible. **Vecinos: consentimiento expreso, sin atajos.** Asociaciones: caso por caso. |

## 6. Modelo de IA y control de calidad

- **Principal: `claude-opus-5`** — vía Bedrock (`anthropic.claude-opus-5`) o Vertex. Ventana de
  contexto de 1M tokens, que es lo que permite meter un acta completa sin trocearla, y
  calidad de castellano institucional muy alta.
- **`claude-sonnet-5`** para las tareas de volumen y bajo riesgo (segmentar el acta en puntos,
  resumir), donde no hace falta el modelo grande.
- **Detrás de una interfaz de proveedor**, con el modelo como configuración por tenant. Permite
  añadir una opción europea (Mistral) si un pliego exige tecnología europea — buen argumento
  comercial en licitación pública, aunque técnicamente no sea necesario.
- Pensar en **efecto de esfuerzo (`effort`)** como palanca de coste: `high` para la nota de
  prensa, `low`/`medium` para segmentar.

### La regla de calidad que importa más que ninguna otra

**Una nota de prensa municipal con una cifra inventada es un incidente político.** El sistema
tiene que hacer estructuralmente difícil que eso pase:

1. El prompt prohíbe explícitamente inventar cifras, fechas, citas textuales y nombres de
   cargos. Lo que no está en el documento, no se escribe.
2. Cada pieza generada guarda **el fragmento del acta que la respalda**. El panel muestra el
   texto original al lado del generado.
3. **Validación automática post-generación:** toda cifra que aparezca en el texto generado se
   comprueba contra el documento fuente. Si no aparece, la pieza se marca en rojo antes de
   llegar al revisor.
4. Nada sale sin aprobación humana explícita. El botón de aprobar registra quién y cuándo.

### El mecanismo de replicabilidad

Lo que hace que la salida suene *a ese ayuntamiento* y no a IA genérica es la configuración por
tenant:

- Tratamientos y nomenclatura ("el Ayuntamiento de Sanlúcar de Barrameda", nunca "el consistorio
  sanluqueño" si no es su estilo), cargos correctos y cómo se nombran.
- Hashtags y perfiles oficiales, longitudes por canal, política de lenguaje inclusivo, tono.
- **5–10 notas de prensa reales anteriores como ejemplos few-shot.** Esto es lo que más mueve la
  aguja, mucho más que afinar el prompt.

Dar de alta un ayuntamiento nuevo = rellenar esa configuración + subir 10 notas históricas.
Un par de horas, no un proyecto.

## 7. Stack

```
Next.js (App Router) + TypeScript          panel + API
Postgres + RLS                             datos, multi-tenant
S3 compatible europeo (Scaleway/MinIO)     documentos originales
Auth: magic link por email + roles         editor / aprobador / admin
Claude vía Bedrock EU o Vertex EU          generación
ESP europeo (Brevo / Acumbamail)           envío a segmentos
n8n autoalojado (fase 2)                   publicación en RRSS / web
Todo en Docker                             portabilidad = cumplimiento
```

Sin Redis, sin cola de mensajes, sin microservicios en el MVP. Una tabla `job` en Postgres cubre
el procesamiento asíncrono de documentos largos con una fracción de la complejidad.

## 8. Plan de MVP: 2 semanas, un caso de uso real

**Caso de uso:** acta de pleno del Ayuntamiento de Sanlúcar → selección de acuerdos noticiables
→ nota de prensa + 3 posts de RRSS → revisión y aprobación → envío a la lista de prensa.

### Semana 1 — que funcione de punta a punta

| Día | Entrega |
|---|---|
| 1 | Esquema de BD con RLS, auth, tenant Sanlúcar dado de alta |
| 2 | Subida de PDF, extracción de texto, almacenamiento |
| 3 | Segmentación del acta en puntos del orden del día + pantalla de selección |
| 4 | Generación: nota de prensa + post X + post Facebook + pie de Instagram |
| 5 | Panel: ver, editar, aprobar/rechazar, con el fragmento fuente al lado |

Al final de la semana 1 se puede enseñar el sistema funcionando con un acta real.

### Semana 2 — que sea *usable* y suene a ellos

| Día | Entrega |
|---|---|
| 6 | Manual de estilo por tenant + ejemplos few-shot inyectados en el prompt |
| 7 | Validación de cifras contra el documento fuente + aviso visual |
| 8 | Historial de versiones y auditoría de aprobación |
| 9 | Contactos: importar CSV, etiquetar, segmentar; envío por ESP con baja |
| 10 | Endurecimiento multi-tenant, exportar a DOCX/copiar, prueba con un acta real completa |

### Fuera del MVP, deliberadamente

- Publicación automática en redes (Instagram exige cuenta business + página de Facebook + Graph
  API + imagen obligatoria — es un proyecto en sí mismo).
- n8n / Make.
- OCR de actas escaneadas (se asume PDF con texto; si el piloto los tiene escaneados, esto sube
  a la semana 1 y algo más baja).
- Editor de boletines, analítica, portal público.
- Certificación ENS formal.

### Criterio de éxito

No es "el sistema genera texto". Es: **el responsable de comunicación coge una nota generada,
la edita en menos de 5 minutos y la aprueba.** Si edita 20 minutos, el ahorro de tiempo es
ficticio y hay que trabajar en el manual de estilo y los ejemplos, no en más funcionalidades.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Alucinación de cifras o citas en una nota oficial | Validación automática + fragmento fuente visible + aprobación obligatoria |
| Actas escaneadas sin capa de texto | Verificar con documentos reales **antes** de empezar; si es el caso, OCR entra en el alcance |
| La salida suena a IA y el gabinete no la usa | Ejemplos few-shot reales desde la semana 2; el criterio de éxito es tiempo de edición, no volumen generado |
| Contactos heredados sin consentimiento documentado | Auditar la base actual antes de migrarla; los que no tengan base legal clara no se importan |
| Contratación pública lenta | El piloto se hace con datos públicos o con acuerdo de colaboración; no bloquear el desarrollo esperando a un contrato |
