#!/bin/sh
# Crea las dos bases de datos que usan Baserow y n8n.
# Sólo se ejecuta la primera vez, cuando el volumen de Postgres está vacío.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
    CREATE DATABASE baserow;
    CREATE DATABASE n8n;
EOSQL

echo "Bases 'baserow' y 'n8n' creadas."
