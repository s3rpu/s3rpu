# Comunicación institucional automatizada

Sistema para ayuntamientos y grupos políticos: de un acta de pleno a una nota de
prensa y sus adaptaciones a redes, con revisión y aprobación humana obligatoria
antes de que salga nada.

Enfoque low-code: **n8n** orquesta, **Baserow** guarda los datos y hace de panel de
revisión, **Claude** (vía Amazon Bedrock en Frankfurt) redacta. Todo autoalojado en
la UE.

- Decisiones y porqués: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- Plan de las dos semanas: [`docs/PLAN-MVP.md`](docs/PLAN-MVP.md)
- Flujos de n8n, nodo a nodo: [`n8n/README.md`](n8n/README.md)

---

## Estado

| Componente | Estado |
|---|---|
| `docker-compose.yml`, `Caddyfile`, `initdb/` | Escrito. **Sin arrancar todavía** (ver abajo). |
| `scripts/esquema.yml` + `crear_base_plantilla.py` | Escrito y validado en seco (`--solo-validar`, `--simulacion`). **Sin ejecutar contra un Baserow real.** |
| `n8n/validar-cifras.js` | **Probado**: 12/12 casos, incluido un acta y una nota realistas. |
| `prompts/` | Escritos. Pendientes de ajustar con actas reales y con los ejemplos del gabinete. |
| Flujos de n8n | Documentados nodo a nodo, pendientes de construir. |

**Por qué no está arrancado:** la política de egreso del entorno donde se escribió
esto bloquea el CDN de imágenes de Docker (`production.cloudfront.docker.com`) y el
dominio `baserow.io`. Ni las imágenes ni la documentación de la API de Baserow eran
alcanzables. El primer paso en el servidor real es, por tanto, levantar el stack y
ejecutar el script del esquema: es donde aparecerá cualquier desajuste con la API
de Baserow, y por eso el script para con el cuerpo del error en vez de continuar
dejando la base a medias.

Las versiones de las imágenes sí están comprobadas contra Docker Hub: Baserow
2.3.3, n8n 2.34.4, Caddy 2.11.4, Postgres 16.

---

## Puesta en marcha

Requisitos: un servidor europeo con Docker y dos subdominios apuntando a su IP.

```bash
git clone <este repositorio>
cd comunicacion-institucional

cp .env.example .env
# Generar los tres secretos:
for n in POSTGRES_PASSWORD BASEROW_SECRET_KEY N8N_ENCRYPTION_KEY; do
  echo "$n=$(openssl rand -hex 32)"
done
# Pegarlos en .env junto con los dominios.

docker compose up -d
docker compose logs -f baserow   # el primer arranque tarda un par de minutos
```

Crear la cuenta de administrador en `https://panel.tudominio.es` y después la base
plantilla:

```bash
cd scripts
python3 -m pip install requests pyyaml

python3 crear_base_plantilla.py --solo-validar        # comprueba el esquema
export BASEROW_URL=https://panel.tudominio.es
export BASEROW_EMAIL=admin@tudominio.es
export BASEROW_PASSWORD='...'
python3 crear_base_plantilla.py --workspace "Sanlúcar de Barrameda"
```

Después: rellenar la fila de `config`, subir 5–10 notas de prensa reales a
`ejemplos` y construir los flujos siguiendo [`n8n/README.md`](n8n/README.md).

### En local, sin dominio

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
# Baserow: http://localhost:8080   ·   n8n: http://localhost:5678
```

---

## Dar de alta otro ayuntamiento

1. `python3 crear_base_plantilla.py --workspace "Nombre del ayuntamiento"`
2. Rellenar `config` y subir sus notas históricas a `ejemplos`.
3. Añadir sus identificadores de tabla al mapa de tenants de n8n.
4. Crear las cuentas de su gabinete en ese workspace.

Un workspace por ayuntamiento: el aislamiento es real, no un filtro de vista que
alguien pueda quitar sin darse cuenta.

---

## Comprobaciones

```bash
node n8n/validar-cifras.js                       # 12 casos de validación de cifras
python3 scripts/crear_base_plantilla.py --solo-validar
python3 scripts/crear_base_plantilla.py --workspace X --simulacion
docker compose config --quiet                    # sintaxis del compose
```

## Copias de seguridad

```bash
DIRECTORIO_COPIAS=/var/copias/comunicacion scripts/copia-seguridad.sh
```

Vuelca las dos bases y los ficheros de Baserow. Programarlo en cron desde el primer
día: el cliente es una administración pública y la pregunta llega sola.

---

## Protección de datos

Antes de subir el primer acta real hace falta el **contrato de encargado del
tratamiento (art. 28 RGPD)** con el Ayuntamiento. Mientras no esté, se trabaja con
actas ya publicadas en el portal de transparencia.

El modelo de IA nunca ve la tabla `contactos`: generación y distribución son planos
separados que sólo se tocan al enviar una pieza ya aprobada. El detalle está en
[`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) §4 y §5.
