#!/usr/bin/env bash
# Copia de seguridad completa: las dos bases (Baserow y n8n) y los ficheros
# subidos a Baserow. Un solo Postgres es justo lo que permite que esto quepa
# en un script de veinte líneas.
#
# Programar en cron:
#   0 3 * * *  /ruta/comunicacion-institucional/scripts/copia-seguridad.sh
set -euo pipefail

DIRECTORIO="${DIRECTORIO_COPIAS:-/var/copias/comunicacion}"
RETENCION_DIAS="${RETENCION_DIAS:-30}"
PROYECTO="$(cd "$(dirname "$0")/.." && pwd)"
FECHA="$(date +%Y%m%d-%H%M)"

cd "$PROYECTO"
# shellcheck disable=SC1091
set -a; . ./.env; set +a

mkdir -p "$DIRECTORIO"

echo "→ Volcando Postgres"
docker compose exec -T postgres \
  pg_dumpall -U "$POSTGRES_USER" \
  | gzip > "$DIRECTORIO/postgres-$FECHA.sql.gz"

echo "→ Copiando ficheros de Baserow"
docker compose exec -T baserow \
  tar czf - -C /baserow/data media \
  > "$DIRECTORIO/baserow-media-$FECHA.tar.gz"

echo "→ Borrando copias de más de $RETENCION_DIAS días"
find "$DIRECTORIO" -name '*.gz' -mtime "+$RETENCION_DIAS" -delete

echo "Copia terminada en $DIRECTORIO"
ls -lh "$DIRECTORIO" | tail -5
