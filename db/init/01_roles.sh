#!/bin/bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'siac_owner') THEN
        CREATE ROLE siac_owner NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'siac_app') THEN
        CREATE ROLE siac_app LOGIN PASSWORD '${DB_PASSWORD}';
    ELSE
        ALTER ROLE siac_app WITH LOGIN PASSWORD '${DB_PASSWORD}';
    END IF;
END
\$\$;
EOSQL
