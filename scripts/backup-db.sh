#!/bin/bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILENAME="umkmcepat-${TIMESTAMP}.sql"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-umkmcepat}"

mkdir -p "${BACKUP_DIR}"

echo "[backup] Creating database dump..."
docker exec -i umkmcepat-postgres pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" > "${BACKUP_DIR}/${FILENAME}"
gzip "${BACKUP_DIR}/${FILENAME}"

# Retain last 7 days of backups
find "${BACKUP_DIR}" -name "umkmcepat-*.sql.gz" -mtime +7 -delete

echo "[backup] Backup completed successfully: ${FILENAME}.gz"
