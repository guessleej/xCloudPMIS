# xCloudPMIS Azure 雲端部署手冊

**版本：** v1.1
**適用環境：** Microsoft Azure 公有雲
**更新日期：** 2026-03-22

---

## 目錄

1. [Azure 架構設計](#1-azure-架構設計)
2. [部署前準備](#2-部署前準備)
3. [建立 Azure 資源](#3-建立-azure-資源)
4. [Azure Container Registry (ACR) 設定](#4-azure-container-registry-acr-設定)
5. [Azure Database for PostgreSQL](#5-azure-database-for-postgresql)
6. [Azure Cache for Redis](#6-azure-cache-for-redis)
7. [建置並推送 Docker 映像](#7-建置並推送-docker-映像)
8. [Azure Container Apps 部署](#8-azure-container-apps-部署)
9. [網域與 SSL 設定](#9-網域與-ssl-設定)
10. [環境變數與機密管理](#10-環境變數與機密管理)
11. [首次資料庫初始化](#11-首次資料庫初始化)
12. [CI/CD 自動部署（GitHub Actions）](#12-cicd-自動部署github-actions)
13. [監控與警報](#13-監控與警報)
14. [備份策略](#14-備份策略)
15. [成本估算](#15-成本估算)
16. [故障排除](#16-故障排除)

---

## 1. Azure 架構設計

### 1.1 整體架構圖

```
╔══════════════════════════════════════════════════════════════════╗
║                         Internet                                 ║
╚══════════════════════════════════════════════════════════════════╝
                              │
                              ▼
╔══════════════════════════════════════════════════════════════════╗
║           Azure Front Door / Application Gateway                 ║
║  - WAF（Web Application Firewall）                               ║
║  - SSL/TLS 終止                                                  ║
║  - 全球 CDN 加速（Front Door）                                   ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║     ╔═══════════════════════╗   ╔═══════════════════════════╗   ║
║     ║ Container Apps        ║   ║ Container Apps            ║   ║
║     ║ pmis-frontend         ║   ║ pmis-backend              ║   ║
║     ║ Nginx + React SPA     ║   ║ Node.js + Express         ║   ║
║     ║ 1–3 replicas          ║   ║ 1–5 replicas（自動擴展）  ║   ║
║     ╚═══════════════════════╝   ╚═══════════╦═══════════════╝   ║
║                                             │                    ║
║     ┌───────────────────────────────────────┤                    ║
║     ▼                                       ▼                    ║
║  ╔═══════════════════════════╗  ╔════════════════════════════╗   ║
║  ║ Azure Database for        ║  ║ Azure Cache for Redis      ║   ║
║  ║ PostgreSQL Flexible       ║  ║ Standard C1 (1GB)          ║   ║
║  ║ Zone Redundant HA         ║  ║ TLS 加密連線               ║   ║
║  ╚═══════════════════════════╝  ╚════════════════════════════╝   ║
║                                                                  ║
║     ╔═══════════════════════════════════════════════════════╗    ║
║     ║              Azure Container Registry (ACR)           ║    ║
║     ║  pmis-frontend:v1.0.0  │  pmis-backend:v1.0.0        ║    ║
║     ╚═══════════════════════════════════════════════════════╝    ║
║                                                                  ║
║     ╔══════════════════╗  ╔══════════════════╗                   ║
║     ║ Azure Key Vault  ║  ║ Log Analytics    ║                   ║
║     ║ 機密管理          ║  ║ 集中式日誌 + 警報 ║                   ║
║     ╚══════════════════╝  ╚══════════════════╝                   ║
╚══════════════════════════════════════════════════════════════════╝
```

### 1.2 Azure 服務清單

| 服務 | Azure 產品 | SKU | 用途 |
|------|-----------|-----|------|
| 前端容器 | Container Apps | 消費型計費 | React SPA |
| 後端容器 | Container Apps | 消費型計費 | Express API |
| 容器映像庫 | Container Registry | Basic | Docker 映像存放 |
| 資料庫 | PostgreSQL Flexible Server | Standard_D2s_v3 | 主資料庫 |
| 快取 | Cache for Redis | Standard C1 | 快取 / Session |
| 機密管理 | Key Vault | Standard | API Keys / 密碼 |
| 日誌監控 | Log Analytics + Monitor | 按量計費 | 監控 / 警報 |
| 流量入口 | Application Gateway / Front Door | WAF_v2 | 負載均衡 / WAF |

### 1.3 區域建議

| 場景 | 建議區域 |
|------|---------|
| 台灣用戶為主 | `eastasia`（香港）或 `japaneast`（東日本） |
| 政府/公務需求 | `eastasia`（香港）|
| 全球用戶 | `eastasia` + Front Door CDN |

---

## 2. 部署前準備

### 2.1 必要工具安裝

```bash
# Azure CLI（macOS）
brew install azure-cli

# Azure CLI（Ubuntu/Debian）
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# 驗證安裝
az --version   # 應 >= 2.50

# Docker（用於本機建置映像）
docker --version  # 應 >= 24.0

# 登入 Azure
az login

# 確認訂閱
az account list --output table
az account set --subscription "your-subscription-id"
```

### 2.2 必要的 Azure 權限

執行此部署需要以下 Azure RBAC 角色（在目標訂閱上）：

| 角色 | 說明 |
|------|------|
| `Contributor` | 建立資源群組和大部分資源 |
| `User Access Administrator` | 指派角色給受控識別 |
| 或由具有 `Owner` 的帳號執行 | 包含上述所有權限 |

### 2.3 設定部署環境變數

```bash
# 在本機開發機器上設定（或加入 ~/.bashrc）
export SUBSCRIPTION_ID="your-subscription-id"
export RESOURCE_GROUP="pmis-prod-rg"
export LOCATION="eastasia"
export APP_NAME="pmis"
export ACR_NAME="pmisacr$(date +%s | tail -c5)"   # 唯一名稱
export APP_VERSION="1.0.0"

# 資料庫
export DB_ADMIN_USER="pmisadmin"
export DB_ADMIN_PASSWORD="$(openssl rand -base64 24)Aa1!"  # 滿足複雜度要求
export DB_NAME="pmis_db"

# 確認設定
echo "訂閱：$SUBSCRIPTION_ID"
echo "資源群組：$RESOURCE_GROUP"
echo "ACR：$ACR_NAME"
```

---

## 3. 建立 Azure 資源

### 3.1 一鍵建立所有資源（自動腳本）

```bash
cd /path/to/NewCode

# 賦予執行權限
chmod +x deploy/azure/azure-setup.sh deploy/azure/acr-build-push.sh

# 執行（約需 20–30 分鐘）
bash deploy/azure/azure-setup.sh
```

### 3.2 手動建立（逐步說明）

#### Step 1：建立 Resource Group

```bash
az group create \
    --name "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --tags "app=pmis" "env=production" "owner=it-dept"

echo "✅ Resource Group：$RESOURCE_GROUP"
```

#### Step 2：建立 Log Analytics Workspace（監控基礎）

```bash
az monitor log-analytics workspace create \
    --resource-group "$RESOURCE_GROUP" \
    --workspace-name "${APP_NAME}-logs" \
    --location "$LOCATION" \
    --retention-time 90

WORKSPACE_ID=$(az monitor log-analytics workspace show \
    --resource-group "$RESOURCE_GROUP" \
    --workspace-name "${APP_NAME}-logs" \
    --query customerId -o tsv)

WORKSPACE_KEY=$(az monitor log-analytics workspace get-shared-keys \
    --resource-group "$RESOURCE_GROUP" \
    --workspace-name "${APP_NAME}-logs" \
    --query primarySharedKey -o tsv)

echo "✅ Log Analytics：$WORKSPACE_ID"
```

#### Step 3：建立 Container Apps Environment

```bash
ENVIRONMENT_NAME="${APP_NAME}-env"

az containerapp env create \
    --name "$ENVIRONMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --logs-workspace-id "$WORKSPACE_ID" \
    --logs-workspace-key "$WORKSPACE_KEY"

echo "✅ Container Apps Environment：$ENVIRONMENT_NAME"
```

---

## 4. Azure Container Registry (ACR) 設定

### 4.1 建立 ACR

```bash
az acr create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$ACR_NAME" \
    --sku Basic \
    --admin-enabled true \
    --location "$LOCATION"

ACR_LOGIN_SERVER=$(az acr show \
    --name "$ACR_NAME" \
    --query loginServer -o tsv)

echo "✅ ACR：$ACR_LOGIN_SERVER"
```

> **注意：** Basic SKU 適合小型專案。生產建議升級至 Standard（含 geo-replication 和 content trust）。

### 4.2 設定 ACR 存取政策

```bash
# 啟用系統指派受控識別（Managed Identity）以安全存取 ACR
# 這樣 Container Apps 不需要硬編碼帳號密碼

az acr login --name "$ACR_NAME"
```

---

## 5. Azure Database for PostgreSQL

### 5.1 建立 PostgreSQL Flexible Server

```bash
PG_SERVER_NAME="${APP_NAME}-db-$(date +%s | tail -c5)"

az postgres flexible-server create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$PG_SERVER_NAME" \
    --location "$LOCATION" \
    --admin-user "$DB_ADMIN_USER" \
    --admin-password "$DB_ADMIN_PASSWORD" \
    --sku-name "Standard_D2s_v3" \
    --tier "GeneralPurpose" \
    --storage-size 32 \
    --version 15 \
    --high-availability ZoneRedundant \
    --zone 1 \
    --standby-zone 2 \
    --backup-retention 7 \
    --geo-redundant-backup Enabled \
    --public-access 0.0.0.0

PG_HOST="${PG_SERVER_NAME}.postgres.database.azure.com"
echo "✅ PostgreSQL：$PG_HOST"
```

**SKU 選項對照：**

| 使用場景 | SKU | vCores | RAM | 月費估算 |
|---------|-----|--------|-----|---------|
| 開發/測試 | Standard_B1ms | 1 | 2 GB | ~USD 15 |
| 小型生產 | Standard_D2s_v3 | 2 | 8 GB | ~USD 100 |
| 標準生產 | Standard_D4s_v3 | 4 | 16 GB | ~USD 200 |
| 高效能 | Standard_D8s_v3 | 8 | 32 GB | ~USD 400 |

### 5.2 建立資料庫

```bash
az postgres flexible-server db create \
    --resource-group "$RESOURCE_GROUP" \
    --server-name "$PG_SERVER_NAME" \
    --database-name "$DB_NAME" \
    --charset "UTF8" \
    --collation "en_US.utf8"

echo "✅ 資料庫：$DB_NAME"
```

### 5.3 設定防火牆規則

```bash
# 允許 Azure 內部服務連線
az postgres flexible-server firewall-rule create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$PG_SERVER_NAME" \
    --rule-name "AllowAzureServices" \
    --start-ip-address 0.0.0.0 \
    --end-ip-address 0.0.0.0

# 若需要從本機連線進行管理（臨時，設定完後移除）
MY_IP=$(curl -s https://api.ipify.org)
az postgres flexible-server firewall-rule create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$PG_SERVER_NAME" \
    --rule-name "AdminTemp" \
    --start-ip-address "$MY_IP" \
    --end-ip-address "$MY_IP"
```

---

## 6. Azure Cache for Redis

### 6.1 建立 Redis 執行個體

```bash
REDIS_NAME="${APP_NAME}-redis-$(date +%s | tail -c5)"

az redis create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$REDIS_NAME" \
    --location "$LOCATION" \
    --sku Standard \
    --vm-size C1 \
    --enable-non-ssl-port false \
    --minimum-tls-version 1.2

REDIS_HOST="${REDIS_NAME}.redis.cache.windows.net"
REDIS_KEY=$(az redis list-keys \
    --resource-group "$RESOURCE_GROUP" \
    --name "$REDIS_NAME" \
    --query primaryKey -o tsv)

echo "✅ Redis：$REDIS_HOST"
```

**Redis SKU 對照：**

| SKU | 容量 | 功能 | 月費估算 |
|-----|------|------|---------|
| Basic C0 | 250 MB | 單節點 | ~USD 16 |
| Standard C1 | 1 GB | 主從複製 | ~USD 55 |
| Standard C2 | 6 GB | 主從複製 | ~USD 110 |
| Premium P1 | 6 GB + 叢集 | 持久化 + VNet | ~USD 400 |

---

## 7. 建置並推送 Docker 映像

### 7.1 本機建置並推送至 ACR

```bash
cd /path/to/NewCode

# 登入 ACR
az acr login --name "$ACR_NAME"

# 建置 Frontend（含 API URL 設定）
docker build \
    --file docker/frontend/Dockerfile.prod \
    --build-arg VITE_API_URL="/api" \
    --build-arg VITE_WS_URL="wss://${APP_NAME}.azurecontainerapps.io/collab" \
    --build-arg VITE_APP_VERSION="$APP_VERSION" \
    --tag "${ACR_LOGIN_SERVER}/pmis-frontend:${APP_VERSION}" \
    --tag "${ACR_LOGIN_SERVER}/pmis-frontend:latest" \
    .

# 建置 Backend
docker build \
    --file docker/backend/Dockerfile.prod \
    --tag "${ACR_LOGIN_SERVER}/pmis-backend:${APP_VERSION}" \
    --tag "${ACR_LOGIN_SERVER}/pmis-backend:latest" \
    .

# 推送至 ACR
docker push "${ACR_LOGIN_SERVER}/pmis-frontend:${APP_VERSION}"
docker push "${ACR_LOGIN_SERVER}/pmis-backend:${APP_VERSION}"
docker push "${ACR_LOGIN_SERVER}/pmis-frontend:latest"
docker push "${ACR_LOGIN_SERVER}/pmis-backend:latest"

echo "✅ 映像已推送至 $ACR_LOGIN_SERVER"
```

### 7.2 使用 ACR Task（雲端建置，不需要本機 Docker）

```bash
# 直接在 Azure 雲端建置（適合 CI/CD 無 Docker 的環境）
az acr build \
    --registry "$ACR_NAME" \
    --image "pmis-backend:${APP_VERSION}" \
    --file docker/backend/Dockerfile.prod \
    .

az acr build \
    --registry "$ACR_NAME" \
    --image "pmis-frontend:${APP_VERSION}" \
    --file docker/frontend/Dockerfile.prod \
    --build-arg VITE_API_URL="/api" \
    .
```

---

## 8. Azure Container Apps 部署

### 8.1 取得 ACR 憑證

```bash
ACR_PASSWORD=$(az acr credential show \
    --name "$ACR_NAME" \
    --query passwords[0].value -o tsv)

DATABASE_URL="postgresql://${DB_ADMIN_USER}:${DB_ADMIN_PASSWORD}@${PG_HOST}/${DB_NAME}?sslmode=require"
```

### 8.2 部署 Backend Container App

```bash
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
    --min-replicas 1 \
    --max-replicas 5 \
    --cpu 1.0 \
    --memory 2.0Gi \
    --env-vars \
        NODE_ENV=production \
        PORT=3010 \
        "DATABASE_URL=${DATABASE_URL}" \
        "DB_HOST=${PG_HOST}" \
        "DB_USER=${DB_ADMIN_USER}" \
        "DB_PORT=5432" \
        "DB_NAME=${DB_NAME}" \
        "REDIS_HOST=${REDIS_HOST}" \
        "REDIS_PORT=6380" \
        "REDIS_TLS=true" \
        TZ=Asia/Taipei \
    --secrets \
        "db-password=${DB_ADMIN_PASSWORD}" \
        "redis-password=${REDIS_KEY}" \
        "jwt-secret=$(openssl rand -hex 64)"

BACKEND_FQDN=$(az containerapp show \
    --name "${APP_NAME}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --query properties.configuration.ingress.fqdn -o tsv)

echo "✅ Backend FQDN：$BACKEND_FQDN"
```

### 8.3 部署 Frontend Container App

```bash
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
    --min-replicas 1 \
    --max-replicas 3 \
    --cpu 0.5 \
    --memory 1.0Gi \
    --env-vars \
        TZ=Asia/Taipei

FRONTEND_FQDN=$(az containerapp show \
    --name "${APP_NAME}-frontend" \
    --resource-group "$RESOURCE_GROUP" \
    --query properties.configuration.ingress.fqdn -o tsv)

echo "✅ 前端網址：https://$FRONTEND_FQDN"
```

### 8.4 設定自動擴展規則

```bash
# Backend：依 HTTP 請求數自動擴展
az containerapp update \
    --name "${APP_NAME}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --scale-rule-name "http-scaling" \
    --scale-rule-type "http" \
    --scale-rule-http-concurrency 50

echo "✅ 自動擴展規則已設定"
```

---

## 9. 網域與 SSL 設定

### 9.1 自訂網域（Custom Domain）

```bash
CUSTOM_DOMAIN="pmis.your-company.com"

# Step 1：新增自訂網域至 Container App
az containerapp hostname add \
    --name "${APP_NAME}-frontend" \
    --resource-group "$RESOURCE_GROUP" \
    --hostname "$CUSTOM_DOMAIN"

# Step 2：取得 TXT 驗證記錄
az containerapp hostname show \
    --name "${APP_NAME}-frontend" \
    --resource-group "$RESOURCE_GROUP" \
    --hostname "$CUSTOM_DOMAIN"

# Step 3：在 DNS 設定驗證 TXT 記錄後，繫結 SSL 憑證
az containerapp hostname bind \
    --name "${APP_NAME}-frontend" \
    --resource-group "$RESOURCE_GROUP" \
    --hostname "$CUSTOM_DOMAIN" \
    --environment "$ENVIRONMENT_NAME" \
    --validation-method CNAME
```

### 9.2 DNS 設定說明

在您的 DNS 服務商（如中華電信 HiNet、AWS Route53）新增以下記錄：

| 類型 | 主機名稱 | 值 |
|------|---------|-----|
| CNAME | `pmis` | `pmis-frontend.azurecontainerapps.io` |
| TXT | `asuid.pmis` | Azure 提供的驗證值 |

### 9.3 Azure Front Door（進階 CDN + WAF）

```bash
# 建立 Front Door Profile
az afd profile create \
    --profile-name "${APP_NAME}-fd" \
    --resource-group "$RESOURCE_GROUP" \
    --sku Standard_AzureFrontDoor

# 建立 Endpoint
az afd endpoint create \
    --profile-name "${APP_NAME}-fd" \
    --resource-group "$RESOURCE_GROUP" \
    --endpoint-name "${APP_NAME}-endpoint" \
    --enabled-state Enabled

# 建立 Origin Group（指向 Container App）
az afd origin-group create \
    --profile-name "${APP_NAME}-fd" \
    --resource-group "$RESOURCE_GROUP" \
    --origin-group-name "pmis-origins" \
    --probe-request-type GET \
    --probe-protocol Https \
    --probe-interval-in-seconds 30

echo "✅ Front Door 設定完成"
```

---

## 10. 環境變數與機密管理

### 10.1 使用 Azure Key Vault（推薦）

```bash
# 建立 Key Vault
KV_NAME="${APP_NAME}-kv-$(date +%s | tail -c5)"

az keyvault create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$KV_NAME" \
    --location "$LOCATION" \
    --sku standard \
    --enable-rbac-authorization true

# 儲存機密
az keyvault secret set --vault-name "$KV_NAME" \
    --name "db-password" --value "$DB_ADMIN_PASSWORD"

az keyvault secret set --vault-name "$KV_NAME" \
    --name "redis-key" --value "$REDIS_KEY"

az keyvault secret set --vault-name "$KV_NAME" \
    --name "jwt-secret" --value "$(openssl rand -hex 64)"

az keyvault secret set --vault-name "$KV_NAME" \
    --name "openai-api-key" --value "sk-your-openai-key"

echo "✅ Key Vault 機密已設定"
```

### 10.2 Container App 存取 Key Vault

```bash
# 啟用受控識別（Managed Identity）
az containerapp identity assign \
    --name "${APP_NAME}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --system-assigned

# 取得識別主體 ID
PRINCIPAL_ID=$(az containerapp identity show \
    --name "${APP_NAME}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --query principalId -o tsv)

# 授予 Key Vault 讀取權限
KV_ID=$(az keyvault show --name "$KV_NAME" --query id -o tsv)
az role assignment create \
    --assignee "$PRINCIPAL_ID" \
    --role "Key Vault Secrets User" \
    --scope "$KV_ID"

echo "✅ 受控識別已授予 Key Vault 存取權"
```

---

## 11. 首次資料庫初始化

### 11.1 從本機連線至 Azure PostgreSQL

```bash
# 確認防火牆規則已允許本機 IP
psql "host=$PG_HOST port=5432 dbname=$DB_NAME \
      user=$DB_ADMIN_USER password=$DB_ADMIN_PASSWORD sslmode=require" \
    -c "SELECT version();"
```

### 11.2 執行 Prisma Migration

```bash
# 在本機設定連線字串，然後執行 migration
cd /path/to/NewCode/backend

DATABASE_URL="postgresql://${DB_ADMIN_USER}:${DB_ADMIN_PASSWORD}@${PG_HOST}/${DB_NAME}?sslmode=require" \
    npx prisma migrate deploy

echo "✅ Migration 完成"
```

### 11.3 執行 Container App 內的 Migration

```bash
# 在 Container App 容器內執行（推薦，確保版本一致）
az containerapp exec \
    --name "${APP_NAME}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --command "npx prisma migrate deploy"
```

### 11.4 初始 Seed 資料

```bash
az containerapp exec \
    --name "${APP_NAME}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --command "npx prisma db seed"

echo "✅ 初始資料已建立"
```

---

## 12. CI/CD 自動部署（GitHub Actions）

### 12.1 建立 GitHub Actions Workflow

在您的 GitHub 儲存庫建立 `.github/workflows/deploy-azure.yml`：

```yaml
name: Deploy to Azure

on:
  push:
    branches: [ main ]
    tags: [ 'v*' ]
  workflow_dispatch:
    inputs:
      version:
        description: '部署版本'
        required: true
        default: 'latest'

env:
  ACR_NAME: ${{ secrets.ACR_NAME }}
  RESOURCE_GROUP: ${{ secrets.RESOURCE_GROUP }}
  APP_NAME: pmis

jobs:
  # ── Job 1: 建置並推送 Docker 映像 ──────────────────────
  build:
    name: Build & Push Images
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.version }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: 設定版本號
        id: version
        run: |
          if [[ "${{ github.ref }}" == refs/tags/* ]]; then
            VERSION="${GITHUB_REF#refs/tags/}"
          else
            VERSION="${GITHUB_SHA::8}"
          fi
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          echo "部署版本：$VERSION"

      - name: 登入 Azure
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: 登入 ACR
        run: az acr login --name $ACR_NAME

      - name: 建置 Frontend 映像
        run: |
          docker build \
            --file docker/frontend/Dockerfile.prod \
            --build-arg VITE_API_URL="/api" \
            --build-arg VITE_APP_VERSION="${{ steps.version.outputs.version }}" \
            --tag "${ACR_NAME}.azurecr.io/pmis-frontend:${{ steps.version.outputs.version }}" \
            --tag "${ACR_NAME}.azurecr.io/pmis-frontend:latest" \
            .
          docker push "${ACR_NAME}.azurecr.io/pmis-frontend:${{ steps.version.outputs.version }}"
          docker push "${ACR_NAME}.azurecr.io/pmis-frontend:latest"

      - name: 建置 Backend 映像
        run: |
          docker build \
            --file docker/backend/Dockerfile.prod \
            --tag "${ACR_NAME}.azurecr.io/pmis-backend:${{ steps.version.outputs.version }}" \
            --tag "${ACR_NAME}.azurecr.io/pmis-backend:latest" \
            .
          docker push "${ACR_NAME}.azurecr.io/pmis-backend:${{ steps.version.outputs.version }}"
          docker push "${ACR_NAME}.azurecr.io/pmis-backend:latest"

  # ── Job 2: 部署至 Azure Container Apps ────────────────
  deploy:
    name: Deploy to Azure
    runs-on: ubuntu-latest
    needs: build
    environment: production

    steps:
      - name: 登入 Azure
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: 執行 DB Migration
        uses: azure/container-apps-deploy-action@v1
        with:
          acrName: ${{ secrets.ACR_NAME }}
          containerAppName: ${{ env.APP_NAME }}-backend
          resourceGroup: ${{ secrets.RESOURCE_GROUP }}
          imageToDeploy: "${{ secrets.ACR_NAME }}.azurecr.io/pmis-backend:${{ needs.build.outputs.version }}"
          targetPort: 3010
          command: "npx prisma migrate deploy && node src/index.js"

      - name: 更新 Backend 版本
        run: |
          az containerapp update \
            --name "${{ env.APP_NAME }}-backend" \
            --resource-group "${{ secrets.RESOURCE_GROUP }}" \
            --image "${{ secrets.ACR_NAME }}.azurecr.io/pmis-backend:${{ needs.build.outputs.version }}"

      - name: 更新 Frontend 版本
        run: |
          az containerapp update \
            --name "${{ env.APP_NAME }}-frontend" \
            --resource-group "${{ secrets.RESOURCE_GROUP }}" \
            --image "${{ secrets.ACR_NAME }}.azurecr.io/pmis-frontend:${{ needs.build.outputs.version }}"

      - name: 健康檢查
        run: |
          sleep 30
          FRONTEND_FQDN=$(az containerapp show \
            --name "${{ env.APP_NAME }}-frontend" \
            --resource-group "${{ secrets.RESOURCE_GROUP }}" \
            --query properties.configuration.ingress.fqdn -o tsv)
          curl -f "https://${FRONTEND_FQDN}/health" || exit 1
          echo "✅ 部署成功：https://${FRONTEND_FQDN}"
```

### 12.2 設定 GitHub Secrets

在 GitHub 儲存庫 → Settings → Secrets → Actions 新增：

| Secret 名稱 | 值 |
|------------|-----|
| `AZURE_CREDENTIALS` | `az ad sp create-for-rbac ...` 的輸出 JSON |
| `ACR_NAME` | ACR 名稱（不含 `.azurecr.io`） |
| `RESOURCE_GROUP` | Azure 資源群組名稱 |

```bash
# 建立 Service Principal 並取得 AZURE_CREDENTIALS
az ad sp create-for-rbac \
    --name "pmis-github-actions" \
    --role Contributor \
    --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP" \
    --sdk-auth
# 將輸出的 JSON 整個複製到 AZURE_CREDENTIALS secret
```

---

## 13. 監控與警報

### 13.1 Application Insights 整合

```bash
# 建立 Application Insights
az monitor app-insights component create \
    --app "${APP_NAME}-insights" \
    --location "$LOCATION" \
    --resource-group "$RESOURCE_GROUP" \
    --workspace "$WORKSPACE_ID"

INSIGHTS_KEY=$(az monitor app-insights component show \
    --app "${APP_NAME}-insights" \
    --resource-group "$RESOURCE_GROUP" \
    --query instrumentationKey -o tsv)

# 在 Container App 設定 APPINSIGHTS_INSTRUMENTATIONKEY
az containerapp update \
    --name "${APP_NAME}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --set-env-vars "APPINSIGHTS_INSTRUMENTATIONKEY=${INSIGHTS_KEY}"
```

### 13.2 設定警報規則

```bash
# CPU 使用率 > 80% 警報
az monitor metrics alert create \
    --name "pmis-high-cpu" \
    --resource-group "$RESOURCE_GROUP" \
    --scopes "$(az containerapp show --name ${APP_NAME}-backend --resource-group $RESOURCE_GROUP --query id -o tsv)" \
    --condition "avg CpuPercentage > 80" \
    --window-size 5m \
    --evaluation-frequency 1m \
    --action-group "$(az monitor action-group show --name pmis-alerts --resource-group $RESOURCE_GROUP --query id -o tsv 2>/dev/null || echo '')"

# 可用性監控（每分鐘探測）
az monitor app-insights web-test create \
    --name "pmis-availability" \
    --resource-group "$RESOURCE_GROUP" \
    --app-insights "${APP_NAME}-insights" \
    --location "$LOCATION" \
    --url "https://$FRONTEND_FQDN/health" \
    --frequency 60 \
    --enabled true
```

### 13.3 查看日誌（Azure Portal 或 CLI）

```bash
# 即時查看 Backend 日誌
az containerapp logs show \
    --name "${APP_NAME}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --follow

# KQL 查詢（Log Analytics）
az monitor log-analytics query \
    --workspace "$WORKSPACE_ID" \
    --analytics-query "
        ContainerAppConsoleLogs_CL
        | where ContainerAppName_s == '${APP_NAME}-backend'
        | where Log_s contains 'ERROR'
        | project TimeGenerated, Log_s
        | order by TimeGenerated desc
        | take 50
    "
```

---

## 14. 備份策略

### 14.1 PostgreSQL 自動備份

Azure PostgreSQL Flexible Server 已內建自動備份（保留 7 天），無需額外設定。

**查看備份狀態：**
```bash
az postgres flexible-server backup list \
    --resource-group "$RESOURCE_GROUP" \
    --name "$PG_SERVER_NAME" \
    --output table
```

**手動觸發備份：**
```bash
# Azure PostgreSQL Flexible Server 不支援手動觸發，但可用 pg_dump
PG_HOST="${PG_SERVER_NAME}.postgres.database.azure.com"

pg_dump \
    "host=$PG_HOST port=5432 dbname=$DB_NAME \
     user=$DB_ADMIN_USER password=$DB_ADMIN_PASSWORD sslmode=require" \
    --format=custom --compress=9 \
    > "pmis_backup_$(date +%Y%m%d).dump"
```

**從備份還原：**
```bash
# 在 Azure Portal → PostgreSQL → Backup → Restore 操作
# 或使用 CLI 還原至新伺服器
az postgres flexible-server restore \
    --resource-group "$RESOURCE_GROUP" \
    --name "${PG_SERVER_NAME}-restore" \
    --source-server "$PG_SERVER_NAME" \
    --restore-time "2026-03-14T02:00:00Z"
```

### 14.2 長期備份（Azure Storage）

```bash
# 建立 Storage Account 作為長期備份
az storage account create \
    --name "${APP_NAME}backup$(date +%s | tail -c5)" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --access-tier Cool

# 建立備份容器
az storage container create \
    --name "pmis-db-backups" \
    --account-name "${APP_NAME}backup"

# 上傳每日備份（設定為定期任務）
az storage blob upload \
    --container-name "pmis-db-backups" \
    --file "pmis_backup_$(date +%Y%m%d).dump" \
    --name "db/$(date +%Y/%m)/pmis_$(date +%Y%m%d).dump"
```

---

## 15. 成本估算

### 15.1 月費估算（東亞區域）

| 服務 | 規格 | 月費估算 (USD) |
|------|------|--------------|
| Container Apps (Backend) | 1–5 replicas, 1 vCPU, 2GB | $20–60 |
| Container Apps (Frontend) | 1–3 replicas, 0.5 vCPU, 1GB | $5–15 |
| Container Registry | Basic | $5 |
| PostgreSQL Flexible | Standard_D2s_v3, 32GB | $130 |
| Cache for Redis | Standard C1 (1GB) | $55 |
| Log Analytics | 5 GB/月 | $10 |
| Key Vault | 10,000 次操作 | $1 |
| Application Insights | 5 GB/月 | $15 |
| **合計（小型生產）** | | **~$240/月** |

> **節省成本建議：**
> 1. 開發/測試環境使用 Basic SKU（PostgreSQL Standard_B1ms + Redis Basic C0）→ 月費約 $40
> 2. 容器使用消費型計費，設定合理的縮減至 0 閾值
> 3. 使用 Azure Reserved Instances（1–3 年預付折扣約 30–50%）

### 15.2 開發環境成本

| 服務 | 規格 | 月費估算 |
|------|------|---------|
| Container Apps | 最小規格，縮減至 0 | $5 |
| PostgreSQL | Standard_B1ms | $15 |
| Redis | Basic C0 | $16 |
| **合計** | | **~$36/月** |

---

## 16. 故障排除

### 16.1 常見 Azure 問題速查

| 問題 | 診斷指令 | 解決方案 |
|------|---------|---------|
| Container App 無法啟動 | `az containerapp logs show -n $APP -g $RG` | 確認映像存在且可拉取 |
| PostgreSQL 連線失敗 | `az postgres flexible-server show -n $PG -g $RG` | 確認防火牆規則和連線字串 |
| Redis 認證失敗 | `az redis list-keys -n $REDIS -g $RG` | 重新取得 Primary Key |
| ACR 拉取失敗 | `az acr show -n $ACR -g $RG` | 確認 admin-enabled 和密碼 |
| 自訂網域 SSL 錯誤 | Azure Portal → Container App → Ingress | 重新驗證網域所有權 |

### 16.2 Container App 診斷

```bash
# 查看 Revision（版本）狀態
az containerapp revision list \
    --name "${APP_NAME}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --output table

# 強制重新啟動（建立新 Revision）
az containerapp revision restart \
    --name "${APP_NAME}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --revision "$(az containerapp revision list \
        --name ${APP_NAME}-backend \
        --resource-group $RESOURCE_GROUP \
        --query '[0].name' -o tsv)"

# 進入 Container App Shell 除錯
az containerapp exec \
    --name "${APP_NAME}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --command "sh"
```

### 16.3 回滾至前一版本

```bash
# 列出所有 Revision
az containerapp revision list \
    --name "${APP_NAME}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --output table

# 啟用舊版 Revision（流量切換）
az containerapp ingress traffic set \
    --name "${APP_NAME}-backend" \
    --resource-group "$RESOURCE_GROUP" \
    --revision-weight "old-revision-name=100"
```

---

## 附錄 A：部署前確認清單

```
部署前確認：
[ ] Azure 訂閱 ID 已確認
[ ] 有足夠的 Contributor 權限
[ ] 環境變數已設定（SUBSCRIPTION_ID, RESOURCE_GROUP 等）
[ ] .env.production.example 已確認所有必填欄位
[ ] Docker 已安裝並運行
[ ] Azure CLI 已安裝並登入（az login）

部署中確認：
[ ] Resource Group 建立成功
[ ] ACR 建立成功，映像已推送
[ ] PostgreSQL 可連線
[ ] Redis 可連線（PONG 回應）
[ ] Container Apps 狀態為 Running
[ ] DB Migration 執行成功
[ ] Seed 資料已建立

部署後確認：
[ ] https://FQDN/health 回傳 {"status":"ok"}
[ ] https://FQDN/ 能正常顯示前端頁面
[ ] https://FQDN/api/status 回傳三個 ok
[ ] 自動備份已設定
[ ] 監控警報已設定
[ ] 自訂網域已設定（如需要）
```

## 附錄 B：資源清理（下架）

```bash
# ⚠️ 以下操作將永久刪除所有資源和資料！

# 刪除整個 Resource Group（包含所有資源）
az group delete --name "$RESOURCE_GROUP" --yes --no-wait

echo "資源群組刪除請求已送出（可能需要幾分鐘完成）"
```

---

*本手冊適用 xCloudPMIS v1.0，Azure 部署版本。*
*Azure 服務定價和功能可能更新，請以 Azure 官方文件為準：https://azure.microsoft.com/zh-tw/pricing/*
