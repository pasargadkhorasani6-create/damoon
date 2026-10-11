#!/usr/bin/env bash
# بازگردانی پشتیبان:  ./deploy/restore.sh backups/damoon-YYYYMMDD-HHMM.dump
set -euo pipefail
cd "$(dirname "$0")/.."
f="${1:?usage: restore.sh <dump file>}"
set -a; source .env; set +a
docker compose stop app worker
docker compose exec -T postgres pg_restore --clean --if-exists -U "${POSTGRES_USER:-damoon}" -d "${POSTGRES_DB:-damoon}" < "$f"
docker compose start app worker
