#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# xCloudPMIS — Azure Container Registry 建置與推送腳本
# ════════════════════════════════════════════════════════════
# 前置條件：
#   az login  （已登入 Azure CLI）
#   已設定下方環境變數
# ════════════════════════════════════════════════════════════
set -euo pipefail

# ── 設定（必填）─────────────────────────────────────────────
ACR_NAME="${ACR_NAME:?請設定 ACR_NAME 環境變數，例如：pmisacr}"
RESOURCE_GROUP="${RESOURCE_GROUP:?請設定 RESOURCE_GROUP 環境變數}"
APP_VERSION="${APP_VERSION:-1.0.0}"
VITE_API_URL="${VITE_API_URL:-/api}"
VITE_WS_URL="${VITE_WS_URL:-wss://pmis.your-domain.com/collab}"

ACR_LOGIN_SERVER="${ACR_NAME}.azurecr.io"

echo "════════════════════════════════════════════════"
echo " xCloudPMIS ACR 建置與推送"
echo " ACR：$ACR_LOGIN_SERVER"
echo " 版本：$APP_VERSION"
echo "════════════════════════════════════════════════"

# ── Step 1: 登入 ACR ─────────────────────────────────────────
echo "[1/5] 登入 Azure Container Registry..."
az acr login --name "$ACR_NAME"

# ── Step 2: 建置 Frontend 映像 ───────────────────────────────
echo "[2/5] 建置 Frontend 映像..."
docker build \
    --file docker/frontend/Dockerfile.prod \
    --build-arg VITE_API_URL="$VITE_API_URL" \
    --build-arg VITE_WS_URL="$VITE_WS_URL" \
    --build-arg VITE_APP_VERSION="$APP_VERSION" \
    --tag "${ACR_LOGIN_SERVER}/pmis-frontend:${APP_VERSION}" \
    --tag "${ACR_LOGIN_SERVER}/pmis-frontend:latest" \
    .

# ── Step 3: 建置 Backend 映像 ────────────────────────────────
echo "[3/5] 建置 Backend 映像..."
docker build \
    --file docker/backend/Dockerfile.prod \
    --tag "${ACR_LOGIN_SERVER}/pmis-backend:${APP_VERSION}" \
    --tag "${ACR_LOGIN_SERVER}/pmis-backend:latest" \
    .

# ── Step 4: 推送映像至 ACR ────────────────────────────────────
echo "[4/5] 推送映像至 ACR..."
docker push "${ACR_LOGIN_SERVER}/pmis-frontend:${APP_VERSION}"
docker push "${ACR_LOGIN_SERVER}/pmis-frontend:latest"
docker push "${ACR_LOGIN_SERVER}/pmis-backend:${APP_VERSION}"
docker push "${ACR_LOGIN_SERVER}/pmis-backend:latest"

# ── Step 5: 驗證推送結果 ─────────────────────────────────────
echo "[5/5] 驗證 ACR 映像..."
az acr repository list --name "$ACR_NAME" --output table
az acr repository show-tags --name "$ACR_NAME" \
    --repository pmis-frontend --output table
az acr repository show-tags --name "$ACR_NAME" \
    --repository pmis-backend --output table

echo ""
echo "✅ 映像已成功推送至 $ACR_LOGIN_SERVER"
echo "   Frontend: ${ACR_LOGIN_SERVER}/pmis-frontend:${APP_VERSION}"
echo "   Backend:  ${ACR_LOGIN_SERVER}/pmis-backend:${APP_VERSION}"
