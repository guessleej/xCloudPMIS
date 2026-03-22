# xCloudPMIS 地端 Docker 部署手冊

**版本：** v1.1
**適用環境：** 地端伺服器 / 私有雲 / 企業內網
**更新日期：** 2026-03-22

---

## 目錄

1. [系統需求](#1-系統需求)
2. [部署架構設計](#2-部署架構設計)
3. [部署前準備](#3-部署前準備)
4. [環境變數設定](#4-環境變數設定)
5. [SSL 憑證設定](#5-ssl-憑證設定)
6. [一鍵部署（自動腳本）](#6-一鍵部署自動腳本)
7. [手動部署（逐步操作）](#7-手動部署逐步操作)
8. [首次資料庫初始化](#8-首次資料庫初始化)
9. [服務管理指令](#9-服務管理指令)
10. [監控與日誌](#10-監控與日誌)
11. [備份與還原](#11-備份與還原)
12. [升版流程](#12-升版流程)
13. [故障排除](#13-故障排除)
14. [安全加固建議](#14-安全加固建議)
15. [防火牆設定](#15-防火牆設定)

---

## 1. 系統需求

### 1.1 伺服器規格

| 環境 | CPU | RAM | 磁碟 | 說明 |
|------|-----|-----|------|------|
| **開發/測試** | 2 核心 | 4 GB | 40 GB SSD | 最低需求 |
| **小型生產** | 4 核心 | 8 GB | 100 GB SSD | 10–50 並發用戶 |
| **標準生產** | 8 核心 | 16 GB | 200 GB SSD | 50–200 並發用戶 |
| **高可用生產** | 16 核心 | 32 GB | 500 GB SSD | 200+ 並發用戶 |

> **財政部案例建議規格：** 8 核心 / 16 GB RAM / 200 GB SSD NVMe（封閉網路環境，預估 20–50 並發用戶）

### 1.2 作業系統

| 作業系統 | 版本 | 狀態 |
|---------|------|------|
| Ubuntu | 22.04 LTS ✅ | **建議（首選）** |
| Debian | 12 (Bookworm) | 支援 |
| RHEL / Rocky / AlmaLinux | 9.x | 支援 |
| Windows Server | 2022 + WSL2 | 不建議（效能較差） |

### 1.3 必要軟體

| 軟體 | 版本需求 | 說明 |
|------|---------|------|
| Docker Engine | 24.0+ | 容器運行環境 |
| Docker Compose | v2.20+ | 多容器編排 |
| OpenSSL | 3.x | SSL 憑證生成 |
| curl | 任意 | 健康檢查 |

> **注意：** 部署腳本 (`deploy/onprem/setup.sh`) 會自動安裝 Docker 和 Docker Compose。

### 1.4 網路需求

| 連線方向 | 埠號 | 說明 |
|---------|------|------|
| 外部 → 伺服器 | 80 (HTTP) | 自動 redirect 至 HTTPS |
| 外部 → 伺服器 | 443 (HTTPS) | 主要應用程式入口 |
| 伺服器內部 | 3010 | Backend API（僅容器內部） |
| 伺服器內部 | 5432 | PostgreSQL（僅容器內部） |
| 伺服器內部 | 6379 | Redis（僅容器內部） |
| 伺服器內部 | 1234 | Yjs WebSocket（僅容器內部） |

---

## 2. 部署架構設計

### 2.1 容器架構圖

```
╔══════════════════════════════════════════════════════════════╗
║                         Internet / Intranet                  ║
╚══════════════════════════════════════════════════════════════╝
                              │
                              ▼ :443 (HTTPS) / :80 (HTTP redirect)
╔══════════════════════════════════════════════════════════════╗
║  Nginx Reverse Proxy (pmis-nginx)                            ║
║  - SSL/TLS 終止（TLS 1.2 / 1.3）                            ║
║  - 路由分發：/ → Frontend, /api → Backend                    ║
║  - Gzip 壓縮、安全 Headers、靜態快取                         ║
╠══════════╦═════════════════════════╦═══════════════════════  ║
           │                         │
           ▼ :80                     ▼ :3010
╔══════════════════╗   ╔══════════════════════════════════╗
║ pmis-frontend    ║   ║ pmis-backend                     ║
║ Nginx + React    ║   ║ Node.js 20 + Express             ║
║ SPA 靜態服務     ║   ║ Prisma ORM + Redis 快取          ║
╚══════════════════╝   ╚═══════════╦══════════╦═══════════╝
                                   │          │
                      ▼ :5432      │          │ :6379
             ╔═════════════════╗   │   ╔══════════════════╗
             ║ pmis-db         ║◄──┘   ║ pmis-redis       ║
             ║ PostgreSQL 15   ║       ║ Redis 7          ║
             ║ Named Volume    ║       ║ Named Volume     ║
             ╚═════════════════╝       ╚══════════════════╝

╔══════════════════╗   ╔══════════════════════════════════╗
║ pmis-collab      ║   ║ pmis-monitor                     ║
║ Yjs WebSocket    ║   ║ AI 風險掃描代理（背景）           ║
║ :1234            ║   ║ Cron 定時執行                    ║
╚══════════════════╝   ╚══════════════════════════════════╝
```

### 2.2 資料流說明

| 請求路徑 | 流程 |
|---------|------|
| `https://域名/` | Nginx → pmis-frontend（靜態 HTML/JS/CSS） |
| `https://域名/api/*` | Nginx → pmis-backend → PostgreSQL / Redis |
| `https://域名/auth/*` | Nginx → pmis-backend（OAuth 2.0 流程） |
| `https://域名/collab/*` | Nginx → pmis-collab（WebSocket 升級） |

### 2.3 Docker Volume 說明

| Volume 名稱 | 用途 | 位置 |
|------------|------|------|
| `postgres_data` | PostgreSQL 資料檔案 | Docker managed |
| `redis_data` | Redis RDB / AOF 快照 | Docker managed |
| `nginx_logs` | Nginx 存取與錯誤日誌 | Docker managed |

---

## 3. 部署前準備

### 3.1 取得專案原始碼

```bash
# 方法一：從 Git 克隆（推薦）
git clone https://your-repo/xCloudPMIS.git /opt/pmis
cd /opt/pmis

# 方法二：上傳已打包的 tar.gz
scp pmis-v1.0.0.tar.gz admin@server:/opt/
ssh admin@server
cd /opt && tar -xzf pmis-v1.0.0.tar.gz
cd pmis
```

### 3.2 打包應用程式（從開發機）

```bash
# 在開發機的 NewCode/ 目錄執行
cd /path/to/NewCode

# 打包（排除不需要的目錄）
tar -czf pmis-v1.0.0.tar.gz \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.env' \
    --exclude='frontend/dist' \
    --exclude='*.log' \
    .

echo "打包完成：pmis-v1.0.0.tar.gz ($(du -sh pmis-v1.0.0.tar.gz | cut -f1))"

# 上傳至地端伺服器
scp pmis-v1.0.0.tar.gz admin@your-server:/opt/
```

### 3.3 伺服器初始設定（首次）

```bash
# 以 root 登入伺服器
ssh root@your-server

# 更新系統
apt-get update && apt-get upgrade -y

# 建立專用帳號（非 root 運行）
useradd -m -s /bin/bash pmisadmin
usermod -aG sudo pmisadmin
usermod -aG docker pmisadmin

# 建立專案目錄
mkdir -p /opt/pmis
chown pmisadmin:pmisadmin /opt/pmis

# 解壓縮
cd /opt && tar -xzf pmis-v1.0.0.tar.gz -C /opt/pmis
```

---

## 4. 環境變數設定

### 4.1 建立 .env 檔案

```bash
cd /opt/pmis

# 從範本複製
cp .env.production.example .env

# 編輯設定
nano .env
```

### 4.2 必填環境變數說明

```bash
# ════════════════════════════════
# 【必填】基本設定
# ════════════════════════════════

# 對外網址（用於 OAuth callback，不含尾部 /）
APP_URL=https://pmis.your-company.com

# ════════════════════════════════
# 【必填】資料庫
# ════════════════════════════════
DB_USER=pmis_user
DB_PASSWORD=請使用至少32字元強密碼      # openssl rand -base64 32
DB_NAME=pmis_db
DATABASE_URL=postgresql://pmis_user:YOUR_PASSWORD@pmis-db:5432/pmis_db

# ════════════════════════════════
# 【必填】Redis
# ════════════════════════════════
REDIS_PASSWORD=請使用至少32字元強密碼   # openssl rand -base64 32

# ════════════════════════════════
# 【必填】JWT 密鑰
# ════════════════════════════════
JWT_SECRET=請使用至少64字元隨機字串     # openssl rand -hex 64

# ════════════════════════════════
# 【選填】Microsoft 365 整合
# ════════════════════════════════
O365_CLIENT_ID=
O365_CLIENT_SECRET=
O365_TENANT_ID=
O365_REDIRECT_URI=https://pmis.your-company.com/auth/microsoft/callback

# ════════════════════════════════
# 【選填】OpenAI（AI 決策中心）
# ════════════════════════════════
OPENAI_API_KEY=sk-...（可空白，AI 功能將不可用）
```

### 4.3 生成安全密碼

```bash
# 生成 DB 密碼（32 字元）
openssl rand -base64 32

# 生成 Redis 密碼（32 字元）
openssl rand -base64 32

# 生成 JWT Secret（64 字元 hex）
openssl rand -hex 64
```

---

## 5. SSL 憑證設定

### 5.1 選項 A：使用 Let's Encrypt（公開網際網路，有網域名稱）

```bash
# 安裝 Certbot
apt-get install -y certbot

# 取得憑證（請先確認 80 port 可從外部訪問）
certbot certonly --standalone \
    -d pmis.your-company.com \
    --agree-tos \
    --email admin@your-company.com \
    --non-interactive

# 複製憑證至專案目錄
cp /etc/letsencrypt/live/pmis.your-company.com/fullchain.pem \
    /opt/pmis/docker/nginx/ssl/cert.pem
cp /etc/letsencrypt/live/pmis.your-company.com/privkey.pem \
    /opt/pmis/docker/nginx/ssl/key.pem
chmod 600 /opt/pmis/docker/nginx/ssl/key.pem

# 設定自動更新（Cron）
echo "0 0 1 * * certbot renew --quiet && \
    cp /etc/letsencrypt/live/pmis.your-company.com/fullchain.pem \
       /opt/pmis/docker/nginx/ssl/cert.pem && \
    cp /etc/letsencrypt/live/pmis.your-company.com/privkey.pem \
       /opt/pmis/docker/nginx/ssl/key.pem && \
    docker exec pmis-nginx nginx -s reload" | crontab -
```

### 5.2 選項 B：自簽憑證（地端封閉網路，如財政部案例）

```bash
cd /opt/pmis

# 生成 10 年有效期的自簽憑證
openssl req -x509 -newkey rsa:4096 \
    -keyout docker/nginx/ssl/key.pem \
    -out docker/nginx/ssl/cert.pem \
    -days 3650 -nodes \
    -subj "/CN=pmis.internal/O=Ministry of Finance/C=TW" \
    -addext "subjectAltName=DNS:pmis.internal,DNS:pmis.mof.gov.tw,IP:192.168.1.100"

chmod 600 docker/nginx/ssl/key.pem
echo "自簽憑證已生成（有效至 $(date -d '+10 years' '+%Y-%m-%d')）"
```

> **地端部署注意事項：** 使用自簽憑證時，使用者瀏覽器會顯示安全警告。請聯繫組織 IT 部門將憑證加入企業信任清單（Enterprise CA），或改用組織自有 CA 簽發的憑證。

### 5.3 選項 C：使用企業內部 CA 憑證

```bash
# 假設企業 CA 已簽發 cert.crt 和 cert.key
cp /path/to/pmis.your-company.com.crt /opt/pmis/docker/nginx/ssl/cert.pem
cp /path/to/pmis.your-company.com.key /opt/pmis/docker/nginx/ssl/key.pem
chmod 600 /opt/pmis/docker/nginx/ssl/key.pem
```

---

## 6. 一鍵部署（自動腳本）

```bash
cd /opt/pmis

# 賦予腳本執行權限
chmod +x deploy/onprem/setup.sh deploy/onprem/backup.sh

# 執行部署腳本
sudo bash deploy/onprem/setup.sh
```

腳本會自動完成：
1. ✅ 安裝 Docker & Docker Compose
2. ✅ 建立必要目錄
3. ✅ 驗證 .env 檔案
4. ✅ 生成 SSL 憑證（如不存在）
5. ✅ 構建 Docker 映像
6. ✅ 啟動所有服務
7. ✅ 等待資料庫就緒
8. ✅ 執行 Prisma Migration
9. ✅ 設定自動備份 Cron

---

## 7. 手動部署（逐步操作）

如需要更精細的控制，可使用以下手動步驟：

### Step 1：確認 .env 和 SSL 憑證已就緒

```bash
ls -la /opt/pmis/.env
ls -la /opt/pmis/docker/nginx/ssl/
# 應看到 cert.pem 和 key.pem
```

### Step 2：構建 Docker 映像

```bash
cd /opt/pmis

# 構建所有映像（含 frontend 和 backend）
docker compose -f docker-compose.prod.yml build

# 若需單獨構建
docker compose -f docker-compose.prod.yml build pmis-frontend
docker compose -f docker-compose.prod.yml build pmis-backend
```

### Step 3：啟動資料庫和快取（先起）

```bash
docker compose -f docker-compose.prod.yml up -d pmis-db pmis-redis

# 等待資料庫健康
echo "等待 PostgreSQL 就緒..."
until docker compose -f docker-compose.prod.yml exec -T pmis-db \
    pg_isready -U pmis_user; do sleep 2; done
echo "✅ PostgreSQL 就緒"
```

### Step 4：執行資料庫 Migration

```bash
# 啟動 backend 容器執行 migration
docker compose -f docker-compose.prod.yml up -d pmis-backend

# 執行 Prisma migration（套用所有 schema 變更）
docker compose -f docker-compose.prod.yml exec pmis-backend \
    npx prisma migrate deploy

# 確認 migration 狀態
docker compose -f docker-compose.prod.yml exec pmis-backend \
    npx prisma migrate status
```

### Step 5：初始化資料（首次部署）

```bash
# 執行 Prisma seed（建立預設公司、管理員帳號）
docker compose -f docker-compose.prod.yml exec pmis-backend \
    npx prisma db seed

echo "✅ 初始資料已建立"
```

### Step 6：啟動所有服務

```bash
docker compose -f docker-compose.prod.yml up -d

# 查看啟動狀態
docker compose -f docker-compose.prod.yml ps
```

**預期輸出（所有服務 healthy）：**
```
NAME            STATUS                   PORTS
pmis-nginx      Up 30 seconds (healthy)  0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
pmis-frontend   Up 45 seconds (healthy)  80/tcp
pmis-backend    Up 60 seconds (healthy)  3010/tcp
pmis-collab     Up 60 seconds            1234/tcp
pmis-monitor    Up 60 seconds
pmis-db         Up 90 seconds (healthy)  5432/tcp
pmis-redis      Up 90 seconds (healthy)  6379/tcp
```

### Step 7：驗證部署

```bash
# 健康檢查
curl -k https://localhost/health
# 預期：{"status":"ok","service":"pmis-backend",...}

# API 狀態
curl -k https://localhost/api/status
# 預期：{"backend":{"status":"ok"},"database":{"status":"ok"},"cache":{"status":"ok"}}

# 前端頁面
curl -k -I https://localhost/
# 預期：HTTP/2 200
```

---

## 8. 首次資料庫初始化

### 8.1 Prisma Migration

```bash
# 查看目前 migration 狀態
docker compose -f docker-compose.prod.yml exec pmis-backend \
    npx prisma migrate status

# 套用所有 pending migration
docker compose -f docker-compose.prod.yml exec pmis-backend \
    npx prisma migrate deploy
```

### 8.2 建立初始資料

```bash
# 執行 seed（建立：預設公司 + 管理員帳號）
docker compose -f docker-compose.prod.yml exec pmis-backend \
    npx prisma db seed

# 確認資料
docker compose -f docker-compose.prod.yml exec pmis-db \
    psql -U pmis_user pmis_db -c "SELECT name, email FROM \"User\";"
```

### 8.3 手動匯入財政部案例資料（選用）

```bash
# 複製 seed 腳本至容器
docker cp backend/seed_mof.js pmis-backend:/app/

# 執行
docker exec pmis-backend node /app/seed_mof.js
```

---

## 9. 服務管理指令

```bash
cd /opt/pmis

# ── 查看狀態 ─────────────────────────────────────────────
docker compose -f docker-compose.prod.yml ps

# ── 查看日誌 ─────────────────────────────────────────────
docker compose -f docker-compose.prod.yml logs -f              # 全部
docker compose -f docker-compose.prod.yml logs -f pmis-backend # 單一服務
docker compose -f docker-compose.prod.yml logs --tail=100 pmis-db

# ── 重啟服務 ─────────────────────────────────────────────
docker compose -f docker-compose.prod.yml restart pmis-backend
docker compose -f docker-compose.prod.yml restart              # 全部重啟

# ── 停止服務 ─────────────────────────────────────────────
docker compose -f docker-compose.prod.yml stop    # 停止，保留 volume
docker compose -f docker-compose.prod.yml down    # 停止並移除容器

# ── 危險：完全清除（含資料）──────────────────────────────
# docker compose -f docker-compose.prod.yml down -v   # ⚠️ 會刪除所有 volume！

# ── 執行一次性指令 ────────────────────────────────────────
docker compose -f docker-compose.prod.yml exec pmis-backend node -e "console.log('ok')"
docker compose -f docker-compose.prod.yml exec pmis-db psql -U pmis_user pmis_db
```

---

## 10. 監控與日誌

### 10.1 即時資源監控

```bash
# 查看所有容器資源使用
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# 只看 pmis 容器
docker stats $(docker ps --filter "name=pmis" --format "{{.Names}}")
```

### 10.2 Nginx 存取日誌分析

```bash
# 查看 Nginx 存取日誌
docker exec pmis-nginx tail -f /var/log/nginx/access.log

# 統計最多請求的路徑
docker exec pmis-nginx awk '{print $7}' /var/log/nginx/access.log | \
    sort | uniq -c | sort -rn | head -20

# 查看 5xx 錯誤
docker exec pmis-nginx grep ' 5[0-9][0-9] ' /var/log/nginx/access.log | tail -50
```

### 10.3 PostgreSQL 監控

```bash
# 查看目前連線數
docker exec pmis-db psql -U pmis_user pmis_db \
    -c "SELECT count(*) as connections FROM pg_stat_activity;"

# 查看資料表大小
docker exec pmis-db psql -U pmis_user pmis_db \
    -c "SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::regclass))
        FROM pg_tables WHERE schemaname='public' ORDER BY 2 DESC;"

# 查看慢查詢（需要啟用 pg_stat_statements）
docker exec pmis-db psql -U pmis_user pmis_db \
    -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements
        ORDER BY mean_exec_time DESC LIMIT 10;"
```

### 10.4 Redis 監控

```bash
# Redis 資訊
docker exec pmis-redis redis-cli -a $REDIS_PASSWORD INFO stats

# 監控即時指令
docker exec pmis-redis redis-cli -a $REDIS_PASSWORD MONITOR

# 查看記憶體使用
docker exec pmis-redis redis-cli -a $REDIS_PASSWORD INFO memory | \
    grep "used_memory_human"
```

### 10.5 設定系統警報（建議）

```bash
# 安裝 Netdata（開源系統監控，視覺化 Dashboard）
curl https://my-netdata.io/kickstart.sh | bash

# 或安裝 Prometheus + Grafana（企業級監控）
# 詳見 docs/monitoring/prometheus-setup.md
```

---

## 11. 備份與還原

### 11.1 自動備份

自動備份已在部署時設定（每日凌晨 2:00）：

```bash
# 確認備份 Cron 已設定
crontab -l | grep pmis

# 手動觸發備份
bash /opt/pmis/deploy/onprem/backup.sh

# 查看備份清單
ls -lh /opt/pmis/backups/
```

### 11.2 手動備份

```bash
cd /opt/pmis

# PostgreSQL 備份
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker compose -f docker-compose.prod.yml exec -T pmis-db \
    pg_dump -U pmis_user pmis_db --format=custom --compress=9 \
    > backups/db_manual_${TIMESTAMP}.dump

echo "備份完成：backups/db_manual_${TIMESTAMP}.dump"
```

### 11.3 資料庫還原

```bash
cd /opt/pmis
BACKUP_FILE="backups/db_20260315_020000.dump"

# 停止 backend（避免寫入衝突）
docker compose -f docker-compose.prod.yml stop pmis-backend pmis-monitor

# 還原資料庫
docker compose -f docker-compose.prod.yml exec -T pmis-db \
    pg_restore -U pmis_user -d pmis_db --clean --if-exists \
    < "$BACKUP_FILE"

# 重新啟動
docker compose -f docker-compose.prod.yml start pmis-backend pmis-monitor

echo "✅ 資料庫還原完成"
```

### 11.4 異地備份（推薦）

```bash
# 將備份同步至異地儲存（rsync 到另一台伺服器）
rsync -avz --delete /opt/pmis/backups/ \
    backup-server:/pmis-backup/production/

# 或上傳至 S3 相容儲存
aws s3 sync /opt/pmis/backups/ s3://your-bucket/pmis-backups/ \
    --storage-class STANDARD_IA
```

---

## 12. 升版流程

### 12.1 零停機升版（推薦）

```bash
cd /opt/pmis

# Step 1: 拉取新版原始碼
git pull origin main

# Step 2: 備份資料庫
bash deploy/onprem/backup.sh

# Step 3: 構建新映像
docker compose -f docker-compose.prod.yml build

# Step 4: 滾動更新（不中斷服務）
docker compose -f docker-compose.prod.yml up -d --no-deps pmis-backend
sleep 10
docker compose -f docker-compose.prod.yml up -d --no-deps pmis-frontend
docker compose -f docker-compose.prod.yml up -d --no-deps pmis-nginx

# Step 5: 執行 Migration（如有新版 schema）
docker compose -f docker-compose.prod.yml exec pmis-backend \
    npx prisma migrate deploy

# Step 6: 驗證
curl -k https://localhost/health
```

### 12.2 回滾（緊急降版）

```bash
# 查看映像版本清單
docker images | grep pmis

# 使用舊版映像重新啟動
APP_VERSION=1.0.0 docker compose -f docker-compose.prod.yml up -d pmis-backend

# 若需要回滾資料庫
# bash deploy/onprem/restore.sh backups/db_TIMESTAMP.dump
```

---

## 13. 故障排除

### 13.1 常見問題速查表

| 問題 | 檢查指令 | 可能原因 |
|------|---------|---------|
| 無法訪問網頁 | `docker ps \| grep pmis-nginx` | Nginx 容器未運行 |
| API 回傳 502 | `docker logs pmis-backend --tail=50` | Backend 崩潰或未就緒 |
| 登入失敗 | `docker logs pmis-db --tail=20` | PostgreSQL 連線異常 |
| 速度很慢 | `docker stats` | 資源不足、Redis 未連線 |
| SSL 警告 | `openssl verify docker/nginx/ssl/cert.pem` | 憑證過期或設定錯誤 |

### 13.2 詳細排錯步驟

**問題：容器反覆重啟（CrashLoopBackOff）**

```bash
# 查看最近日誌
docker compose -f docker-compose.prod.yml logs --tail=100 pmis-backend

# 常見原因：
# 1. .env 設定錯誤 → 仔細確認 DB_PASSWORD 等變數
# 2. 資料庫連線失敗 → 確認 pmis-db 已 healthy
# 3. Port 衝突 → sudo lsof -i:3010

# 測試容器內的環境變數
docker compose -f docker-compose.prod.yml run --rm pmis-backend env | grep DB_
```

**問題：PostgreSQL 無法啟動**

```bash
docker logs pmis-db 2>&1 | tail -30

# 常見原因：
# 1. Volume 資料損毀 → 還原備份
# 2. 磁碟空間不足 → df -h
# 3. 密碼設定不一致 → 確認 .env 的 DB_PASSWORD

# 磁碟空間檢查
df -h /var/lib/docker
```

**問題：Redis 認證失敗**

```bash
docker logs pmis-redis 2>&1 | tail -20

# 測試連線
docker exec pmis-redis redis-cli -a YOUR_REDIS_PASSWORD ping
# 預期：PONG
```

**問題：Nginx SSL 錯誤**

```bash
# 驗證設定
docker exec pmis-nginx nginx -t

# 確認憑證有效期
openssl x509 -in docker/nginx/ssl/cert.pem -noout -dates

# 手動重載 Nginx 設定
docker exec pmis-nginx nginx -s reload
```

---

## 14. 安全加固建議

### 14.1 作業系統層級

```bash
# 自動安全更新
apt-get install -y unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades

# 安裝 fail2ban（防暴力破解）
apt-get install -y fail2ban
systemctl enable --now fail2ban

# 停用不必要的服務
systemctl disable bluetooth cups avahi-daemon
```

### 14.2 Docker 安全設定

```bash
# 確認 Docker 以 rootless 模式或使用者命名空間運行
# 在 docker-compose.prod.yml 中，backend 已設定 USER nodeuser（非 root）

# 限制容器不可獲得新權限
# docker-compose.prod.yml 已包含 security_opt: no-new-privileges:true
```

### 14.3 .env 檔案保護

```bash
# 設定嚴格權限（只有 owner 可讀）
chmod 600 /opt/pmis/.env
chown pmisadmin:pmisadmin /opt/pmis/.env

# 確認未加入 git
cat /opt/pmis/.gitignore | grep .env
```

### 14.4 資料庫安全

```bash
# 確認 PostgreSQL 只接受容器內部連線（不對外暴露 5432）
docker compose -f docker-compose.prod.yml ps pmis-db
# 應只看到 "5432/tcp"，不含 0.0.0.0:5432

# 定期輪換密碼（建議每 90 天）
# 1. 更新 .env 中的 DB_PASSWORD
# 2. 重新啟動相關容器
```

---

## 15. 防火牆設定

### 15.1 UFW（Ubuntu）

```bash
# 啟用 UFW
ufw enable

# 允許 SSH（重要！先設定避免鎖住）
ufw allow 22/tcp

# 允許 HTTP 和 HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# 拒絕所有其他入站
ufw default deny incoming
ufw default allow outgoing

# 確認狀態
ufw status verbose
```

### 15.2 firewalld（RHEL / Rocky）

```bash
# 啟用 firewalld
systemctl enable --now firewalld

# 允許 HTTP 和 HTTPS
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --permanent --add-service=ssh
firewall-cmd --reload

# 確認狀態
firewall-cmd --list-all
```

### 15.3 政府/企業內網額外設定

```bash
# 僅允許特定 IP 範圍訪問（如財政部內網 192.168.0.0/16）
ufw allow from 192.168.0.0/16 to any port 443
ufw allow from 192.168.0.0/16 to any port 80
ufw delete allow 80/tcp    # 移除不限 IP 的規則
ufw delete allow 443/tcp

# 禁止所有外部訪問（完全封閉網路）
ufw default deny incoming
```

---

## 附錄：常用指令速查

```bash
# 查看所有容器狀態
docker compose -f docker-compose.prod.yml ps

# 查看即時日誌（按 Ctrl+C 退出）
docker compose -f docker-compose.prod.yml logs -f

# 重新啟動特定服務
docker compose -f docker-compose.prod.yml restart [服務名稱]

# 進入容器 Shell
docker exec -it pmis-backend sh
docker exec -it pmis-db psql -U pmis_user pmis_db

# 查看 Docker 磁碟使用
docker system df

# 清理未使用的映像（定期執行）
docker system prune --filter "until=720h"

# 查看網路設定
docker network inspect pmis-net
```

---

*本手冊適用 xCloudPMIS v1.0，地端 Docker 部署版本。*
*如有問題，請聯繫系統管理員或查閱 `/opt/pmis/docs/` 中的其他技術文件。*
