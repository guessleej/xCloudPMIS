#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# xCloudPMIS — Azure 資源一鍵建立腳本
# ════════════════════════════════════════════════════════════
# 建立資源：
#   - Resource Group
#   - Azure Container Registry (ACR)
#   - Azure Database for PostgreSQL Flexible Server
#   - Azure Cache for Redis
#   - Azure Container Apps Environment
#   - Azure Container Apps（frontend + backend）
#   - Azure Log Analytics Workspace
# ════════════════════════════════════════════════════════════
set -euo pipefail

# ══════════════════════════════════════════════════════
# ⚠️  必填設定（部署前請先修改）
# ══════════════════════════════════════════════════════
SUBSCRIPTION_ID="${SUBSCRIPTION_ID:?}"
RESOURCE_GROUP="${RESOURCE_GROUP:-pmis-prod-rg}"
LOCATION="${LOCATION:-eastasia}"          # 東亞（香港）
APP_NAME="${APP_NAME:-pmis}"
ACR_NAME="${ACR_NAME:-${APP_NAME}acr$(date +%s | tail -c5)}"
APP_VERSION="${APP_VERSION:-1.0.0}"

# PostgreSQL
DB_ADMIN_USER="${DB_ADMIN_USER:-pmisadmin}"
DB_ADMIN_PASSWORD="${DB_ADMIN_PASSWORD:?請設定 DB_ADMIN_PASSWORD}"
DB_NAME="pmis_db"

# Redis
REDIS_SKU="${REDIS_SKU:-Basic}"   # Basic(開發) / Standard(生產) / Premium(HA)
REDIS_SIZE="${REDIS_SIZE:-C1}"

# Container Apps
BACKEND_MIN_REPLICAS=1
BACKEND_MAX_REPLICAS=5
FRONTEND_MIN_REPLICAS=1
FRONTEND_MAX_REPLICAS=3

# ── 顏色輸出 ─────────────────────────────────────────────────
info()    { echo -e "\033[0;34m[INFO]\033[0m  $*"; }
success() { echo -e "\033[0;32m[OK]\033[0m    $*"; }
warn()    { echo -e "\033[1;33m[WARN]\033[0m  $*"; }

echo "════════════════════════════════════════════════"
echo " xCloudPMIS Azure 資源建立"
echo " 訂閱：$SUBSCRIPTION_ID"
echo " 資源群組：$RESOURCE_GROUP"
echo " 位置：$LOCATION"
echo "════════════════════════════════════════════════"

# ── 確認登入 ─────────────────────────────────────────────────
az account set --subscription "$SUBSCRIPTION_ID"
info "Azure 訂閱已設定"

# ── Step 1: 建立 Resource Group ──────────────────────────────
info "[1/8] 建立 Resource Group..."
az group create \
    --name "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --tags app=pmis env=production \
    --output none
success "Resource Group：$RESOURCE_GROUP"

# ── Step 2: 建立 Azure Container Registry ────────────────────
info "[2/8] 建立 ACR：$ACR_NAME..."
az acr create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$ACR_NAME" \
    --sku Basic \
    --admin-enabled true \
    --output none
ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
success "ACR：$ACR_LOGIN_SERVER"

# ── Step 3: 建立 Log Analytics Workspace ─────────────────────
info "[3/8] 建立 Log Analytics Workspace..."
WORKSPACE_ID=$(az monitor log-analytics workspace create \
    --resource-group "$RESOURCE_GROUP" \
    --workspace-name "${APP_NAME}-logs" \
    --location "$LOCATION" \
    --query id -o tsv)
WORKSPACE_KEY=$(az monitor log-analytics workspace get-shared-keys \
    --resource-group "$RESOURCE_GROUP" \
    --workspace-name "${APP_NAME}-logs" \
    --query primarySharedKey -o tsv)
success "Log Analytics Workspace 已建立"

# ── Step 4: 建立 Container Apps Environment ───────────────────
info "[4/8] 建立 Container Apps Environment..."
ENVIRONMENT_NAME="${APP_NAME}-env"
az containerapp env create \
    --name "$ENVIRONMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --logs-workspace-id "$WORKSPACE_ID" \
    --logs-workspace-key "$WORKSPACE_KEY" \
    --output none
success "Container Apps Environment：$ENVIRONMENT_NAME"

# ── Step 5: 建立 PostgreSQL Flexible Server ───────────────────
info "[5/8] 建立 PostgreSQL Flexible Server（需要 3–5 分鐘）..."
PG_SERVER_NAME="${APP_NAME}-db"
az postgres flexible-server create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$PG_SERVER_NAME" \
    --location "$LOCATION" \
    --admin-user "$DB_ADMIN_USER" \
    --admin-password "$DB_ADMIN_PASSWORD" \
    --sku-name Standard_D2s_v3 \
    --tier GeneralPurpose \
    --storage-size 32 \
    --version 15 \
    --public-access 0.0.0.0 \
    --output none

az postgres flexible-server db create \
    --resource-group "$RESOURCE_GROUP" \
    --server-name "$PG_SERVER_NAME" \
    --database-name "$DB_NAME" \
    --output none

