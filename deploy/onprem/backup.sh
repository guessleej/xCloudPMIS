#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# xCloudPMIS — 自動備份腳本（PostgreSQL + Redis）
# ════════════════════════════════════════════════════════════
set -euo pipefail

PROJECT_DIR="/opt/pmis"
BACKUP_DIR="$PROJECT_DIR/backups"
COMPOSE_FILE="docker-compose.prod.yml"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

cd "$PROJECT_DIR"

# 載入環境變數
source .env

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 開始備份..."

# PostgreSQL 備份
docker compose -f "$COMPOSE_FILE" exec -T pmis-db \
    pg_dump -U "$DB_USER" "$DB_NAME" --format=custom --compress=9 \
    > "$BACKUP_DIR/db_${TIMESTAMP}.dump"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] PostgreSQL 備份完成：db_${TIMESTAMP}.dump"

# Redis 備份（複製 RDB 快照）
docker compose -f "$COMPOSE_FILE" exec -T pmis-redis \
    redis-cli -a "$REDIS_PASSWORD" BGSAVE
sleep 3
docker cp pmis-redis:/data/dump.rdb "$BACKUP_DIR/redis_${TIMESTAMP}.rdb"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Redis 備份完成：redis_${TIMESTAMP}.rdb"

# 清理超過保留天數的備份
find "$BACKUP_DIR" -name "*.dump" -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "*.rdb"  -mtime +"$RETENTION_DAYS" -delete

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 備份完成，保留近 ${RETENTION_DAYS} 天"
