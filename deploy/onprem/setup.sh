#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# xCloudPMIS — 地端 Docker 自動部署腳本
# ════════════════════════════════════════════════════════════
# 適用：Ubuntu 22.04 LTS / Debian 12 / RHEL 9
# 執行：sudo bash deploy/onprem/setup.sh
# ════════════════════════════════════════════════════════════
set -euo pipefail

# ── 顏色輸出 ─────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── 設定變數 ─────────────────────────────────────────────────
PROJECT_DIR="${PROJECT_DIR:-/opt/pmis}"
APP_VERSION="${APP_VERSION:-1.0.0}"
COMPOSE_FILE="docker-compose.prod.yml"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   xCloudPMIS 地端部署腳本 v${APP_VERSION}          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Step 1: 確認以 root 或 sudo 執行 ─────────────────────────
if [[ $EUID -ne 0 ]]; then
    error "請以 root 或 sudo 執行此腳本"
fi

# ── Step 2: 偵測作業系統 ─────────────────────────────────────
info "偵測作業系統..."
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
    info "作業系統：$OS $VER"
else
    error "無法偵測作業系統"
fi

# ── Step 3: 安裝 Docker ───────────────────────────────────────
install_docker() {
    info "安裝 Docker..."
    if command -v docker &>/dev/null; then
        success "Docker 已安裝：$(docker --version)"
        return
    fi

    if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
        apt-get update -qq
        apt-get install -y -qq ca-certificates curl gnupg lsb-release
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
            gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
            https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
            tee /etc/apt/sources.list.d/docker.list > /dev/null
        apt-get update -qq
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    elif [[ "$OS" == *"Red Hat"* ]] || [[ "$OS" == *"Rocky"* ]] || [[ "$OS" == *"AlmaLinux"* ]]; then
        dnf install -y dnf-plugins-core
        dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
        dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        systemctl enable --now docker
    else
        error "不支援的作業系統：$OS"
    fi

    systemctl enable --now docker
    success "Docker 安裝完成：$(docker --version)"
}

install_docker

# ── Step 4: 建立專案目錄 ─────────────────────────────────────
info "建立專案目錄：$PROJECT_DIR"
mkdir -p "$PROJECT_DIR"/{docker/nginx/ssl,backups,logs}

# ── Step 5: 複製專案檔案 ─────────────────────────────────────
if [ ! -f "$PROJECT_DIR/docker-compose.prod.yml" ]; then
    info "複製專案檔案..."
    # 假設腳本從專案根目錄執行
    cp -r . "$PROJECT_DIR/"
    success "檔案複製完成"
fi

cd "$PROJECT_DIR"

# ── Step 6: 設定環境變數 ─────────────────────────────────────
if [ ! -f .env ]; then
    warn ".env 檔案不存在，從範本複製..."
    cp .env.production.example .env
    warn "⚠️  請編輯 .env 填入真實值後，重新執行此腳本"
    warn "    nano $PROJECT_DIR/.env"
    exit 0
fi

success ".env 檔案已存在"

# ── Step 7: 生成 SSL 自簽憑證（如尚未存在）──────────────────
if [ ! -f docker/nginx/ssl/cert.pem ]; then
    info "生成自簽 SSL 憑證（適用於內網，正式環境請替換為 CA 憑證）..."
    DOMAIN=$(grep APP_URL .env | cut -d= -f2 | sed 's|https://||' | sed 's|/.*||')
    openssl req -x509 -newkey rsa:4096 -keyout docker/nginx/ssl/key.pem \
        -out docker/nginx/ssl/cert.pem -days 3650 -nodes \
        -subj "/CN=${DOMAIN:-pmis.internal}/O=xCloudPMIS/C=TW" \
        -addext "subjectAltName=DNS:${DOMAIN:-pmis.internal},DNS:localhost,IP:127.0.0.1" \
        2>/dev/null
    chmod 600 docker/nginx/ssl/key.pem
    success "SSL 憑證已生成（有效期：10 年）"
else
    success "SSL 憑證已存在"
fi

# ── Step 8: 構建 Docker 映像 ─────────────────────────────────
info "構建 Docker 映像（這可能需要幾分鐘）..."
docker compose -f "$COMPOSE_FILE" build --no-cache
success "映像構建完成"

# ── Step 9: 啟動服務 ─────────────────────────────────────────
info "啟動所有服務..."
docker compose -f "$COMPOSE_FILE" up -d
success "服務啟動完成"

# ── Step 10: 等待資料庫就緒 ──────────────────────────────────
info "等待 PostgreSQL 就緒..."
for i in {1..30}; do
    if docker compose -f "$COMPOSE_FILE" exec -T pmis-db \
        pg_isready -U "$(grep DB_USER .env | cut -d= -f2)" &>/dev/null; then
        success "PostgreSQL 已就緒"
        break
    fi
    if [ $i -eq 30 ]; then
        error "PostgreSQL 啟動逾時，請檢查：docker logs pmis-db"
    fi
    sleep 2
done

# ── Step 11: 執行資料庫 Migration ────────────────────────────
info "執行 Prisma 資料庫 Migration..."
docker compose -f "$COMPOSE_FILE" exec pmis-backend \
    npx prisma migrate deploy
success "Migration 完成"

# ── Step 12: 執行 Seed（首次部署）────────────────────────────
read -p "是否執行初始資料 Seed？（僅首次部署）[y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -r -p "請輸入管理員 Email（SEED_ADMIN_EMAIL）: " SEED_ADMIN_EMAIL
    if [[ -z "$SEED_ADMIN_EMAIL" ]]; then
        warn "未輸入管理員 Email，略過 Seed"
    else
        read -r -s -p "請輸入管理員密碼（SEED_ADMIN_PASSWORD）: " SEED_ADMIN_PASSWORD
        echo
        if [[ -z "$SEED_ADMIN_PASSWORD" ]]; then
            warn "未輸入管理員密碼，略過 Seed"
        else
            docker compose -f "$COMPOSE_FILE" exec \
                -e SEED_ADMIN_EMAIL="$SEED_ADMIN_EMAIL" \
                -e SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" \
                pmis-backend \
                npx prisma db seed
            success "Seed 資料已建立"
        fi
    fi
fi

# ── Step 13: 健康檢查 ─────────────────────────────────────────
info "執行健康檢查..."
sleep 5
if curl -sf http://localhost/health &>/dev/null; then
    success "系統健康檢查通過 ✓"
else
    warn "健康檢查未通過，請確認服務狀態：docker compose -f $COMPOSE_FILE ps"
fi

# ── Step 14: 設定自動備份 Cron ────────────────────────────────
CRON_JOB="0 2 * * * $PROJECT_DIR/deploy/onprem/backup.sh >> $PROJECT_DIR/logs/backup.log 2>&1"
(crontab -l 2>/dev/null | grep -v "pmis"; echo "$CRON_JOB") | crontab -
success "自動備份 Cron 已設定（每日凌晨 2:00）"

# ── 完成摘要 ─────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              部署完成！                              ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  系統網址：https://$(grep APP_URL .env | cut -d= -f2 | sed 's|https://||')  ║"
echo "║  健康狀態：http://localhost/health                   ║"
echo "║                                                      ║"
echo "║  常用指令：                                          ║"
echo "║    查看狀態：docker compose -f $COMPOSE_FILE ps     ║"
echo "║    查看日誌：docker compose -f $COMPOSE_FILE logs   ║"
echo "║    停止服務：docker compose -f $COMPOSE_FILE down   ║"
echo "╚══════════════════════════════════════════════════════╝"
