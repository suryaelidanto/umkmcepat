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

# Copy off-host. A backup that only exists on the machine being backed up is
# not a backup. Uses the same private bucket as project artifacts.
if [ -n "${S3_PRIVATE_BUCKET:-}" ] && [ -n "${S3_ACCOUNT_ID:-}" ]; then
  if command -v aws >/dev/null 2>&1; then
    echo "[backup] Uploading to object storage..."
    AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-}" \
    AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-}" \
      aws s3 cp "${BACKUP_DIR}/${FILENAME}.gz" \
        "s3://${S3_PRIVATE_BUCKET}/db-backups/${FILENAME}.gz" \
        --endpoint-url "https://${S3_ACCOUNT_ID}.r2.cloudflarestorage.com"
  else
    echo "[backup] aws CLI not found; skipping off-host upload." >&2
  fi
else
  echo "[backup] S3_PRIVATE_BUCKET or S3_ACCOUNT_ID unset; keeping local copy only."
fi
