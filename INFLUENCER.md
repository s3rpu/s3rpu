# Piloto automático de redes sociales

Programa que se encarga de todo el ciclo de una cuenta de creador de contenido:
piensa las ideas, las coloca en un calendario, escribe cada publicación adaptada
a cada red, la publica a su hora, recoge las métricas y usa lo que mejor
funciona para pensar las ideas siguientes.

```
ideas → calendario → redacción por red → publicación → métricas
  ↑                                                        │
  └──────────────── aprendizajes ──────────────────────────┘
```

Está en la carpeta `influencer/` y es independiente de la app web del repo.

## Puesta en marcha (2 minutos)

```bash
pip install -r requirements.txt

python -m influencer init      # crea influencer.yml a partir del ejemplo
# edita influencer.yml: persona, nicho, tono, temas, horarios y redes
python -m influencer doctor    # revisa configuración, huecos y credenciales

# Ciclo completo sin tocar ninguna red: los posts se escriben en salida/
python -m influencer run --una-vez --simular
```

Con eso ya tienes el banco de ideas lleno, el calendario de la semana repartido
y los textos escritos. Cuando quieras que publique de verdad, quita `--simular`
y activa las redes en el YAML.

Para dejarlo funcionando solo:

```bash
python -m influencer run                  # bucle, un ciclo cada 15 minutos
python -m influencer run --intervalo 3600 # o cada hora
```

O sin proceso propio: el workflow `.github/workflows/influencer.yml` ejecuta un
ciclo cada hora en GitHub Actions.

## Comandos

| Comando | Qué hace |
|---|---|
| `init` | Crea un `influencer.yml` de ejemplo |
| `doctor` | Revisa el YAML, muestra los próximos huecos y qué credenciales faltan |
| `ideas` | Rellena el banco de ideas (`--listar` para verlas, `-n` para forzar cantidad) |
| `plan` | Reparte las ideas pendientes en los huecos libres del calendario |
| `escribir` | Convierte los borradores en textos listos, uno por red |
| `cola` | Lista lo que va a salir y cuándo |
| `ver <id>` | Muestra una publicación entera tal y como se enviará |
| `publicar` | Publica lo que ya toca (`--id N` para forzar una concreta) |
| `metricas` | Actualiza las estadísticas de lo publicado |
| `informe` | Resumen del canal: cola, rendimiento por red y qué funciona mejor |
| `run` | Encadena todo lo anterior (`--una-vez` para cron) |

Flags globales, válidos antes o después del subcomando:

- `--simular`: no llama a ninguna red; escribe cada post en `salida/` como Markdown.
- `--sin-api`: no usa la API de Claude aunque haya credenciales.
- `-c ruta.yml`: usa otro fichero de configuración.

## Cómo decide qué publicar

**Ideas.** Mantiene siempre `ideas_minimas` ideas sin usar. Al pedir ideas
nuevas le pasa al modelo las que ya existen (para que no repita) y las
publicaciones con más interacciones (para que insista en lo que funciona).

**Calendario.** Cada franja del YAML dice qué días, a qué horas y en qué redes
se publica. El programa calcula los huecos futuros en tu zona horaria y les
asigna ideas. Las redes que coinciden en el mismo instante comparten idea: es
la misma publicación adaptada a cada una, no contenidos distintos.

**Redacción.** Cada red tiene su límite de caracteres, su número máximo de
hashtags y su estilo. El texto se genera con esos límites en el prompt y además
se recorta por código, así que nunca se envía un texto que la API vaya a
rechazar por largo.

**Publicación.** Solo sale lo que tiene fecha vencida y estado `lista`. Si una
publicación falla se reintenta en el siguiente ciclo hasta `reintentos` veces;
después queda marcada como `fallida` con el motivo, visible en `informe`.

**Métricas.** Se consultan en las redes que las exponen (Mastodon, X, Instagram)
y alimentan el informe y las ideas siguientes.

## Configuración

Todo vive en `influencer.yml` (ver `influencer.example.yml` con comentarios).

```yaml
persona:
  nombre: "Mi Progreso"
  nicho: "entrenamiento de fuerza en casa"
  audiencia: "gente que entrena por su cuenta"
  tono: "cercano, directo, sin humo"
  temas: [rutinas de fuerza, progresión de cargas]
  evitar: [dietas milagro]
  cta_por_defecto: "¿Lo pruebas esta semana?"

modelo:
  id: claude-opus-5     # o claude-sonnet-5 / claude-haiku-4-5
  esfuerzo: medium      # low | medium | high | xhigh | max

plataformas:
  - nombre: telegram
    activa: true
    credenciales:
      token: ${TELEGRAM_BOT_TOKEN}   # se lee del entorno, no se escribe aquí

calendario:
  zona_horaria: Europe/Madrid
  franjas:
    - dias: [lun, mie, vie]
      horas: ["09:00", "19:30"]
      plataformas: [telegram]        # vacío = todas las activas
```

Las credenciales se referencian con `${VARIABLE}` y se leen del entorno, así que
el YAML se puede subir al repo sin filtrar nada.

## Redes soportadas

| Red | Credenciales | Métricas |
|---|---|---|
| `simulacion` | ninguna (escribe en `salida/`) | — |
| `telegram` | `token`, `chat_id` | — |
| `discord` | `webhook` | — |
| `mastodon` | `instancia`, `token` | favoritos, respuestas, impulsos |
| `x` | `token` (OAuth 2.0 de usuario) | impresiones, likes, respuestas, RT |
| `linkedin` | `token`, `autor` (`urn:li:...`) | — |
| `instagram` | `token`, `usuario_id` (Graph API) | impresiones, alcance, likes, guardados |

Instagram exige una imagen o vídeo en una URL pública: se toma de `imagen_url`
de la publicación o de la credencial `imagen_defecto`. TikTok y YouTube no
tienen publicador: sus APIs requieren subir el vídeo, que este programa no
genera; el contenido para ellas se redacta igual (con el campo `visual` como
guion) y se puede sacar con `--simular` para publicarlo a mano.

## Sin API de Claude

Si no hay `ANTHROPIC_API_KEY` (o no está instalado el paquete `anthropic`), el
programa **no falla**: cambia a un generador de plantillas local y el workflow
completo sigue funcionando. Es útil para probar el calendario y la publicación
sin gastar tokens. `doctor` te dice qué motor está activo, y cada publicación
guarda en `generado_por` cuál la escribió.

Lo mismo pasa si la API falla a mitad de un ciclo: se registra el aviso y se
usa la plantilla para ese contenido en vez de dejar el hueco vacío.

## Estado y datos

Todo el estado está en `influencer.db` (SQLite): `ideas`, `publicaciones`,
`metricas` y `eventos` (bitácora). Se puede consultar con cualquier cliente de
SQLite y borrar para empezar de cero.

## Pruebas

```bash
python -m unittest discover -s tests -v
```

30 pruebas que cubren configuración, calendario, límites por red, ciclo
completo, reintentos y el trato con la API (con un cliente falso). No tocan la
red ni necesitan credenciales.

## Aviso

El programa publica **tu** contenido en **tus** cuentas. No automatiza
seguimientos masivos, mensajes directos en frío ni interacciones falsas: además
de estar prohibido por los términos de servicio de todas estas plataformas, es
la vía rápida a que te cierren la cuenta. Revisa la cola con `cola` y `ver`
antes de quitar `--simular` por primera vez.