PG_HOST="${PG_SERVER_NAME}.postgres.database.azure.com"
success "PostgreSQL：$PG_HOST / $DB_NAME"

# ── Step 6: 建立 Azure Cache for Redis ────────────────────────
info "[6/8] 建立 Azure Cache for Redis（需要 10–15 分鐘）..."
REDIS_NAME="${APP_NAME}-redis"
az redis create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$REDIS_NAME" \
    --location "$LOCATION" \
    --sku "$REDIS_SKU" \
    --vm-size "$REDIS_SIZE" \
    --output none

REDIS_HOST="${REDIS_NAME}.redis.cache.windows.net"
REDIS_KEY=$(az redis list-keys \
    --resource-group "$RESOURCE_GROUP" \
    --name "$REDIS_NAME" \
    --query primaryKey -o tsv)
success "Redis：$REDIS_HOST"

# ── Step 7: 建置並推送 Docker 映像 ───────────────────────────
info "[7/8] 建置並推送 Docker 映像至 ACR..."
az acr login --name "$ACR_NAME"

docker build \
    --file docker/frontend/Dockerfile.prod \
    --build-arg VITE_API_URL="/api" \
    --tag "${ACR_LOGIN_SERVER}/pmis-frontend:${APP_VERSION}" .

docker build \
    --file docker/backend/Dockerfile.prod \
    --tag "${ACR_LOGIN_SERVER}/pmis-backend:${APP_VERSION}" .

docker push "${ACR_LOGIN_SERVER}/pmis-frontend:${APP_VERSION}"
docker push "${ACR_LOGIN_SERVER}/pmis-backend:${APP_VERSION}"
success "映像已推送至 ACR"

# ── Step 8: 部署 Container Apps ───────────────────────────────
info "[8/8] 部署 Container Apps..."

ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query passwords[0].value -o tsv)
DATABASE_URL="postgresql://${DB_ADMIN_USER}:${DB_ADMIN_PASSWORD}@${PG_HOST}/${DB_NAME}?sslmode=require"

# Backend Container App
az containerapp create \
    --name "${APP_NAME}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$ENVIRONMENT_NAME" \
    --image "${ACR_LOGIN_SERVER}/pmis-backend:${APP_VERSION}" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-username "$ACR_NAME" \
    --registry-password "$ACR_PASSWORD" \
    --target-port 3010 \
    --ingress internal \
    --min-replicas "$BACKEND_MIN_REPLICAS" \
    --max-replicas "$BACKEND_MAX_REPLICAS" \
    --cpu 1 --memory 2Gi \
    --env-vars \
        NODE_ENV=production \
        "DATABASE_URL=${DATABASE_URL}" \
        "DB_HOST=${PG_HOST}" \
        "DB_USER=${DB_ADMIN_USER}" \
        "DB_PASSWORD=secretref:db-password" \
        "DB_NAME=${DB_NAME}" \
        "REDIS_HOST=${REDIS_HOST}" \
        "REDIS_PORT=6380" \
        "REDIS_PASSWORD=secretref:redis-password" \
        "REDIS_TLS=true" \
    --output none

# Frontend Container App
BACKEND_FQDN=$(az containerapp show \
    --name "${APP_NAME}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --query properties.configuration.ingress.fqdn -o tsv)

az containerapp create \
    --name "${APP_NAME}-frontend" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$ENVIRONMENT_NAME" \
    --image "${ACR_LOGIN_SERVER}/pmis-frontend:${APP_VERSION}" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-username "$ACR_NAME" \
    --registry-password "$ACR_PASSWORD" \
    --target-port 80 \
    --ingress external \
    --min-replicas "$FRONTEND_MIN_REPLICAS" \
    --max-replicas "$FRONTEND_MAX_REPLICAS" \
    --cpu 0.5 --memory 1Gi \
    --output none

FRONTEND_FQDN=$(az containerapp show \
    --name "${APP_NAME}-frontend" \
    --resource-group "$RESOURCE_GROUP" \
    --query properties.configuration.ingress.fqdn -o tsv)

success "Container Apps 部署完成"

# ── 完成摘要 ─────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                  Azure 部署完成！                           ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "║  前端網址：https://%-42s║\n" "$FRONTEND_FQDN"
printf "║  後端 FQDN：%-43s  ║\n" "$BACKEND_FQDN"
printf "║  PostgreSQL：%-41s  ║\n" "$PG_HOST"
printf "║  Redis：%-46s  ║\n" "$REDIS_HOST"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  ⚠️  請記得：                                               ║"
echo "║    1. 在 .env 更新所有連線資訊                              ║"
echo "║    2. 執行 Prisma Migration                                 ║"
echo "║    3. 設定自訂網域（可選）                                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# 輸出連線資訊供後續使用
cat > /tmp/pmis-azure-output.env << EOF
ACR_LOGIN_SERVER=$ACR_LOGIN_SERVER
PG_HOST=$PG_HOST
REDIS_HOST=$REDIS_HOST
FRONTEND_FQDN=$FRONTEND_FQDN
BACKEND_FQDN=$BACKEND_FQDN
EOF

echo ""
echo "連線資訊已儲存至：/tmp/pmis-azure-output.env"
